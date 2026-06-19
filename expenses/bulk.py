"""
expenses/bulk.py — Service layer for the Cash Flow bulk endpoint.

Resolves selections (explicit ids or filtered feed), validates the requested
patch against each row type, and applies edits/deletes atomically. Edits go
through model.save() so the existing signals keep the shadow AssetTransaction
ledger and DashboardSummary cache consistent.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import date as date_cls
from decimal import Decimal
from typing import Iterable

from django.db import transaction

from expenses.cashflow import get_cashflow_ids
from expenses.models import Category, Expense
from portfolio.models import Asset, AssetTransaction, DashboardSummary
from portfolio.services import invalidate_dashboard_summary
from portfolio.signals import _bulk_state

logger = logging.getLogger(__name__)

_CENT = Decimal("0.01")

# Feed-id prefixes — kept in sync with expenses/cashflow.py item construction.
_FEED_ID_PREFIXES: tuple[tuple[str, str], ...] = (
    ("expense_", "expense"),
    ("transfer_", "transfer"),
    ("adjustment_", "adjustment"),
)

# Patch fields allowed per selection kind. A bulk request is rejected outright
# if its selection is not homogeneous (mixed kinds), and again if any field in
# the patch falls outside the set for the selected kind. Adjustments are not
# editable in bulk at all — they may only be deleted.
EXPENSE_FIELDS = frozenset(
    {"is_verified", "date", "description", "category_id", "linked_asset_id"}
)
TRANSFER_FIELDS = frozenset(
    {"is_verified", "date", "notes", "from_account_id", "to_account_id"}
)
ADJUSTMENT_FIELDS = frozenset()
ALL_KNOWN_FIELDS = EXPENSE_FIELDS | TRANSFER_FIELDS

# Map "kind" → allowed patch fields. Kind names match the cashflow feed's
# `type` discriminator: income / outcome / transfer / adjustment. Income and
# outcome share the same model (Expense) so they share the same field set.
FIELDS_BY_KIND: dict[str, frozenset] = {
    "income": EXPENSE_FIELDS,
    "outcome": EXPENSE_FIELDS,
    "transfer": TRANSFER_FIELDS,
    "adjustment": ADJUSTMENT_FIELDS,
}

# Cap on filtered-mode selections to avoid materializing unbounded queryset
# results into memory. A user can still bulk-edit by narrowing filters.
MAX_FILTERED_SELECTION = 5000


class BulkValidationError(ValueError):
    """Raised when the bulk request fails validation. Carries an `errors`
    list (human-readable), a machine-friendly `codes` list, and optional
    `rejected_rows` so the UI can highlight which rows would be skipped."""

    def __init__(self, errors, codes=None, rejected_rows=None):
        if isinstance(errors, str):
            errors = [errors]
        self.errors = list(errors)
        self.codes = list(codes or [])
        self.rejected_rows = list(rejected_rows or [])
        super().__init__("; ".join(self.errors))


class BulkRefreshError(RuntimeError):
    """Raised when post-mutation asset refresh fails inside an atomic bulk.

    Propagating out of `transaction.atomic()` causes the entire bulk to roll
    back, so account balances stay consistent rather than being silently stale.
    """

    def __init__(self, asset_ids):
        self.asset_ids = list(asset_ids)
        super().__init__(f"asset refresh failed for {self.asset_ids}")


@dataclass
class ResolvedSelection:
    expenses: list[Expense] = field(default_factory=list)
    transfer_cash_ins: list[AssetTransaction] = field(default_factory=list)
    adjustments: list[AssetTransaction] = field(default_factory=list)
    # IDs that the request asked for but we could not locate (other user, deleted, etc).
    missing_ids: list[str] = field(default_factory=list)

    @property
    def total(self) -> int:
        return len(self.expenses) + len(self.transfer_cash_ins) + len(self.adjustments)

    @property
    def by_type(self) -> dict:
        return {
            "expense": len(self.expenses),
            "transfer": len(self.transfer_cash_ins),
            "adjustment": len(self.adjustments),
        }


# ── ID parsing ───────────────────────────────────────────────────────────────


def _parse_feed_id(feed_id) -> tuple[str, int] | None:
    """Split 'expense_42' / 'transfer_7' / 'adjustment_3' into (kind, pk)."""
    if not isinstance(feed_id, str):
        return None
    for prefix, kind in _FEED_ID_PREFIXES:
        if feed_id.startswith(prefix):
            tail = feed_id[len(prefix) :]
            if tail.isdigit():
                return kind, int(tail)
            return None
    return None


def _parse_ids(raw_ids) -> dict[str, list[int]]:
    """Group user-supplied feed ids into {kind: [pk, …]}, dropping malformed entries."""
    grouped: dict[str, list[int]] = {"expense": [], "transfer": [], "adjustment": []}
    for raw in raw_ids or []:
        parsed = _parse_feed_id(raw)
        if parsed is None:
            continue
        kind, pk = parsed
        grouped[kind].append(pk)
    return grouped


def _parse_filters(raw_filters) -> dict:
    """Coerce a JSON filter blob into the shape get_cashflow_feed expects."""
    raw_filters = raw_filters or {}
    out: dict = {}
    df = raw_filters.get("date_from")
    if df:
        try:
            out["date_from"] = date_cls.fromisoformat(df)
        except (TypeError, ValueError) as exc:
            raise BulkValidationError("invalid date_from", ["invalid_date"]) from exc
    dt = raw_filters.get("date_to")
    if dt:
        try:
            out["date_to"] = date_cls.fromisoformat(dt)
        except (TypeError, ValueError) as exc:
            raise BulkValidationError("invalid date_to", ["invalid_date"]) from exc

    cat_ids = raw_filters.get("category_ids") or []
    if cat_ids:
        try:
            out["category_ids"] = [int(x) for x in cat_ids]
        except (TypeError, ValueError) as exc:
            raise BulkValidationError(
                "invalid category_ids", ["invalid_filter"]
            ) from exc
    parent_ids = raw_filters.get("parent_category_ids") or []
    if parent_ids:
        try:
            out["parent_category_ids"] = [int(x) for x in parent_ids]
        except (TypeError, ValueError) as exc:
            raise BulkValidationError(
                "invalid parent_category_ids", ["invalid_filter"]
            ) from exc

    raw_accounts = raw_filters.get("account_ids") or []
    numeric_accounts = []
    for value in raw_accounts:
        if value == "none":
            out["account_no_link"] = True
        else:
            try:
                numeric_accounts.append(int(value))
            except (TypeError, ValueError) as exc:
                raise BulkValidationError(
                    "invalid account_ids", ["invalid_filter"]
                ) from exc
    if numeric_accounts:
        out["account_ids"] = numeric_accounts

    types = raw_filters.get("types")
    valid = {"income", "outcome", "transfer", "adjustment"}
    if types:
        bad = [t for t in types if t not in valid]
        if bad:
            raise BulkValidationError(f"unknown types: {bad}", ["invalid_filter"])
        out["types"] = list(types)

    verified = raw_filters.get("verified")
    if verified is not None:
        if isinstance(verified, bool):
            out["verified"] = verified
        else:
            normalized = str(verified).strip().lower()
            if normalized in ("true", "1"):
                out["verified"] = True
            elif normalized in ("false", "0"):
                out["verified"] = False
            else:
                raise BulkValidationError(
                    f"invalid verified value: {verified!r}", ["invalid_filter"]
                )

    search = raw_filters.get("search")
    if search:
        out["search"] = str(search).strip()
    return out


# ── Selection resolution ─────────────────────────────────────────────────────


def _fetch_expenses(user, ids: Iterable[int]) -> list[Expense]:
    if not ids:
        return []
    return list(
        Expense.objects.select_related("category", "linked_asset").filter(
            owner=user, pk__in=ids
        )
    )


def _fetch_transfers(user, ids: Iterable[int]) -> list[AssetTransaction]:
    """Transfers are identified by their CASH_IN leg id."""
    if not ids:
        return []
    return list(
        AssetTransaction.objects.select_related(
            "asset", "derived_from", "derived_from__asset"
        ).filter(
            owner=user,
            pk__in=ids,
            transaction_type=AssetTransaction.CASH_IN,
            derived_from__isnull=False,
        )
    )


def _fetch_adjustments(user, ids: Iterable[int]) -> list[AssetTransaction]:
    if not ids:
        return []
    return list(
        AssetTransaction.objects.select_related("asset").filter(
            owner=user,
            pk__in=ids,
            transaction_type=AssetTransaction.ADJUSTMENT,
        )
    )


def resolve_selection(user, selection: dict) -> ResolvedSelection:
    """Resolve the request's selection block into concrete ORM rows."""
    mode = (selection or {}).get("mode")
    if mode == "ids":
        grouped = _parse_ids((selection or {}).get("ids") or [])
        expenses = _fetch_expenses(user, grouped["expense"])
        transfers = _fetch_transfers(user, grouped["transfer"])
        adjustments = _fetch_adjustments(user, grouped["adjustment"])
        found_expense = {e.pk for e in expenses}
        found_transfer = {t.pk for t in transfers}
        found_adj = {t.pk for t in adjustments}
        missing = []
        missing.extend(
            f"expense_{pk}" for pk in grouped["expense"] if pk not in found_expense
        )
        missing.extend(
            f"transfer_{pk}" for pk in grouped["transfer"] if pk not in found_transfer
        )
        missing.extend(
            f"adjustment_{pk}" for pk in grouped["adjustment"] if pk not in found_adj
        )
        return ResolvedSelection(
            expenses=expenses,
            transfer_cash_ins=transfers,
            adjustments=adjustments,
            missing_ids=missing,
        )

    if mode == "filtered":
        filters = _parse_filters((selection or {}).get("filters"))
        # Fast id-only resolution avoids materializing the full feed.
        ids_by_kind = get_cashflow_ids(user, filters)
        exclude_raw = (selection or {}).get("exclude_ids") or []
        exclude_grouped = _parse_ids(exclude_raw)
        exclude_sets = {
            kind: set(exclude_grouped[kind])
            for kind in ("expense", "transfer", "adjustment")
        }
        kept: dict[str, list[int]] = {
            kind: [pk for pk in ids_by_kind[kind] if pk not in exclude_sets[kind]]
            for kind in ("expense", "transfer", "adjustment")
        }
        total = sum(len(v) for v in kept.values())
        if total > MAX_FILTERED_SELECTION:
            raise BulkValidationError(
                f"filtered selection exceeds {MAX_FILTERED_SELECTION} rows "
                f"({total} matched); narrow the filters before bulk apply",
                ["filtered_too_large"],
            )
        return ResolvedSelection(
            expenses=_fetch_expenses(user, kept["expense"]),
            transfer_cash_ins=_fetch_transfers(user, kept["transfer"]),
            adjustments=_fetch_adjustments(user, kept["adjustment"]),
        )

    raise BulkValidationError(
        "selection.mode must be 'ids' or 'filtered'", ["invalid_selection_mode"]
    )


