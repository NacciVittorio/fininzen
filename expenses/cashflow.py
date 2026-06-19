"""
expenses/cashflow.py — Unified Cash Flow feed service.

Aggregates Expense rows (income/outcome) and AssetTransaction rows
(transfer pairs and adjustments) into a single sorted feed.
"""

from decimal import Decimal, ROUND_HALF_UP

from django.db.models import F, Q, Sum
from django.db.models.functions import Abs

from expenses.models import Category, Expense
from portfolio.models import AssetTransaction

_CENT = Decimal("0.01")


def _q2(value):
    """Quantize to cents with ROUND_HALF_UP (HIGH-11/MED-10).

    The feed displays Decimal products (shares * price_per_share) that can carry
    more than two decimals; quantizing with the same ROUND_HALF_UP convention
    used by the aggregate recompute (portfolio.models._q2) keeps the cents shown
    in the feed consistent with the stored asset values instead of diverging via
    Decimal's default ROUND_HALF_EVEN.
    """
    return Decimal(value).quantize(_CENT, rounding=ROUND_HALF_UP)


_ALL_TYPES = {"income", "outcome", "transfer", "adjustment"}
_ZERO_SUMMARY = {"income": "0.00", "outcome": "0.00", "net": "0.00"}
_VALID_ORDERINGS = {"-date", "date", "-amount", "amount"}

# Hard cap sul count "totale" tornato dal feed (CRIT-07): senza cap il count()
# scansiona l'intera selezione filtrata per ogni richiesta, anche se il client
# chiede solo la prima pagina. 10_000 è oltre lo spazio utile per la UI
# (paginatore client) e mantiene il count sotto i millisecondi su SQLite.
_MAX_COUNT_CAP = 10_000


def _expense_to_item(exp):
    if exp.category and exp.category.category_type == Category.INCOME:
        item_type = "income"
    else:
        item_type = "outcome"

    cat = exp.category
    cat_data = (
        {
            "id": cat.id,
            "name": cat.name,
            "color": cat.color,
            "icon": cat.icon,
            "category_type": cat.category_type,
            "parent_id": cat.parent_id,
        }
        if cat
        else None
    )

    account = exp.linked_asset
    account_data = {"id": account.id, "name": account.name} if account else None

    return {
        "id": f"expense_{exp.id}",
        "source_type": "expense",
        "source_id": exp.id,
        "type": item_type,
        "date": exp.date,
        "description": exp.description,
        "amount": str(exp.amount),
        "category": cat_data,
        "account": account_data,
        "is_verified": exp.is_verified,
    }


def _transfer_to_item(cash_in_tx):
    """cash_in_tx: CASH_IN with derived_from = CASH_OUT counterpart."""
    cash_out = cash_in_tx.derived_from
    amount = abs(cash_in_tx.shares * cash_in_tx.price_per_share)

    from_account = (
        {"id": cash_out.asset_id, "name": cash_out.asset.name} if cash_out else None
    )
    to_account = {"id": cash_in_tx.asset_id, "name": cash_in_tx.asset.name}

    return {
        "id": f"transfer_{cash_in_tx.id}",
        "source_type": "transfer",
        "source_id": cash_in_tx.id,
        "paired_id": cash_out.id if cash_out else None,
        "type": "transfer",
        "date": cash_in_tx.date,
        "description": cash_in_tx.notes or "Transfer",
        "amount": str(_q2(amount)),
        "from_account": from_account,
        "to_account": to_account,
        "is_verified": cash_in_tx.is_verified,
    }


def _adjustment_to_item(adj_tx):
    amount = adj_tx.shares * adj_tx.price_per_share
    account = {"id": adj_tx.asset_id, "name": adj_tx.asset.name}

    return {
        "id": f"adjustment_{adj_tx.id}",
        "source_type": "asset_transaction",
        "source_id": adj_tx.id,
        "type": "adjustment",
        "date": adj_tx.date,
        "description": adj_tx.notes or "Adjustment",
        "amount": str(_q2(amount)),
        "account": account,
        "is_verified": adj_tx.is_verified,
    }


def _apply_date_verified_filters(qs, *, date_from=None, date_to=None, verified=None):
    if date_from:
        qs = qs.filter(date__gte=date_from)
    if date_to:
        qs = qs.filter(date__lte=date_to)
    if verified is not None:
        qs = qs.filter(is_verified=verified)
    return qs


def _apply_search(qs, search, field):
    if not search:
        return qs
    return qs.filter(**{f"{field}__icontains": search})


def _merge_filter_ids(ids, single_id):
    return [*ids, single_id] if single_id else list(ids)


