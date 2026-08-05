"""
expenses/cashflow.py — Unified Cash Flow feed service.

Aggregates Expense rows (income/outcome) and AssetTransaction rows
(transfer pairs and adjustments) into a single sorted feed.
"""

from dataclasses import dataclass
from decimal import Decimal, ROUND_HALF_UP
from typing import Callable

from django.db.models import F, Q, Sum
from django.db.models.functions import Abs

from expenses.models import Category, Expense
from portfolio.models import AssetTransaction
from splitting.models import SplitExpense, SplitExpenseShare, SplitSettlement

_CENT = Decimal("0.01")


@dataclass(frozen=True)
class FeedSource:
    """Un tipo di riga del feed CashFlow (expense/transfer/adjustment/split/
    split_reimbursement), con il gating che stabilisce se è attivo per la
    richiesta corrente.

    Non unifica le query (restano bespoke per sorgente, 5 implementazioni
    come prima — le tre tabelle sorgenti sono strutturalmente troppo diverse
    per una queryset comune) — elimina invece la ripetizione del *controllo
    esterno* ("questo tipo è attivo? c'è un cat-filter che lo esclude? un
    verified=False lo esclude del tutto?") che prima era copiata una volta
    per branch in get_cashflow_feed/get_cashflow_ids.
    """

    kind: str
    type_names: frozenset
    gated_by_cat_filter: bool
    hidden_when_verified_false: bool
    build: Callable[[], object]

    def is_active(self, *, types, has_cat_filter, verified) -> bool:
        if not (self.type_names & types):
            return False
        if self.gated_by_cat_filter and has_cat_filter:
            return False
        if self.hidden_when_verified_false and verified is False:
            return False
        return True


def _q2(value):
    """Quantize to cents with ROUND_HALF_UP (HIGH-11/MED-10).

    The feed displays Decimal products (shares * price_per_share) that can carry
    more than two decimals; quantizing with the same ROUND_HALF_UP convention
    used by the aggregate recompute (portfolio.models._q2) keeps the cents shown
    in the feed consistent with the stored asset values instead of diverging via
    Decimal's default ROUND_HALF_EVEN.
    """
    return Decimal(value).quantize(_CENT, rounding=ROUND_HALF_UP)


_ALL_TYPES = {
    "income",
    "outcome",
    "transfer",
    "adjustment",
    "split",
    "split_reimbursement",
}
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
        "description": cash_in_tx.notes or None,
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
        "description": adj_tx.notes or None,
        "amount": str(_q2(amount)),
        "account": account,
        "is_verified": adj_tx.is_verified,
    }


def _split_expense_to_item(share):
    """share: SplitExpenseShare where is_payer=True and participant.user is
    the observed user.

    `amount` shown = share.share_amount — the payer's own personal quota,
    i.e. their real slice of a shared expense (decision #3: CashFlow shows
    only the personal quota; the rest advanced for others is a credit
    tracked in the Split tab until settled, never in CashFlow).

    NOTE (plan deviation, flagged explicitly): the plan text for this
    function (sez. 5) literally spells out `exp.amount - share.share_amount`.
    That expression is the CREDIT the payer is owed back by the other
    participants (the formula `compute_balances` uses for debt tracking,
    see splitting/balances.py) — for a 100€ expense split 4 ways it evaluates
    to 75.00, not the 25.00 personal quota the plan's own worked example
    ("spesa 100€ divisa in 4 → item split da 25€") and decision #3 require.
    `share.share_amount` alone is already the payer's own slice (identical
    computation used for every other participant's row), so it is used
    as-is here instead of the literal (self-contradictory) plan formula.
    """
    exp = share.expense
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

    net_amount = share.share_amount

    return {
        # SplitExpense pk, non SplitExpenseShare pk (piano fase "unificazione
        # astrazione" step 4): allinea lo spazio-id con get_cashflow_ids()
        # ["split"] (già SplitExpense pk) — sicuro grazie al vincolo DB
        # uniq_split_expense_single_payer (un solo payer per spesa, quindi
        # share.id e exp.id sono in corrispondenza 1:1 per l'utente
        # osservato). Necessario perché expenses/bulk.py risolve una
        # selezione "filtered" intersecando gli id del feed con quelli di
        # get_cashflow_ids() — spazi-id diversi non avrebbero mai combaciato.
        "id": f"split_{exp.id}",
        "source_type": "split_expense",
        "source_id": exp.id,
        "type": "split",
        "date": exp.date,
        "description": exp.description,
        "amount": str(_q2(net_amount)),
        # Additive field (frontend CfDetailSheet, piano Batch 1): the payer's
        # account was actually charged the full expense, not just their own
        # quota — `amount` above stays the net quota for backward
        # compatibility, `gross_amount` lets the detail sheet show both and
        # explain the difference instead of leaving it (previously) only
        # documented here in a comment no user ever sees.
        "gross_amount": str(_q2(exp.amount)),
        "category": cat_data,
        "account": account_data,
        # SplitExpense.is_verified (property, splitting/models.py) is always
        # True — a split expense always represents money that has already
        # moved, no "pending" concept in Split (mirrors the shadow-tx in
        # splitting/signals.py).
        "is_verified": exp.is_verified,
    }