# ── Patch validation ─────────────────────────────────────────────────────────


def _selection_kind(selection: ResolvedSelection) -> str | None:
    """Return the single homogeneous kind of the selection, or None if mixed.

    Kinds: 'income' | 'outcome' | 'transfer' | 'adjustment'.
    A selection that mixes top-level kinds (e.g. expense + transfer), or that
    contains both income and outcome expenses, is considered mixed.
    """
    has_expense = bool(selection.expenses)
    has_transfer = bool(selection.transfer_cash_ins)
    has_adjustment = bool(selection.adjustments)

    n_top = sum([has_expense, has_transfer, has_adjustment])
    if n_top != 1:
        return None
    if has_adjustment:
        return "adjustment"
    if has_transfer:
        return "transfer"
    # Only expenses: must be all-income or all-outcome.
    directions = {_expense_direction(e) for e in selection.expenses}
    if len(directions) != 1:
        return None
    only = next(iter(directions))
    return "income" if only == Category.INCOME else "outcome"


def _validate_patch_fields(
    patch: dict,
    kind: str | None,
    errors: list[str],
    codes: list[str],
) -> set[str]:
    """Return the patch keys that the user actually included.

    Rejects keys outside the allowed set for the selection's kind. Adjustments
    have an empty field set — any edit attempt registers as
    `adjustment_not_editable`.
    """
    if not isinstance(patch, dict):
        errors.append("patch must be an object")
        codes.append("invalid_patch")
        return set()
    active = set(patch.keys())
    if not active:
        return set()

    unknown = active - ALL_KNOWN_FIELDS
    if unknown:
        errors.append(f"unknown patch fields: {sorted(unknown)}")
        codes.append("unknown_patch_fields")

    allowed = FIELDS_BY_KIND.get(kind, frozenset())
    not_applicable = (active & ALL_KNOWN_FIELDS) - allowed
    if not_applicable:
        if kind == "adjustment":
            errors.append("adjustments cannot be bulk-edited; delete-only")
            codes.append("adjustment_not_editable")
        else:
            errors.append(
                f"fields not applicable to selection kind {kind!r}: "
                + ",".join(sorted(not_applicable))
            )
            codes.append("fields_not_applicable")

    return active