def _apply_expense_dimension_filters(
    qs,
    *,
    effective_category_ids=None,
    effective_parent_category_ids=None,
    effective_account_ids=None,
    account_no_link=False,
):
    effective_category_ids = effective_category_ids or []
    effective_parent_category_ids = effective_parent_category_ids or []
    effective_account_ids = effective_account_ids or []

    cat_q = Q()
    has_cat_filter = False
    if effective_category_ids:
        has_cat_filter = True
        cat_q |= Q(category_id__in=effective_category_ids)
    if effective_parent_category_ids:
        has_cat_filter = True
        cat_q |= Q(category_id__in=effective_parent_category_ids) | Q(
            category__parent_id__in=effective_parent_category_ids
        )
    if has_cat_filter:
        qs = qs.filter(cat_q).distinct()

    if account_no_link and effective_account_ids:
        qs = qs.filter(
            Q(linked_asset_id__isnull=True)
            | Q(linked_asset_id__in=effective_account_ids)
        )
    elif account_no_link:
        qs = qs.filter(linked_asset_id__isnull=True)
    elif effective_account_ids:
        qs = qs.filter(linked_asset_id__in=effective_account_ids)
    return qs


def _resolve_filters(filters):
    """Normalize a filters dict into the component parts used by all three public functions."""
    filters = filters or {}
    category_ids = filters.get("category_ids") or []
    parent_category_ids = filters.get("parent_category_ids") or []
    account_ids = filters.get("account_ids") or []
    effective_category_ids = _merge_filter_ids(category_ids, filters.get("category_id"))
    effective_parent_category_ids = _merge_filter_ids(
        parent_category_ids, filters.get("parent_category_id")
    )
    effective_account_ids = _merge_filter_ids(account_ids, filters.get("account_id"))
    return {
        "date_from": filters.get("date_from"),
        "date_to": filters.get("date_to"),
        "types": set(filters.get("types") or _ALL_TYPES),
        "verified": filters.get("verified"),
        "search": (filters.get("search") or "").strip(),
        "account_no_link": filters.get("account_no_link", False),
        "effective_category_ids": effective_category_ids,
        "effective_parent_category_ids": effective_parent_category_ids,
        "effective_account_ids": effective_account_ids,
        "has_cat_filter": bool(effective_category_ids or effective_parent_category_ids),
    }


def get_cashflow_summary(user, filters=None):
    """Accounting totals for the cash-flow cards.

    Feed rows stay operational and can include pending transactions; these totals
    intentionally count only verified expense/income rows.
    """
    ctx = _resolve_filters(filters)
    date_from = ctx["date_from"]
    date_to = ctx["date_to"]
    types = ctx["types"]
    verified = ctx["verified"]
    search = ctx["search"]
    account_no_link = ctx["account_no_link"]
    effective_category_ids = ctx["effective_category_ids"]
    effective_parent_category_ids = ctx["effective_parent_category_ids"]
    effective_account_ids = ctx["effective_account_ids"]

    if verified is False or not types & {"income", "outcome"}:
        return dict(_ZERO_SUMMARY)

    qs = Expense.objects.filter(owner=user, is_verified=True)
    qs = _apply_date_verified_filters(qs, date_from=date_from, date_to=date_to)
    qs = _apply_expense_dimension_filters(
        qs,
        effective_category_ids=effective_category_ids,
        effective_parent_category_ids=effective_parent_category_ids,
        effective_account_ids=effective_account_ids,
        account_no_link=account_no_link,
    )
    qs = _apply_search(qs, search, "description")

    income = Decimal("0")
    outcome = Decimal("0")
    if "income" in types:
        income = qs.filter(category__category_type=Category.INCOME).aggregate(
            total=Sum("amount")
        )["total"] or Decimal("0")
    if "outcome" in types:
        outcome = qs.filter(
            Q(category__category_type=Category.EXPENSE) | Q(category__isnull=True)
        ).aggregate(total=Sum("amount"))["total"] or Decimal("0")
    net = income - outcome
    return {
        "income": str(_q2(income)),
        "outcome": str(_q2(outcome)),
        "net": str(_q2(net)),
    }


