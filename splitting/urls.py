"""
splitting/urls.py — Router DRF per la feature Split.

Montato sotto /api/split/... da fininzen/urls.py
(`path("api/split/", include("splitting.urls"))`). Il frontend chiama sempre
con prefisso /fininzen/api/... — gestito centralmente da web/src/api/client.ts,
mai da queste URL Django (che restano senza prefisso, come expenses/urls.py).
"""

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    SplitBalancesOverviewView,
    SplitContactViewSet,
    SplitExpenseViewSet,
    SplitGroupViewSet,
    SplitPartnerLinkViewSet,
    SplitRecurringExpenseViewSet,
    SplitSettlementViewSet,
)

router = DefaultRouter()
router.register(r"contacts", SplitContactViewSet, basename="split-contact")
router.register(
    r"partner-links", SplitPartnerLinkViewSet, basename="split-partner-link"
)
router.register(r"groups", SplitGroupViewSet, basename="split-group")
router.register(r"recurring", SplitRecurringExpenseViewSet, basename="split-recurring")
router.register(r"expenses", SplitExpenseViewSet, basename="split-expense")
router.register(r"settlements", SplitSettlementViewSet, basename="split-settlement")

urlpatterns = [
    # Va prima del router: "balances/overview/" non è una risorsa CRUD e non
    # deve passare dal dispatch del DefaultRouter (mirror di come
    # expenses/urls.py monta CashFlowFeedView prima di include(router.urls)).
    path(
        "balances/overview/",
        SplitBalancesOverviewView.as_view(),
        name="split-balances-overview",
    ),
    path("", include(router.urls)),
]