def _normalize_date(value):
    if value in (None, ""):
        return None
    if isinstance(value, date_cls):
        return value
    try:
        return date_cls.fromisoformat(str(value))
    except (TypeError, ValueError) as exc:
        raise BulkValidationError(f"invalid date: {value!r}", ["invalid_date"]) from exc


def _expense_direction(expense: Expense) -> str:
    """Mirror the rule signals.py uses to pick CASH_OUT vs CASH_IN for shadow tx.

    A category-less expense is treated as `expense` direction (CASH_OUT) by the
    signal, so we must reject moving it to an income category — otherwise the
    bulk would silently flip the balance.
    """
    cat = expense.category
    if cat is None:
        return Category.EXPENSE
    return cat.category_type


def _resolve_target_category(
    user, raw_value, expenses: list[Expense]
) -> Category | None:
    """Resolve category_id payload (None / null clears, int picks by pk).

    Raises BulkValidationError if the picked category does not match the
    direction of any selected expense (a mismatch would silently flip an
    income into an expense or vice-versa). On mismatch the error carries the
    offending row ids in `rejected_rows` so the UI can highlight them.
    """
    if raw_value in (None, "", "null"):
        return None
    try:
        cat_id = int(raw_value)
    except (TypeError, ValueError) as exc:
        raise BulkValidationError(
            f"invalid category_id: {raw_value!r}", ["invalid_category"]
        ) from exc
    cat = Category.objects.filter(pk=cat_id, owner=user).first()
    if cat is None:
        raise BulkValidationError(
            f"category {cat_id} not found", ["category_not_found"]
        )
    mismatches = [e for e in expenses if _expense_direction(e) != cat.category_type]
    if mismatches:
        raise BulkValidationError(
            f"category direction mismatch on {len(mismatches)} expense(s); "
            "select only same-direction rows",
            codes=["category_direction_mismatch"],
            rejected_rows=[
                {"id": f"expense_{e.pk}", "reason": "category_direction_mismatch"}
                for e in mismatches
            ],
        )
    return cat


