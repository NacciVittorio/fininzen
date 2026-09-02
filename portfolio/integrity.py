"""Domain-integrity checks shared by the ``audit_domain_integrity`` management
command and the admin-portal health endpoint. Keeping the queries in one place
means the CLI and the API can never drift on what counts as a violation.
"""

from decimal import Decimal

from django.db.models import Case, CharField, F, Q, Value, When

from expenses.models import Budget, Category, Expense, RecurringExpense
from portfolio.models import Asset, AssetPriceHistory, AssetTransaction, InvestmentType

_TX_AMOUNT_QUANT = Decimal("0.0001")


def _shadow_transactions_qs():
    return AssetTransaction.objects.filter(source_expense__isnull=False).annotate(
        expected_transaction_type=Case(
            When(
                source_expense__category__category_type=Category.INCOME,
                then=Value(AssetTransaction.CASH_IN),
            ),
            default=Value(AssetTransaction.CASH_OUT),
            output_field=CharField(),
        )
    )


def _shadow_transaction_mismatch_qs():
    return _shadow_transactions_qs().filter(
        Q(source_expense__linked_asset__isnull=True)
        | ~Q(source_expense__linked_asset__tracking_type=Asset.MANUAL)
        | ~Q(source_expense__linked_asset__investment_type__is_bank_account=True)
        | ~Q(asset_id=F("source_expense__linked_asset_id"))
        | ~Q(owner_id=F("source_expense__owner_id"))
        | ~Q(transaction_type=F("expected_transaction_type"))
        | ~Q(date=F("source_expense__date"))
        | ~Q(shares=Decimal("1"))
        | ~Q(price_per_share=F("source_expense__amount"))
        | ~Q(is_verified=F("source_expense__is_verified"))
    )


def _expenses_missing_shadow_qs():
    return Expense.objects.filter(
        linked_asset__isnull=False,
        linked_asset__tracking_type=Asset.MANUAL,
        linked_asset__investment_type__is_bank_account=True,
        portfolio_transactions__isnull=True,
    )


def _expected_derived_type(parent):
    return {
        AssetTransaction.BUY: AssetTransaction.CASH_OUT,
        AssetTransaction.SELL: AssetTransaction.CASH_IN,
        AssetTransaction.CASH_OUT: AssetTransaction.CASH_IN,
    }.get(parent.transaction_type)


def _expected_derived_child(parent, kind):
    if kind == AssetTransaction.DERIVED_PRINCIPAL:
        expected_type = _expected_derived_type(parent)
        if parent.cash_amount is None:
            expected_amount = parent.shares * parent.price_per_share
        elif parent.transaction_type == AssetTransaction.BUY:
            expected_amount = parent.cash_amount - parent.fee
        elif parent.transaction_type == AssetTransaction.SELL:
            expected_amount = parent.cash_amount + parent.fee + parent.tax_amount
        else:
            expected_amount = parent.shares * parent.price_per_share
    elif kind == AssetTransaction.DERIVED_FEE:
        expected_type = AssetTransaction.CASH_OUT
        expected_amount = parent.fee or Decimal("0")
    elif kind == AssetTransaction.DERIVED_TAX:
        expected_type = AssetTransaction.CASH_OUT
        expected_amount = parent.tax_amount or Decimal("0")
    else:
        return None, None
    expected_amount = Decimal(expected_amount or 0).quantize(_TX_AMOUNT_QUANT)
    if expected_type is None or expected_amount <= 0:
        return None, None
    return expected_type, expected_amount


def _derived_transaction_mismatches():
    mismatches = []
    qs = (
        AssetTransaction.objects.filter(
            derived_from__isnull=False,
            source_expense__isnull=True,
        )
        .select_related("derived_from", "asset", "derived_from__asset")
        .order_by("derived_from_id", "id")
    )
    for child in qs.iterator():
        parent = child.derived_from
        expected_type, expected_amount = _expected_derived_child(
            parent, child.derived_kind
        )
        if (
            expected_type is None
            or child.transaction_type != expected_type
            or child.owner_id != parent.owner_id
            or child.date != parent.date
            or child.shares != Decimal("1")
            or child.price_per_share != expected_amount
            or child.is_verified != parent.is_verified
        ):
            mismatches.append(child)
    return mismatches


