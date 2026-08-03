import logging

from django.db.models import Q
from django.shortcuts import get_object_or_404
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from fininzen.permissions import IsNotDemoUser
from fininzen.throttles import SplitLinkRateThrottle

from ..models import SplitPartnerLink
from ..serializers import SplitPartnerLinkCreateSerializer, SplitPartnerLinkSerializer
from ..services import (
    SplitServiceError,
    accept_partner_link,
    decline_partner_link,
    send_partner_request,
)

logger = logging.getLogger(__name__)


class SplitPartnerLinkViewSet(
    mixins.ListModelMixin, mixins.CreateModelMixin, viewsets.GenericViewSet
):
    """
    GET  /api/split/partner-links/         — { sent: [...], received: [...] }
    POST /api/split/partner-links/         — { email } → crea/auto-accetta richiesta
    POST /api/split/partner-links/{id}/accept/
    POST /api/split/partner-links/{id}/decline/
    """

    permission_classes = [IsAuthenticated, IsNotDemoUser]
    # HIGH-02-style guard (mirror GrantRateThrottle): the email→user lookup in
    # send_partner_request() is an email-enumeration surface, so it's throttled
    # per-user rather than left uncapped.
    throttle_classes = [SplitLinkRateThrottle]
    serializer_class = SplitPartnerLinkSerializer

    def get_queryset(self):
        user = self.request.user
        return SplitPartnerLink.objects.filter(
            Q(requester=user) | Q(recipient=user)
        ).select_related("requester", "recipient")

    def list(self, request, *args, **kwargs):
        user = request.user
        sent = SplitPartnerLink.objects.filter(requester=user).select_related(
            "recipient"
        )
        received = SplitPartnerLink.objects.filter(recipient=user).select_related(
            "requester"
        )
        return Response(
            {
                "sent": SplitPartnerLinkSerializer(sent, many=True).data,
                "received": SplitPartnerLinkSerializer(received, many=True).data,
            }
        )

    def create(self, request, *args, **kwargs):
        serializer = SplitPartnerLinkCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            link = send_partner_request(
                request.user, serializer.validated_data["email"]
            )
        except SplitServiceError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        logger.info(
            "SplitPartnerLinkViewSet POST: requester=%s link=%s status=%s",
            request.user,
            link.id,
            link.status,
        )
        return Response(
            SplitPartnerLinkSerializer(link).data, status=status.HTTP_201_CREATED
        )

    @action(detail=True, methods=["post"], url_path="accept")
    def accept(self, request, pk=None):
        link = get_object_or_404(
            SplitPartnerLink,
            pk=pk,
            recipient=request.user,
            status=SplitPartnerLink.PENDING,
        )
        accept_partner_link(link)
        link.refresh_from_db()
        return Response(SplitPartnerLinkSerializer(link).data)

    @action(detail=True, methods=["post"], url_path="decline")
    def decline(self, request, pk=None):
        link = get_object_or_404(
            SplitPartnerLink,
            pk=pk,
            recipient=request.user,
            status=SplitPartnerLink.PENDING,
        )
        decline_partner_link(link)
        link.refresh_from_db()
        return Response(SplitPartnerLinkSerializer(link).data)