def _resolve_target_account(user, raw_value) -> Asset | None:
    """Resolve linked_asset_id payload to a manual bank account owned by the user."""
    if raw_value in (None, "", "null"):
        return None
    try:
        asset_id = int(raw_value)
    except (TypeError, ValueError) as exc:
        raise BulkValidationError(
            f"invalid linked_asset_id: {raw_value!r}", ["invalid_account"]
        ) from exc
    asset = (
        Asset.objects.filter(
            pk=asset_id,
            owner=user,
            tracking_type=Asset.MANUAL,
            investment_type__is_bank_account=True,
        )
        .select_related("investment_type")
        .first()
    )
    if asset is None:
        raise BulkValidationError(
            f"account {asset_id} not found or not a manual bank account",
            ["account_not_bank"],
        )
    return asset


# ── Preview / report ─────────────────────────────────────────────────────────


def _expense_amount(exp: Expense) -> Decimal:
    return exp.amount or Decimal("0")


def _tx_amount(tx: AssetTransaction) -> Decimal:
    return (tx.shares * tx.price_per_share).quantize(_CENT)


@dataclass
class _ValidatedRequest:
    """Output of the validate-and-resolve helper, shared by preview and apply."""

    action: str
    kind: str | None
    selection: ResolvedSelection
    patch_keys: set[str]
    resolved_category: Category | None
    resolved_account: Asset | None
    resolved_from_account: Asset | None
    resolved_to_account: Asset | None
    report: dict


