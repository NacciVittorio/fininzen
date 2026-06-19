"""
portfolio/urls.py — Route del portafoglio.

  GET/POST                    /api/portfolio/
  GET/PATCH/DELETE            /api/portfolio/{id}/
  POST                        /api/portfolio/refresh-prices/
  POST                        /api/portfolio/{id}/refresh-price/
  GET                         /api/portfolio/summary/
  POST                        /api/portfolio/reset/
  GET                         /api/portfolio/search-ticker/?q=...
  GET/POST/PATCH/DELETE       /api/portfolio/investment-types/
  GET/PATCH/DELETE            /api/portfolio/investment-types/{id}/
  GET/POST                    /api/portfolio/{id}/transactions/
  DELETE                      /api/portfolio/{id}/transactions/{tx_id}/
"""

from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    AllocationTargetViewSet,
    AssetViewSet,
    ContributionSourceViewSet,
    FireViewSet,
    InvestmentTypeViewSet,
    RecurringInvestmentPlanViewSet,
    TransactionsBulkView,
    TransactionsFeedView,
)

router = DefaultRouter()
router.register(r"investment-types", InvestmentTypeViewSet, basename="investment-type")
router.register(
    r"contribution-sources",
    ContributionSourceViewSet,
    basename="contribution-source",
)
router.register(
    r"allocation-targets", AllocationTargetViewSet, basename="allocation-target"
)
router.register(
    r"recurring-investments",
    RecurringInvestmentPlanViewSet,
    basename="recurring-investment",
)
router.register(r"fire", FireViewSet, basename="fire")
router.register(r"", AssetViewSet, basename="asset")

urlpatterns = [
    path("transactions/", TransactionsFeedView.as_view(), name="transactions-feed"),
    path(
        "transactions/bulk/",
        TransactionsBulkView.as_view(),
        name="transactions-bulk",
    ),
    path("", include(router.urls)),
]
