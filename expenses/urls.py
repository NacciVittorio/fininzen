"""
expenses/urls.py — Registrazione delle route con il Router DRF.

DefaultRouter genera automaticamente tutte le URL RESTful:
  GET    /api/expenses/           → lista spese
  POST   /api/expenses/           → crea spesa
  GET    /api/expenses/{id}/      → dettaglio spesa
  PATCH  /api/expenses/{id}/      → aggiorna parzialmente
  DELETE /api/expenses/{id}/      → elimina
  GET    /api/expenses/summary/   → totali per categoria (action custom)
  GET    /api/expenses/monthly/   → totali per mese (action custom)
  GET    /api/expenses/cashflow/  → feed unificato cash flow
"""

from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    BudgetViewSet,
    CashFlowBulkView,
    CategoryViewSet,
    CashFlowFeedView,
    ExpenseViewSet,
    RecurringExpenseViewSet,
)

router = DefaultRouter()
router.register(r"categories", CategoryViewSet, basename="category")
router.register(r"budgets", BudgetViewSet, basename="budget")
router.register(r"recurring", RecurringExpenseViewSet, basename="recurring")
router.register(r"", ExpenseViewSet, basename="expense")

urlpatterns = [
    path("cashflow/", CashFlowFeedView.as_view(), name="cashflow-feed"),
    path("cashflow/bulk/", CashFlowBulkView.as_view(), name="cashflow-bulk"),
    path("", include(router.urls)),
]