def _validate_and_resolve(user, payload: dict) -> _ValidatedRequest:
    """Single source of truth for preview/apply: validates + resolves the request once."""
    action = payload.get("action")
    if action not in ("edit", "delete"):
        raise BulkValidationError(
            "action must be 'edit' or 'delete'", ["invalid_action"]
        )

    selection = resolve_selection(user, payload.get("selection") or {})
    errors: list[str] = []
    error_codes: list[str] = []
    warnings: list[str] = []
    rejected_rows: list[dict] = []

    total_amount = Decimal("0")
    for e in selection.expenses:
        total_amount += _expense_amount(e)
    for t in selection.transfer_cash_ins:
        total_amount += _tx_amount(t)
    for a in selection.adjustments:
        total_amount += _tx_amount(a)

    kind = _selection_kind(selection)
    if selection.total > 0 and kind is None:
        errors.append(
            "selection mixes incompatible kinds (income / outcome / transfer / adjustment)"
        )
        error_codes.append("mixed_kinds")

    patch_keys: set[str] = set()
    resolved_category: Category | None = None
    resolved_account: Asset | None = None
    resolved_from_account: Asset | None = None
    resolved_to_account: Asset | None = None
    patch = payload.get("patch") or {}

    # An empty selection (nothing resolved, or every row filtered out by the
    # ownership scope) is a clean no-op: skip field-applicability validation so
    # a valid patch against zero rows returns 200 instead of a spurious
    # `fields_not_applicable` (kind is None for an empty selection).
    if action == "edit" and not error_codes and selection.total > 0:
        patch_keys = _validate_patch_fields(patch, kind, errors, error_codes)
        if not patch_keys and not errors:
            errors.append("patch must include at least one field for action=edit")
            error_codes.append("empty_patch")
        elif patch_keys and not error_codes:
            # Resolve targets ONCE here; the apply path reuses these instances
            # instead of re-querying per row.
            try:
                if "date" in patch_keys:
                    _parsed_date = _normalize_date(patch.get("date"))
                    if _parsed_date is None:
                        raise BulkValidationError(
                            "date cannot be empty", ["invalid_date"]
                        )
                if "category_id" in patch_keys:
                    resolved_category = _resolve_target_category(
                        user, patch.get("category_id"), selection.expenses
                    )
                if "linked_asset_id" in patch_keys:
                    resolved_account = _resolve_target_account(
                        user, patch.get("linked_asset_id")
                    )
                if "from_account_id" in patch_keys:
                    resolved_from_account = _resolve_target_account(
                        user, patch.get("from_account_id")
                    )
                if "to_account_id" in patch_keys:
                    resolved_to_account = _resolve_target_account(
                        user, patch.get("to_account_id")
                    )
                # Refuse any transfer that would end up with the same asset on
                # both sides after the patch — covers one-side-only patches too
                # (e.g. patching only from_account to match the existing to_account).
                if "from_account_id" in patch_keys or "to_account_id" in patch_keys:
                    for _t in selection.transfer_cash_ins:
                        _to_pk = (
                            resolved_to_account.pk
                            if "to_account_id" in patch_keys and resolved_to_account
                            else _t.asset_id
                        )
                        _from_pk = (
                            resolved_from_account.pk
                            if "from_account_id" in patch_keys and resolved_from_account
                            else (_t.derived_from.asset_id if _t.derived_from else None)
                        )
                        if (
                            _to_pk is not None
                            and _from_pk is not None
                            and _to_pk == _from_pk
                        ):
                            raise BulkValidationError(
                                "transfer would target the same account on both sides",
                                ["same_account_transfer"],
                            )
            except BulkValidationError as exc:
                errors.extend(exc.errors)
                error_codes.extend(exc.codes)
                rejected_rows.extend(exc.rejected_rows)

    if selection.total == 0 and not errors:
        warnings.append("selection is empty")

    report = {
        "ok": not errors,
        "action": action,
        "kind": kind,
        "total_selected": selection.total,
        "total_amount": str(total_amount.quantize(_CENT)),
        "by_type": selection.by_type,
        "missing_ids": selection.missing_ids,
        "patch_fields": sorted(patch_keys),
        "errors": errors,
        "error_codes": error_codes,
        "rejected_rows": rejected_rows,
        "warnings": warnings,
    }
    return _ValidatedRequest(
        action=action,
        kind=kind,
        selection=selection,
        patch_keys=patch_keys,
        resolved_category=resolved_category,
        resolved_account=resolved_account,
        resolved_from_account=resolved_from_account,
        resolved_to_account=resolved_to_account,
        report=report,
    )