def get_cashflow_feed(user, filters=None, *, offset=0, limit=None):
    """
    Return sorted list of cashflow items for user.

    filters keys (all optional):
      date_from, date_to  — datetime.date
      category_id         — int, exact category match
      parent_category_id  — int, match category or any of its subcategories
      account_id          — int, Asset pk
      types               — list subset of ["income","outcome","transfer","adjustment"]
      search              — substring matched against Expense.description / AssetTransaction.notes
      ordering            — one of "-date","date","-amount","amount" (default "-date")
    """
    ctx = _resolve_filters(filters)
    date_from = ctx["date_from"]
    date_to = ctx["date_to"]
    types = ctx["types"]
    verified = ctx["verified"]
    search = ctx["search"]
    account_no_link = ctx["account_no_link"]
    effective_category_ids = ctx["effective_category_ids"]
    effective_parent_category_ids = ctx["effective_parent_category_ids"]
    effective_account_ids = ctx["effective_account_ids"]
    has_cat_filter = ctx["has_cat_filter"]
    ordering = (filters or {}).get("ordering") or "-date"
    if ordering not in _VALID_ORDERINGS:
        ordering = "-date"

    items = []
    total = 0
    fetch_limit = offset + limit if limit is not None else None
    if fetch_limit is not None:
        # CRIT-07: bound the per-branch fetch. Each branch slices qs[:fetch_limit],
        # so an absurd offset (?page=99999999) would otherwise materialize the
        # entire feed into dicts just to return an empty page. Rows past the count
        # cap are unreachable, so never fetch more than cap + one page.
        fetch_limit = min(fetch_limit, _MAX_COUNT_CAP + limit)
    descending = ordering.startswith("-")
    amount_sort = ordering in ("-amount", "amount")
    # Pre-order per type so the slice keeps the top rows for the chosen ordering.
    # AssetTransaction querysets are annotated with `_amt` (abs of computed
    # amount) at the call sites so we can order by amount in the DB too.
    if amount_sort:
        expense_order = (
            ("-amount", "-date", "-id") if descending else ("amount", "date", "id")
        )
        tx_order = ("-_amt", "-date", "-id") if descending else ("_amt", "date", "id")
    else:
        expense_order = ("-date", "-id") if descending else ("date", "id")
        tx_order = expense_order

    def _bounded(qs, order_fields):
        # CRIT-07: count() capped — quando si pagina (fetch_limit valorizzato)
        # slice di _MAX_COUNT_CAP+1 pk e contiamo solo quelli: un risultato
        # == cap+1 significa "almeno cap" senza scansionare l'intera selezione
        # filtrata. Quando fetch_limit è None il chiamante vuole tutto e usa
        # len(items) (count saltato del tutto — vedi d2fa587).
        nonlocal total
        if fetch_limit is not None:
            capped = qs.values_list("pk", flat=True).order_by()[: _MAX_COUNT_CAP + 1]
            total += min(len(list(capped)), _MAX_COUNT_CAP)
        qs = qs.order_by(*order_fields)
        return qs[:fetch_limit] if fetch_limit is not None else qs

    # ── Expenses (income + outcome) ───────────────────────────────────────────
    if types & {"income", "outcome"}:
        qs = (
            Expense.objects.select_related(
                "category", "category__parent", "linked_asset"
            )
            .only(
                "id",
                "date",
                "description",
                "amount",
                "is_verified",
                "category_id",
                "category__id",
                "category__name",
                "category__color",
                "category__icon",
                "category__category_type",
                "category__parent_id",
                "linked_asset_id",
                "linked_asset__id",
                "linked_asset__name",
            )
            .filter(owner=user)
        )
        qs = _apply_date_verified_filters(
            qs,
            date_from=date_from,
            date_to=date_to,
            verified=verified,
        )
        qs = _apply_expense_dimension_filters(
            qs,
            effective_category_ids=effective_category_ids,
            effective_parent_category_ids=effective_parent_category_ids,
            effective_account_ids=effective_account_ids,
            account_no_link=account_no_link,
        )

        if "income" in types and "outcome" not in types:
            qs = qs.filter(category__category_type=Category.INCOME)
        elif "outcome" in types and "income" not in types:
            qs = qs.filter(
                Q(category__category_type=Category.EXPENSE) | Q(category__isnull=True)
            )

        qs = _apply_search(qs, search, "description")

        items.extend(_expense_to_item(exp) for exp in _bounded(qs, expense_order))

    # ── Transfers (CASH_IN with derived_from = paired CASH_OUT) ──────────────
    # Transfers have no category, so hide them when a category filter is active.
    if "transfer" in types and not has_cat_filter:
        qs = (
            AssetTransaction.objects.select_related(
                "asset", "derived_from", "derived_from__asset"
            )
            .only(
                "id",
                "date",
                "shares",
                "price_per_share",
                "notes",
                "is_verified",
                "asset_id",
                "asset__id",
                "asset__name",
                "derived_from_id",
                "derived_from__id",
                "derived_from__transaction_type",
                "derived_from__asset_id",
                "derived_from__asset__id",
                "derived_from__asset__name",
            )
            .filter(
                owner=user,
                transaction_type=AssetTransaction.CASH_IN,
                derived_from__isnull=False,
                derived_from__transaction_type=AssetTransaction.CASH_OUT,
            )
        )
        qs = _apply_date_verified_filters(
            qs,
            date_from=date_from,
            date_to=date_to,
            verified=verified,
        )
        if effective_account_ids:
            qs = qs.filter(
                Q(asset_id__in=effective_account_ids)
                | Q(derived_from__asset_id__in=effective_account_ids)
            )

        qs = _apply_search(qs, search, "notes")

        if amount_sort:
            qs = qs.annotate(_amt=Abs(F("shares") * F("price_per_share")))

        items.extend(_transfer_to_item(tx) for tx in _bounded(qs, tx_order))

    # ── Adjustments ───────────────────────────────────────────────────────────
    # Adjustments have no category, so hide them when a category filter is active.
    if "adjustment" in types and not has_cat_filter:
        qs = (
            AssetTransaction.objects.select_related("asset")
            .only(
                "id",
                "date",
                "shares",
                "price_per_share",
                "notes",
                "is_verified",
                "asset_id",
                "asset__id",
                "asset__name",
            )
            .filter(
                owner=user,
                transaction_type=AssetTransaction.ADJUSTMENT,
            )
        )
        qs = _apply_date_verified_filters(
            qs,
            date_from=date_from,
            date_to=date_to,
            verified=verified,
        )
        if effective_account_ids:
            qs = qs.filter(asset_id__in=effective_account_ids)

        qs = _apply_search(qs, search, "notes")

        if amount_sort:
            qs = qs.annotate(_amt=Abs(F("shares") * F("price_per_share")))

        items.extend(_adjustment_to_item(tx) for tx in _bounded(qs, tx_order))

    # Merge sort the per-type rows. For amount ordering, use abs(amount) so
    # signed adjustments rank by magnitude (matching the UI's natural reading).
    if amount_sort:
        items.sort(
            key=lambda x: (abs(Decimal(x["amount"])), x["date"], x["id"]),
            reverse=descending,
        )
    else:
        items.sort(key=lambda x: (x["date"], x["id"]), reverse=descending)
    if limit is None:
        return len(items), items
    return total, items[offset : offset + limit]


