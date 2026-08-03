import logging

from rest_framework import status, viewsets
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from fininzen.permissions import IsNotDemoUser

from ..models import SplitContact, SplitParticipant
from ..serializers import SplitContactSerializer

logger = logging.getLogger(__name__)


class SplitContactViewSet(viewsets.ModelViewSet):
    """CRUD per la rubrica Split, scoped a `owner=request.user`.

    DELETE fa soft-archive (`is_archived=True`) se il contatto è referenziato
    da una partecipazione storica (gruppi/spese) — mirror semplificato di
    CategoryViewSet.destroy().
    """

    permission_classes = [IsAuthenticated, IsNotDemoUser]
    serializer_class = SplitContactSerializer

    def get_queryset(self):
        qs = SplitContact.objects.filter(owner=self.request.user)
        if self.request.query_params.get("include_archived") != "true":
            qs = qs.filter(is_archived=False)
        return qs.order_by("display_name", "id")

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user)

    def destroy(self, request, *args, **kwargs):
        contact = self.get_object()
        referenced = SplitParticipant.objects.filter(contact=contact).exists()
        if referenced:
            contact.is_archived = True
            contact.save(update_fields=["is_archived"])
            logger.info("SplitContact %s archived (still referenced)", contact.id)
            return Response(status=status.HTTP_204_NO_CONTENT)
        contact.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