def compute_preview(user, payload: dict) -> dict:
    """Validate the request and report what would happen, without writing."""
    return _validate_and_resolve(user, payload).report


# ── Apply ────────────────────────────────────────────────────────────────────


def _apply_expense_edit(
    expense: Expense,
    patch: dict,
    patch_keys: set[str],
    resolved_category: Category | None,
    resolved_account: Asset | None,
) -> None:
    """Mutate a single Expense and persist; signals refresh shadow ledger."""
    changed = False
    if "is_verified" in patch_keys:
        expense.is_verified = bool(patch["is_verified"])
        changed = True
    if "date" in patch_keys:
        new_date = _normalize_date(patch["date"])
        if new_date is not None:
            expense.date = new_date
            changed = True
    if "description" in patch_keys:
        text = patch["description"]
        expense.description = (str(text) if text is not None else "").strip()
        changed = True
    if "category_id" in patch_keys:
        expense.category = resolved_category
        changed = True
    if "linked_asset_id" in patch_keys:
        expense.linked_asset = resolved_account
        changed = True
    if changed:
        expense.save()


def _apply_transfer_edit(
    cash_in: AssetTransaction,
    patch: dict,
    patch_keys: set[str],
    resolved_from_account: Asset | None,
    resolved_to_account: Asset | None,
) -> None:
    """Patch both legs of a transfer so the aggregated feed stays consistent.

    `from_account_id` mutates the CASH_OUT leg's asset; `to_account_id` mutates
    the CASH_IN leg's asset. Either side may be cleared to None (no-op for the
    schema since asset is nullable on AssetTransaction? — guarded by validation).
    """
    cash_out = cash_in.derived_from
    legs = [cash_in] + ([cash_out] if cash_out else [])

    new_date = None
    if "date" in patch_keys:
        new_date = _normalize_date(patch["date"])

    new_verified = None
    if "is_verified" in patch_keys:
        new_verified = bool(patch["is_verified"])

    set_notes = "notes" in patch_keys
    new_notes = None
    if set_notes:
        notes_value = patch["notes"]
        new_notes = (str(notes_value) if notes_value is not None else "").strip()

    set_from_account = "from_account_id" in patch_keys
    set_to_account = "to_account_id" in patch_keys

    # Per-leg update_fields differ: only the CASH_OUT leg moves `asset` when
    # `from_account_id` is patched, only the CASH_IN leg when `to_account_id`.
    shared_fields: list[str] = []
    if new_date is not None:
        shared_fields.append("date")
    if new_verified is not None:
        shared_fields.append("is_verified")
    if set_notes:
        shared_fields.append("notes")

    if not shared_fields and not set_from_account and not set_to_account:
        return

    for leg in legs:
        leg_fields = list(shared_fields)
        if new_date is not None:
            leg.date = new_date
        if new_verified is not None:
            leg.is_verified = new_verified
        if set_notes:
            leg.notes = new_notes
        if set_to_account and leg.transaction_type == AssetTransaction.CASH_IN:
            leg.asset = resolved_to_account
            leg_fields.append("asset")
        if set_from_account and leg.transaction_type == AssetTransaction.CASH_OUT:
            leg.asset = resolved_from_account
            leg_fields.append("asset")
        if leg_fields:
            leg.save(update_fields=leg_fields)