def get_cashflow_ids(user, filters=None):
    """Fast path for bulk selection: return only the primary keys grouped by kind.

    Skips the dict construction and join-heavy `select_related` chain that
    `get_cashflow_feed` needs for the API response. Used by the bulk endpoint
    to materialize a filtered selection without instantiating thousands of
    Python row dicts.

    Returns: {"expense": [pk, ...], "transfer": [pk, ...], "adjustment": [pk, ...]}
    """
    ctx = _resolve_filters(filters)
    date_from = ctx["date_from"]
    date_to = ctx["date_to"]
    types = ctx["types"]
    verified = ctx["verified"]
    search = ctx["search"]
    account_no_link = ctx["account_no_link"]
    effective_category_ids = ctx["effective_category_ids"]
    effective_parent_category_ids = ctx["effective_parent_category_ids"]
    effective_account_ids = ctx["effective_account_ids"]
    has_cat_filter = ctx["has_cat_filter"]

    out: dict[str, list[int]] = {"expense": [], "transfer": [], "adjustment": []}

    if types & {"income", "outcome"}:
        qs = Expense.objects.filter(owner=user)
        qs = _apply_date_verified_filters(
            qs, date_from=date_from, date_to=date_to, verified=verified
        )
        qs = _apply_expense_dimension_filters(
            qs,
            effective_category_ids=effective_category_ids,
            effective_parent_category_ids=effective_parent_category_ids,
            effective_account_ids=effective_account_ids,
            account_no_link=account_no_link,
        )
        if "income" in types and "outcome" not in types:
            qs = qs.filter(category__category_type=Category.INCOME)
        elif "outcome" in types and "income" not in types:
            qs = qs.filter(
                Q(category__category_type=Category.EXPENSE) | Q(category__isnull=True)
            )
        qs = _apply_search(qs, search, "description")
        out["expense"] = list(qs.values_list("id", flat=True))

    if "transfer" in types and not has_cat_filter:
        qs = AssetTransaction.objects.filter(
            owner=user,
            transaction_type=AssetTransaction.CASH_IN,
            derived_from__isnull=False,
        )
        qs = _apply_date_verified_filters(
            qs, date_from=date_from, date_to=date_to, verified=verified
        )
        if effective_account_ids:
            qs = qs.filter(
                Q(asset_id__in=effective_account_ids)
                | Q(derived_from__asset_id__in=effective_account_ids)
            )
        qs = _apply_search(qs, search, "notes")
        out["transfer"] = list(qs.values_list("id", flat=True))

    if "adjustment" in types and not has_cat_filter:
        qs = AssetTransaction.objects.filter(
            owner=user, transaction_type=AssetTransaction.ADJUSTMENT
        )
        qs = _apply_date_verified_filters(
            qs, date_from=date_from, date_to=date_to, verified=verified
        )
        if effective_account_ids:
            qs = qs.filter(asset_id__in=effective_account_ids)
        qs = _apply_search(qs, search, "notes")
        out["adjustment"] = list(qs.values_list("id", flat=True))

    return out