def collect_integrity_issues():
    """Return {check_name: violation_count} for every known integrity check."""
    orphaned_legacy_types = InvestmentType.objects.filter(
        owner__isnull=True,
        assets__isnull=True,
        allocation_targets__isnull=True,
    ).count()
    return {
        "legacy_orphaned_investment_types": orphaned_legacy_types,
        "categories_owner_null": Category.objects.filter(owner__isnull=True).count(),
        "expenses_owner_null": Expense.objects.filter(owner__isnull=True).count(),
        "budgets_owner_null": Budget.objects.filter(owner__isnull=True).count(),
        "recurrings_owner_null": RecurringExpense.objects.filter(
            owner__isnull=True
        ).count(),
        "investment_types_owner_null_referenced": InvestmentType.objects.filter(
            owner__isnull=True
        )
        .filter(Q(assets__isnull=False) | Q(allocation_targets__isnull=False))
        .distinct()
        .count(),
        "assets_owner_null": Asset.objects.filter(owner__isnull=True).count(),
        "expenses_non_positive": Expense.objects.filter(amount__lte=0).count(),
        "budgets_non_positive": Budget.objects.filter(amount__lte=0).count(),
        "recurrings_non_positive": RecurringExpense.objects.filter(
            amount__lte=0
        ).count(),
        "recurrings_bad_day": RecurringExpense.objects.exclude(
            day_of_month__range=(1, 31)
        ).count(),
        "transactions_owner_null": AssetTransaction.objects.filter(
            owner__isnull=True
        ).count(),
        "price_history_owner_null": AssetPriceHistory.objects.filter(
            owner__isnull=True
        ).count(),
        "transactions_invalid_shares": AssetTransaction.objects.filter(
            shares__lte=0
        ).count(),
        "transactions_invalid_amount": AssetTransaction.objects.filter(
            Q(transaction_type="adjustment", price_per_share=0)
            | (~Q(transaction_type="adjustment") & Q(price_per_share__lte=0))
        ).count(),
        "shadow_transactions_mismatch": _shadow_transaction_mismatch_qs().count(),
        "linked_expenses_missing_shadow": _expenses_missing_shadow_qs().count(),
        "derived_transactions_mismatch": len(_derived_transaction_mismatches()),
        "transactions_owner_mismatch": AssetTransaction.objects.exclude(
            owner_id=F("asset__owner_id")
        ).count(),
        "budget_category_owner_mismatch": Budget.objects.exclude(
            category__owner_id=F("owner_id")
        ).count(),
        "expense_category_owner_mismatch": Expense.objects.filter(
            category__isnull=False
        )
        .exclude(category__owner_id=F("owner_id"))
        .count(),
        "expense_asset_owner_mismatch": Expense.objects.filter(
            linked_asset__isnull=False
        )
        .exclude(linked_asset__owner_id=F("owner_id"))
        .count(),
        "expense_asset_invalid_domain": Expense.objects.filter(
            linked_asset__isnull=False
        )
        .filter(
            ~Q(linked_asset__tracking_type="MANUAL")
            | ~Q(linked_asset__investment_type__is_bank_account=True)
        )
        .count(),
        "recurring_category_owner_mismatch": RecurringExpense.objects.filter(
            category__isnull=False
        )
        .exclude(category__owner_id=F("owner_id"))
        .count(),
        "recurring_asset_owner_mismatch": RecurringExpense.objects.filter(
            linked_asset__isnull=False
        )
        .exclude(linked_asset__owner_id=F("owner_id"))
        .count(),
        "recurring_asset_invalid_domain": RecurringExpense.objects.filter(
            linked_asset__isnull=False
        )
        .filter(
            ~Q(linked_asset__tracking_type="MANUAL")
            | ~Q(linked_asset__investment_type__is_bank_account=True)
        )
        .count(),
        "asset_type_owner_mismatch": Asset.objects.filter(investment_type__isnull=False)
        .exclude(investment_type__owner_id=F("owner_id"))
        .count(),
        "asset_source_owner_mismatch": Asset.objects.filter(
            source_account__isnull=False
        )
        .exclude(source_account__owner_id=F("owner_id"))
        .count(),
        "asset_source_invalid_domain": Asset.objects.filter(
            source_account__isnull=False
        )
        .filter(
            ~Q(source_account__tracking_type="MANUAL")
            | ~Q(source_account__investment_type__is_bank_account=True)
        )
        .count(),
    }