def _apply_adjustment_edit(
    adj: AssetTransaction, patch: dict, patch_keys: set[str]
) -> None:
    update_fields: list[str] = []
    if "date" in patch_keys:
        new_date = _normalize_date(patch["date"])
        if new_date is not None:
            adj.date = new_date
            update_fields.append("date")
    if "is_verified" in patch_keys:
        adj.is_verified = bool(patch["is_verified"])
        update_fields.append("is_verified")
    if "notes" in patch_keys:
        notes_value = patch["notes"]
        adj.notes = (str(notes_value) if notes_value is not None else "").strip()
        update_fields.append("notes")
    if update_fields:
        adj.save(update_fields=update_fields)


def _delete_transfer(cash_in: AssetTransaction) -> None:
    """Deleting the CASH_OUT leg cascades to its derived CASH_IN."""
    cash_out = cash_in.derived_from
    if cash_out is not None:
        cash_out.delete()
    else:
        cash_in.delete()


def _refresh_assets_strict(asset_ids: Iterable[int]) -> None:
    """Recompute manual bank accounts touched by bulk transfer/adjustment ops.

    Propagates a `BulkRefreshError` if any asset refresh fails. Called inside
    `transaction.atomic()` so the failure rolls back the entire bulk —
    account balances stay consistent rather than going silently stale.
    """
    from portfolio.services import _refresh_manual_asset_strict

    seen: set[int] = set()
    failed: list[int] = []
    for aid in asset_ids:
        if aid is None or aid in seen:
            continue
        seen.add(aid)
        try:
            asset = Asset.objects.get(pk=aid)
        except Asset.DoesNotExist:
            continue
        try:
            _refresh_manual_asset_strict(asset)
        except Exception:
            logger.exception("bulk: asset refresh failed asset_id=%s", aid)
            failed.append(aid)
    if failed:
        raise BulkRefreshError(failed)


