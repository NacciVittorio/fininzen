import logging

from django.db.models import Q
from django.http import Http404
from django.shortcuts import get_object_or_404
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from fininzen.permissions import IsNotDemoUser

from ..balances import (
    compute_balances,
    serialize_balances,
    serialize_simplified_transactions,
    simplify_debts,
)
from ..models import (
    SplitContact,
    SplitExpenseShare,
    SplitGroup,
    SplitParticipant,
    SplitSettlement,
)
from ..permissions import user_can_access_group
from ..serializers import (
    SplitGroupSerializer,
    SplitParticipantInputSerializer,
    SplitParticipantSerializer,
)

logger = logging.getLogger(__name__)


class SplitGroupViewSet(viewsets.ModelViewSet):
    """CRUD gruppi + sotto-risorsa membri.

    Autorizzazione via membership (user_can_access_group), MAI via
    ViewAsMixin/get_effective_user — vedi piano sez. 0.2: qui la relazione è
    tra pari (co-titolarità), non una delega owner→grantee.
    """

    permission_classes = [IsAuthenticated, IsNotDemoUser]
    serializer_class = SplitGroupSerializer

    def get_queryset(self):
        user = self.request.user
        return (
            SplitGroup.objects.filter(
                Q(created_by=user)
                | Q(participants__user=user, participants__is_active=True)
            )
            .distinct()
            .order_by("-created_at", "id")
        )

    def get_object(self):
        obj = super().get_object()
        if not user_can_access_group(self.request.user, obj):
            raise Http404
        return obj

    def perform_create(self, serializer):
        group = serializer.save(created_by=self.request.user)
        # The creator is automatically an active member of their own group.
        SplitParticipant.objects.create(
            group=group, user=self.request.user, added_by=self.request.user
        )

    @action(detail=True, methods=["get", "post"], url_path="members")
    def members(self, request, pk=None):
        group = self.get_object()
        if request.method == "GET":
            qs = group.participants.filter(is_active=True).select_related(
                "user", "contact"
            )
            return Response(SplitParticipantSerializer(qs, many=True).data)

        serializer = SplitParticipantInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user_id = serializer.validated_data.get("user_id")
        contact_id = serializer.validated_data.get("contact_id")

        if user_id:
            is_self = user_id == request.user.id
            # A registered-user member must already be a linked partner
            # (accepted SplitPartnerLink → reciprocal SplitContact), matching
            # decision #1: no ad-hoc adding of arbitrary user ids.
            is_linked_partner = SplitContact.objects.filter(
                owner=request.user, linked_user_id=user_id, is_archived=False
            ).exists()
            if not (is_self or is_linked_partner):
                return Response(
                    {"error": "not_a_linked_partner"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            participant, _created = SplitParticipant.objects.update_or_create(
                group=group,
                user_id=user_id,
                defaults={"is_active": True, "added_by": request.user},
            )
        else:
            contact = get_object_or_404(SplitContact, pk=contact_id, owner=request.user)
            participant, _created = SplitParticipant.objects.update_or_create(
                group=group,
                contact=contact,
                defaults={"is_active": True, "added_by": request.user},
            )
        logger.info(
            "SplitGroupViewSet.members POST: group=%s participant=%s",
            group.id,
            participant.id,
        )
        return Response(
            SplitParticipantSerializer(participant).data,
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=["get"], url_path="balances")
    def balances(self, request, pk=None):
        """Saldo netto per membro del gruppo, spese e settlement inclusi
        (piano sez. 3.2/6)."""
        group = self.get_object()
        share_qs = SplitExpenseShare.objects.filter(expense__group=group)
        settlement_qs = SplitSettlement.objects.filter(group=group)
        balances = compute_balances(share_qs, settlement_qs)
        return Response(serialize_balances(balances))

    @action(detail=True, methods=["get"], url_path="simplify")
    def simplify(self, request, pk=None):
        """GET /api/split/groups/{id}/simplify/ (piano sez. 3.3/6): lista
        minima di transazioni suggerite per azzerare i saldi correnti del
        gruppo (spese + settlement già registrati)."""
        group = self.get_object()
        share_qs = SplitExpenseShare.objects.filter(expense__group=group)
        settlement_qs = SplitSettlement.objects.filter(group=group)
        balances = compute_balances(share_qs, settlement_qs)
        transactions = simplify_debts(balances)
        return Response(serialize_simplified_transactions(transactions))

    @action(
        detail=True,
        methods=["delete"],
        url_path=r"members/(?P<member_id>\d+)",
    )
    def remove_member(self, request, pk=None, member_id=None):
        group = self.get_object()
        # Piano Batch 4.6: previously any active member could remove any
        # other member, including the founder — restricted to the group's
        # creator only, the classic single-admin model (mirrors how the
        # creator is already auto-added as a member on group creation).
        # `created_by` can be None (the original creator deleted their
        # account — anonymize_split_identity_for_user, piano Batch 1.2):
        # with no creator to defer to, fall back to the pre-4.6 behavior
        # for this group specifically rather than locking membership
        # changes out permanently.
        if group.created_by_id is not None and group.created_by_id != request.user.id:
            return Response(
                {"error": "only_group_creator_can_remove_members"},
                status=status.HTTP_403_FORBIDDEN,
            )
        # Soft-remove (is_active=False), not a hard delete: shares on past
        # expenses reference this participant via PROTECT, and balance
        # queries (next phase) key off is_active to know who's still "in".
        participant = get_object_or_404(SplitParticipant, pk=member_id, group=group)
        participant.is_active = False
        participant.save(update_fields=["is_active"])
        return Response(status=status.HTTP_204_NO_CONTENT)
