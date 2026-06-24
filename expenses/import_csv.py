import logging
from datetime import datetime
from decimal import Decimal, InvalidOperation
from django.db import transaction

from .models import Category, Expense
from fininzen.api_errors import safe_client_message
from fininzen.utils import parse_optional_bool
from expenses.views.helpers import _parse_import_amount

logger = logging.getLogger(__name__)


def run_csv_import(rows, user, request_user=None):
    """Importa righe CSV come spese. Restituisce il dict di esito.

    Estratto da ExpenseViewSet.import_csv (HIGH-14): la view resta un wrapper
    sottile che valida la richiesta e impacchetta il risultato in una Response.
    """
    imported = 0
    skipped = 0
    zero_amount = 0
    errors = []
    skipped_details = []
    warnings = []

    logger.info(
        "CSV import start: %d rows received from user %s", len(rows), request_user
    )

    DATE_FORMATS = ["%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%d.%m.%Y", "%m/%d/%Y"]
    from portfolio.models import (
        Asset as PortfolioAsset,
        AssetTransaction,
        DashboardSummary,
    )
    from portfolio.services import (
        _refresh_manual_asset_strict,
        invalidate_dashboard_summary,
    )

    categories = list(Category.objects.filter(owner=user))
    categories_by_id = {str(cat.id): cat for cat in categories}
    categories_by_name = {}
    for cat in categories:
        categories_by_name.setdefault(cat.name.casefold(), []).append(cat)

    accounts = list(
        PortfolioAsset.objects.filter(
            owner=user,
            investment_type__is_bank_account=True,
        ).select_related("investment_type")
    )
    accounts_by_id = {str(account.id): account for account in accounts}
    accounts_by_name = {}
    for account in accounts:
        accounts_by_name.setdefault(account.name.casefold(), account)

    expenses_to_create = []
    import_meta = []

    for i, row in enumerate(rows):
        try:
            date_str = str(row.get("date", "")).strip()
            description = str(row.get("description", "")).strip()
            amount_str = str(row.get("amount", "")).strip()
            category_name = str(
                row.get("category_name") or row.get("category") or ""
            ).strip()
            category_id = str(row.get("category_id", "")).strip()
            category_type = str(row.get("category_type", "")).strip().lower()
            linked_asset_id = str(
                row.get("linked_asset") or row.get("linked_asset_id") or ""
            ).strip()
            linked_asset_name = str(
                row.get("linked_asset_name")
                or row.get("account_name")
                or row.get("account")
                or ""
            ).strip()
            is_verified = parse_optional_bool(
                row.get("is_verified"),
                true_aliases=("verified",),
                false_aliases=("unverified",),
            )
            if not description and category_name:
                description = category_name

            if not date_str or not description or not amount_str:
                missing = []
                if not date_str:
                    missing.append("date")
                if not description:
                    missing.append("description")
                if not amount_str:
                    missing.append("amount")
                logger.debug(
                    "CSV row %d skipped: missing required field (date=%r desc=%r amount=%r)",
                    i + 1,
                    date_str,
                    description,
                    amount_str,
                )
                skipped_details.append(
                    f"Row {i + 1}: missing required field ({', '.join(missing)})"
                )
                skipped += 1
                continue

            # Parse data
            parsed_date = None
            for fmt in DATE_FORMATS:
                try:
                    parsed_date = datetime.strptime(date_str, fmt).date()
                    break
                except ValueError:
                    pass
            if not parsed_date:
                errors.append(f"Row {i + 1}: invalid date '{date_str}'")
                skipped_details.append(f"Row {i + 1}: invalid date '{date_str}'")
                logger.warning("CSV row %d: invalid date %r", i + 1, date_str)
                skipped += 1
                continue

            # Parse importo
            try:
                amount = _parse_import_amount(amount_str)
            except InvalidOperation:
                errors.append(f"Row {i + 1}: invalid amount '{amount_str}'")
                skipped_details.append(f"Row {i + 1}: invalid amount '{amount_str}'")
                logger.warning(
                    "CSV row %d: invalid amount %r",
                    i + 1,
                    amount_str,
                )
                skipped += 1
                continue
            if amount == 0:
                logger.debug("CSV row %d skipped: amount is 0", i + 1)
                skipped_details.append(f"Row {i + 1}: amount is 0")
                skipped += 1
                zero_amount += 1
                continue

            # Match categoria per ID (K4.4) o per nome (legacy)
            cat = None
            category_error = ""
            if category_type not in ("", Category.EXPENSE, Category.INCOME):
                logger.debug(
                    "CSV row %d: invalid category_type %r, ignoring",
                    i + 1,
                    category_type,
                )
                category_type = ""
            if category_id:
                cat = categories_by_id.get(category_id)
                if not cat:
                    category_error = (
                        f"Row {i + 1}: category id '{category_id}' not found"
                    )
            elif category_name:
                matching_categories = categories_by_name.get(
                    category_name.casefold(), []
                )
                if category_type:
                    matching_categories = [
                        c
                        for c in matching_categories
                        if c.category_type == category_type
                    ]
                cat = matching_categories[0] if matching_categories else None
                if not cat:
                    category_error = (
                        f"Row {i + 1}: category '{category_name}' not found"
                    )
            else:
                category_error = f"Row {i + 1}: category is required"
            if cat and category_type and cat.category_type != category_type:
                logger.debug(
                    "CSV row %d: category_type mismatch (row=%s cat=%s)",
                    i + 1,
                    category_type,
                    cat.category_type,
                )
                cat = None
                category_label = category_name or f"id {category_id}"
                category_error = (
                    f"Row {i + 1}: category '{category_label}' does not match "
                    f"type '{category_type}'"
                )
            if not cat:
                logger.debug("CSV row %d skipped: %s", i + 1, category_error)
                skipped_details.append(category_error)
                skipped += 1
                continue

            linked_asset = None
            account_error = ""
            if linked_asset_id:
                linked_asset = accounts_by_id.get(linked_asset_id)
                if not linked_asset:
                    account_error = (
                        f"Row {i + 1}: account id '{linked_asset_id}' not found"
                    )
            elif linked_asset_name:
                linked_asset = accounts_by_name.get(linked_asset_name.casefold())
                if not linked_asset:
                    account_error = (
                        f"Row {i + 1}: account '{linked_asset_name}' not found"
                    )
            else:
                account_error = f"Row {i + 1}: account is required"
            if not linked_asset:
                logger.debug("CSV row %d skipped: %s", i + 1, account_error)
                skipped_details.append(account_error)
                skipped += 1
                continue

            expenses_to_create.append(
                Expense(
                    description=description,
                    amount=amount,
                    category=cat,
                    date=parsed_date,
                    linked_asset=linked_asset,
                    is_verified=is_verified if is_verified is not None else False,
                    owner=user,
                )
            )
            tx_type = (
                AssetTransaction.CASH_OUT
                if cat.category_type == Category.EXPENSE
                else AssetTransaction.CASH_IN
            )
            import_meta.append(
                (i + 1, description, amount, parsed_date, linked_asset, tx_type)
            )
            logger.debug(
                "CSV row %d: imported '%s' %s %s",
                i + 1,
                description,
                amount,
                parsed_date,
            )
            imported += 1

        except Exception as e:
            safe_detail = safe_client_message(e)
            errors.append(f"Row {i + 1}: {safe_detail}")
            skipped_details.append(f"Row {i + 1}: {safe_detail}")
            logger.error("CSV row %d: unexpected error: %s", i + 1, e)
            skipped += 1

    affected_assets = {}
    if expenses_to_create:
        with transaction.atomic():
            # Pre-flight deduplication: filter out expenses that already exist
            # to prevent duplicate creation on CSV re-import or client retry.
            # Key: (date, amount, description, linked_asset_id) per user.
            existing_tuples = set(
                Expense.objects.filter(owner=user).values_list(
                    "date", "amount", "description", "linked_asset_id"
                )
            )
            deduped_list = [
                (exp, meta)
                for exp, meta in zip(expenses_to_create, import_meta)
                if (exp.date, exp.amount, exp.description, exp.linked_asset_id)
                not in existing_tuples
            ]
            original_count = len(expenses_to_create)
            if deduped_list:
                expenses_to_create, import_meta = zip(*deduped_list)
                expenses_to_create = list(expenses_to_create)
                import_meta = list(import_meta)
            else:
                expenses_to_create = []
                import_meta = []
            skipped += original_count - len(expenses_to_create)

            created_expenses = (
                Expense.objects.bulk_create(
                    expenses_to_create,
                    batch_size=500,
                )
                if expenses_to_create
                else []
            )
            shadow_txs = []
            for expense, meta in zip(created_expenses, import_meta):
                _, _, amount, parsed_date, linked_asset, tx_type = meta
                if linked_asset.tracking_type != PortfolioAsset.MANUAL:
                    continue
                shadow_txs.append(
                    AssetTransaction(
                        source_expense=expense,
                        asset=linked_asset,
                        transaction_type=tx_type,
                        date=parsed_date,
                        shares=Decimal("1"),
                        price_per_share=amount,
                        is_verified=expense.is_verified,
                        owner=user,
                    )
                )
                affected_assets[linked_asset.id] = linked_asset
            if shadow_txs:
                AssetTransaction.objects.bulk_create(shadow_txs, batch_size=500)
            for asset in affected_assets.values():
                _refresh_manual_asset_strict(asset)
            invalidate_dashboard_summary(
                DashboardSummary.REASON_EXPENSE_CREATED,
                user=user,
            )
        imported = len(created_expenses)

    logger.info(
        "CSV import complete: %d imported, %d skipped, %d errors, %d assets refreshed",
        imported,
        skipped,
        len(errors),
        len(affected_assets),
    )
    return {
        "imported": imported,
        "skipped": skipped,
        "zero_amount": zero_amount,
        "errors": errors[:20],
        "skipped_details": skipped_details[:50],
        "warnings": warnings[:50],
    }