def apply_bulk(user, payload: dict) -> dict:
    """Run the operation. Returns the same shape as compute_preview plus applied counts.

    Asset balance recompute happens inside the same atomic transaction; if a
    refresh fails, `BulkRefreshError` propagates and the whole bulk rolls
    back. The view layer converts that into HTTP 409 so the client can retry.
    """
    validated = _validate_and_resolve(user, payload)
    if not validated.report["ok"]:
        return validated.report

    action = validated.action
    selection = validated.selection
    patch_keys = validated.patch_keys
    patch = payload.get("patch") or {}

    applied_expense = 0
    applied_transfer = 0
    applied_adjustment = 0
    affected_asset_ids: set[int] = set()
    runtime_missing: list[str] = []

    with transaction.atomic():
        if action == "edit":
            # Suppress per-expense post_save recomputes (same reason as delete):
            # each expense.save() would otherwise trigger _recompute_and_rebuild_asset
            # via sync_expense_to_asset signal. One _refresh_assets_strict call at
            # the end covers all touched assets in a single pass.
            _bulk_state.skip_recompute = True
            try:
                for e in selection.expenses:
                    if e.linked_asset_id is not None:
                        affected_asset_ids.add(e.linked_asset_id)
                    try:
                        _apply_expense_edit(
                            e,
                            patch,
                            patch_keys,
                            validated.resolved_category,
                            validated.resolved_account,
                        )
                    except Expense.DoesNotExist:
                        runtime_missing.append(f"expense_{e.pk}")
                        continue
                    if e.linked_asset_id is not None:
                        affected_asset_ids.add(e.linked_asset_id)
                    applied_expense += 1
                for t in selection.transfer_cash_ins:
                    affected_asset_ids.add(t.asset_id)
                    if t.derived_from_id:
                        affected_asset_ids.add(t.derived_from.asset_id)
                    try:
                        _apply_transfer_edit(
                            t,
                            patch,
                            patch_keys,
                            validated.resolved_from_account,
                            validated.resolved_to_account,
                        )
                    except AssetTransaction.DoesNotExist:
                        runtime_missing.append(f"transfer_{t.pk}")
                        continue
                    if validated.resolved_to_account is not None:
                        affected_asset_ids.add(validated.resolved_to_account.pk)
                    if validated.resolved_from_account is not None:
                        affected_asset_ids.add(validated.resolved_from_account.pk)
                    applied_transfer += 1
                for a in selection.adjustments:
                    affected_asset_ids.add(a.asset_id)
                    try:
                        _apply_adjustment_edit(a, patch, patch_keys)
                    except AssetTransaction.DoesNotExist:
                        runtime_missing.append(f"adjustment_{a.pk}")
                        continue
                    applied_adjustment += 1
            finally:
                _bulk_state.skip_recompute = False
            _refresh_assets_strict(affected_asset_ids)
        else:  # action == "delete"
            # Suppress per-item signal recomputations: with N=150 expenses each
            # triggering _recompute_asset_locked + rebuild_manual_history twice
            # (pre_delete on Expense + post_delete on the shadow AssetTransaction),
            # a single bulk ends up with 300+ expensive calls synchronously.
            # The flag short-circuits both handlers; the single _refresh_assets_strict
            # call below performs the one necessary recomputation per unique asset.
            _bulk_state.skip_recompute = True
            try:
                for e in selection.expenses:
                    if e.linked_asset_id is not None:
                        affected_asset_ids.add(e.linked_asset_id)
                    try:
                        e.delete()
                    except Expense.DoesNotExist:
                        runtime_missing.append(f"expense_{e.pk}")
                        continue
                    applied_expense += 1
                for t in selection.transfer_cash_ins:
                    affected_asset_ids.add(t.asset_id)
                    if t.derived_from_id:
                        affected_asset_ids.add(t.derived_from.asset_id)
                    try:
                        _delete_transfer(t)
                    except AssetTransaction.DoesNotExist:
                        runtime_missing.append(f"transfer_{t.pk}")
                        continue
                    applied_transfer += 1
                for a in selection.adjustments:
                    affected_asset_ids.add(a.asset_id)
                    try:
                        a.delete()
                    except AssetTransaction.DoesNotExist:
                        runtime_missing.append(f"adjustment_{a.pk}")
                        continue
                    applied_adjustment += 1
            finally:
                _bulk_state.skip_recompute = False
            _refresh_assets_strict(affected_asset_ids)

        # Invalidate the dashboard cache as part of the same atomic unit. Using
        # on_commit guarantees we never invalidate before the data has been
        # committed (and never miss invalidation if the commit succeeds).
        invalidation_reason = (
            DashboardSummary.REASON_TRANSACTION
            if action == "delete"
            else DashboardSummary.REASON_EXPENSE_UPDATED
        )
        transaction.on_commit(
            lambda: invalidate_dashboard_summary(invalidation_reason, user=user)
        )

    response = {
        **validated.report,
        "applied": {
            "expense": applied_expense,
            "transfer": applied_transfer,
            "adjustment": applied_adjustment,
            "total": applied_expense + applied_transfer + applied_adjustment,
        },
    }
    if runtime_missing:
        response["missing_ids"] = (
            list(response.get("missing_ids") or []) + runtime_missing
        )
    return response
