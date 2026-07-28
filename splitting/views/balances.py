"""
splitting/views/balances.py — Saldo complessivo cross-gruppo (piano sez. 6:
GET /api/split/balances/overview/).

Non è una ModelViewSet: è un endpoint calcolato, mirror di come
CashFlowFeedView (expenses/views/cashflow_views.py) è un APIView montato
direttamente (non nel router) per lo stesso motivo — nessuna risorsa CRUD
sottostante.
"""

import logging

from django.db.models import Q
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from fininzen.permissions import IsNotDemoUser

from ..balances import compute_balances, serialize_balances
from ..models import SplitExpenseShare, SplitSettlement

logger = logging.getLogger(__name__)


class SplitBalancesOverviewView(APIView):
    """
    GET /api/split/balances/overview/

    Saldo complessivo per persona dell'utente autenticato, calcolato sulle
    shares di TUTTE le spese a cui ha accesso — gruppi di cui è
    creatore/membro attivo + spese occasionali proprie o di cui è
    partecipante ad-hoc (stesso perimetro di `user_can_access_expense`,
    espresso qui come queryset invece che come check per-oggetto) — più i
    settlement di cui è parte diretta (payer/payee) o che appartengono a un
    gruppo a cui ha accesso. Riusa `compute_balances` esteso invece che
    filtrato su un singolo gruppo (piano sez. 3.2).
    """

    permission_classes = [IsAuthenticated, IsNotDemoUser]

    def get(self, request):
        user = request.user
        share_qs = SplitExpenseShare.objects.filter(
            Q(expense__created_by=user)
            | Q(expense__group__created_by=user)
            | Q(
                expense__group__participants__user=user,
                expense__group__participants__is_active=True,
            )
            | Q(expense__adhoc_participants__user=user)
        ).distinct()
        settlement_qs = SplitSettlement.objects.filter(
            Q(created_by=user)
            | Q(payer_user=user)
            | Q(payee_user=user)
            | Q(group__created_by=user)
            | Q(
                group__participants__user=user,
                group__participants__is_active=True,
            )
        ).distinct()
        balances = compute_balances(share_qs, settlement_qs)
        return Response(serialize_balances(balances))