def _split_reimbursement_to_item(settlement, user):
    """settlement: SplitSettlement where the observed user is payer or payee.

    No category (like transfer/adjustment today) — hidden when a category
    filter is active, same rule already applied to those two types.
    """
    account = settlement.linked_asset
    account_data = {"id": account.id, "name": account.name} if account else None
    direction = "paid" if settlement.payer_user_id == user.id else "received"

    return {
        "id": f"split_reimbursement_{settlement.id}",
        "source_type": "split_settlement",
        "source_id": settlement.id,
        "type": "split_reimbursement",
        "date": settlement.date,
        "description": settlement.notes or None,
        "amount": str(_q2(settlement.amount)),
        "direction": direction,
        "account": account_data,
        # Additive field (frontend CashFlow row/detail actions, piano Batch
        # 1): a settlement's `group` is optional (None for a cross-group
        # settlement registered from the overall balances overview, see
        # SplitSettlement docstring) — the CashFlow UI needs to know which
        # case it is *before* navigating, to decide between "Apri in Split"
        # (group known — there's a group page to land on) and an in-place
        # delete (group None — no dedicated list exists in Split today).
        "group_id": settlement.group_id,
        "is_verified": settlement.is_verified,
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


def _split_share_outcome_sum(
    user,
    *,
    date_from,
    date_to,
    effective_category_ids,
    effective_parent_category_ids,
    effective_account_ids,
    account_no_link,
    search,
):
    """Sum of the payer's own personal quota (share_amount, see
    `_split_expense_to_item` for why this is share_amount and not
    `amount - share_amount`) across the user's SplitExpense rows, filtered
    the same way as the Expense-based outcome query above (date range /
    category / account / search).

    SplitExpense has no is_verified field (plan sez. 5): a split expense
    always represents money that has already moved (mirrored by the
    always-verified shadow-tx in splitting/signals.py), so it is treated as
    unconditionally verified here — the caller already short-circuits to a
    zero summary when verified=False is explicitly requested, so by the time
    this runs the caller only wants verified (or "any") rows, both of which
    include split expenses.

    Filtered at the SplitExpense level (not SplitExpenseShare) so
    `_apply_expense_dimension_filters` — whose field names are
    `category_id`/`category__parent_id`/`linked_asset_id` — applies
    unmodified; `shares__is_payer=True, shares__participant__user=user` joins
    to exactly one row per expense (DB-enforced single payer per expense).
    """
    qs = SplitExpense.objects.filter(
        shares__is_payer=True, shares__participant__user=user
    )
    qs = _apply_date_verified_filters(qs, date_from=date_from, date_to=date_to)
    qs = _apply_expense_dimension_filters(
        qs,
        effective_category_ids=effective_category_ids,
        effective_parent_category_ids=effective_parent_category_ids,
        effective_account_ids=effective_account_ids,
        account_no_link=account_no_link,
    )
    qs = _apply_search(qs, search, "description")
    return qs.aggregate(total=Sum(F("shares__share_amount")))["total"] or Decimal("0")


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

    if verified is False or not types & {"income", "outcome", "split"}:
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
    if "split" in types:
        # Net payer quota of shared expenses is real outcome money (budget
        # dimension) — see plan sez. 5. split_reimbursement is intentionally
        # NOT added anywhere here (exclusion by omission, same as
        # transfer/adjustment today): a settlement never enters income/outcome.
        outcome += _split_share_outcome_sum(
            user,
            date_from=date_from,
            date_to=date_to,
            effective_category_ids=effective_category_ids,
            effective_parent_category_ids=effective_parent_category_ids,
            effective_account_ids=effective_account_ids,
            account_no_link=account_no_link,
            search=search,
        )
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
      types               — list subset of ["income","outcome","transfer","adjustment",
                             "split","split_reimbursement"]
      search              — substring matched against Expense.description / AssetTransaction.notes
                             (SplitExpense.description for "split" items). SplitSettlement.notes is
                             an EncryptedTextField (randomized ciphertext per write, see
                             fininzen/fields.py) and is deliberately NOT matched: a DB-level
                             icontains against ciphertext would silently return zero results for a
                             genuinely matching plaintext term instead of raising, so
                             split_reimbursement rows are excluded from the search filter (not
                             from the feed) whenever `search` is set — same as encrypted content
                             is never made searchable elsewhere in the app.
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
        split_order = (
            ("-_amt", "-expense__date", "-id")
            if descending
            else ("_amt", "expense__date", "id")
        )
    else:
        expense_order = ("-date", "-id") if descending else ("date", "id")
        tx_order = expense_order
        split_order = (
            ("-expense__date", "-id") if descending else ("expense__date", "id")
        )

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

    def _build_expense_feed_qs():
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
        return qs, expense_order

    def _build_transfer_feed_qs():
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
        return qs, tx_order

    def _build_adjustment_feed_qs():
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
        return qs, tx_order

    def _build_split_feed_qs():
        # Filtered at the SplitExpense level (not the share) so the existing
        # `_apply_expense_dimension_filters` — whose field names are
        # `category_id`/`category__parent_id`/`linked_asset_id` — applies
        # unmodified (plan sez. 5). The matching expense ids are then used to
        # pull the actual payer shares, which is what `_split_expense_to_item`
        # needs to compute the net quota.
        split_exp_qs = SplitExpense.objects.filter(
            shares__is_payer=True, shares__participant__user=user
        )
        split_exp_qs = _apply_date_verified_filters(
            split_exp_qs, date_from=date_from, date_to=date_to
        )
        split_exp_qs = _apply_expense_dimension_filters(
            split_exp_qs,
            effective_category_ids=effective_category_ids,
            effective_parent_category_ids=effective_parent_category_ids,
            effective_account_ids=effective_account_ids,
            account_no_link=account_no_link,
        )
        split_exp_qs = _apply_search(split_exp_qs, search, "description")

        qs = SplitExpenseShare.objects.select_related(
            "expense",
            "expense__category",
            "expense__category__parent",
            "expense__linked_asset",
        ).filter(
            is_payer=True,
            participant__user=user,
            expense_id__in=split_exp_qs.values_list("id", flat=True),
        )

        if amount_sort:
            qs = qs.annotate(_amt=Abs(F("share_amount")))
        return qs, split_order

    def _build_split_reimbursement_feed_qs():
        qs = SplitSettlement.objects.select_related("linked_asset").filter(
            Q(payer_user=user) | Q(payee_user=user)
        )
        qs = _apply_date_verified_filters(qs, date_from=date_from, date_to=date_to)
        if effective_account_ids:
            qs = qs.filter(linked_asset_id__in=effective_account_ids)
        # SECURITY/CORRECTNESS FIX (revisione fase 9, LOW): SplitSettlement.notes
        # is an EncryptedTextField — its ciphertext is randomized per write
        # (fresh nonce), so a DB-level `icontains` WHERE clause against it can
        # never match the plaintext a user actually searched for. Running
        # `_apply_search(qs, search, "notes")` here (as transfer/adjustment do
        # against their *plaintext* AssetTransaction.notes above) silently
        # returned zero split_reimbursement results whenever a search term was
        # active, even when the term genuinely appeared in a settlement's
        # decrypted notes — a silent, unrecoverable false negative. Rather
        # than filter on unusable ciphertext (or hide the whole type behind
        # an active search, which would just trade one false negative for a
        # bigger one), `notes` is intentionally NOT part of the search filter
        # for this type: split_reimbursement rows matching the other active
        # filters (date/account) are always included regardless of `search`
        # — see docstring note above. (No `_apply_search(qs, search, "notes")`
        # call here, unlike every other branch in this function.)

        if amount_sort:
            qs = qs.annotate(_amt=Abs(F("amount")))
        return qs, tx_order

    # Un solo loop invece di cinque blocchi quasi identici ("questo tipo è
    # attivo? c'è un cat-filter che lo esclude? un verified=False lo esclude
    # del tutto? costruisci la queryset, estendi items") — le query restano
    # bespoke per sorgente (closures sopra, comportamento invariato), il
    # guadagno è eliminare la ripetizione del controllo esterno.
    feed_sources = [
        FeedSource(
            "expense",
            frozenset({"income", "outcome"}),
            False,
            False,
            _build_expense_feed_qs,
        ),
        FeedSource(
            "transfer",
            frozenset({"transfer"}),
            True,
            False,
            _build_transfer_feed_qs,
        ),
        FeedSource(
            "adjustment",
            frozenset({"adjustment"}),
            True,
            False,
            _build_adjustment_feed_qs,
        ),
        # SplitExpense/SplitSettlement non hanno un campo is_verified reale
        # (sono sempre verified, vedi SplitExpense.is_verified/
        # SplitSettlement.is_verified in splitting/models.py): un
        # verified=False esplicito (solo righe non verificate) le esclude
        # del tutto invece di sollevare un errore su un campo assente.
        FeedSource(
            "split",
            frozenset({"split"}),
            False,
            True,
            _build_split_feed_qs,
        ),
        FeedSource(
            "split_reimbursement",
            frozenset({"split_reimbursement"}),
            True,
            True,
            _build_split_reimbursement_feed_qs,
        ),
    ]
    to_item_by_kind = {
        "expense": _expense_to_item,
        "transfer": _transfer_to_item,
        "adjustment": _adjustment_to_item,
        "split": _split_expense_to_item,
        "split_reimbursement": lambda s: _split_reimbursement_to_item(s, user),
    }
    for source in feed_sources:
        if not source.is_active(
            types=types, has_cat_filter=has_cat_filter, verified=verified
        ):
            continue
        qs, order_fields = source.build()
        to_item = to_item_by_kind[source.kind]
        items.extend(to_item(obj) for obj in _bounded(qs, order_fields))

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

    Returns: {"expense": [pk, ...], "transfer": [pk, ...], "adjustment": [pk, ...],
              "split": [pk, ...], "split_reimbursement": [pk, ...]}
    ("split" holds SplitExpense pks, "split_reimbursement" holds SplitSettlement
    pks — mirroring how "expense"/"transfer"/"adjustment" hold the source_id of
    their respective feed items.)
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

    out: dict[str, list[int]] = {
        "expense": [],
        "transfer": [],
        "adjustment": [],
        "split": [],
        "split_reimbursement": [],
    }

    def _expense_ids():
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
        return list(qs.values_list("id", flat=True))

    def _transfer_ids():
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
        return list(qs.values_list("id", flat=True))

    def _adjustment_ids():
        qs = AssetTransaction.objects.filter(
            owner=user, transaction_type=AssetTransaction.ADJUSTMENT
        )
        qs = _apply_date_verified_filters(
            qs, date_from=date_from, date_to=date_to, verified=verified
        )
        if effective_account_ids:
            qs = qs.filter(asset_id__in=effective_account_ids)
        qs = _apply_search(qs, search, "notes")
        return list(qs.values_list("id", flat=True))

    def _split_ids():
        qs = SplitExpense.objects.filter(
            shares__is_payer=True, shares__participant__user=user
        )
        qs = _apply_date_verified_filters(qs, date_from=date_from, date_to=date_to)
        qs = _apply_expense_dimension_filters(
            qs,
            effective_category_ids=effective_category_ids,
            effective_parent_category_ids=effective_parent_category_ids,
            effective_account_ids=effective_account_ids,
            account_no_link=account_no_link,
        )
        qs = _apply_search(qs, search, "description")
        return list(qs.values_list("id", flat=True))

    def _split_reimbursement_ids():
        qs = SplitSettlement.objects.filter(Q(payer_user=user) | Q(payee_user=user))
        qs = _apply_date_verified_filters(qs, date_from=date_from, date_to=date_to)
        if effective_account_ids:
            qs = qs.filter(linked_asset_id__in=effective_account_ids)
        # See get_cashflow_feed's split_reimbursement branch: notes is an
        # EncryptedTextField, deliberately not part of the search filter.
        return list(qs.values_list("id", flat=True))

    id_sources = [
        FeedSource(
            "expense", frozenset({"income", "outcome"}), False, False, _expense_ids
        ),
        FeedSource("transfer", frozenset({"transfer"}), True, False, _transfer_ids),
        FeedSource(
            "adjustment", frozenset({"adjustment"}), True, False, _adjustment_ids
        ),
        FeedSource("split", frozenset({"split"}), False, True, _split_ids),
        FeedSource(
            "split_reimbursement",
            frozenset({"split_reimbursement"}),
            True,
            True,
            _split_reimbursement_ids,
        ),
    ]
    for source in id_sources:
        if source.is_active(
            types=types, has_cat_filter=has_cat_filter, verified=verified
        ):
            out[source.kind] = source.build()

    return out
