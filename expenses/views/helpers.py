import logging
import re
from decimal import Decimal, InvalidOperation

logger = logging.getLogger(__name__)
_IMPORT_CENT = Decimal("0.01")
IMPORT_MAX_ROWS = 5000


def _parse_import_amount(value):
    raw = str(value or "").strip().replace("\xa0", " ").replace("−", "-")
    if not raw:
        raise InvalidOperation("empty amount")
    numeric = re.sub(r"[^0-9,.'-]", "", raw).replace("'", "")
    is_negative = numeric.startswith("-") or raw.startswith("(")
    numeric = numeric.replace("-", "")
    if not numeric or not re.search(r"\d", numeric):
        raise InvalidOperation("invalid amount")

    last_comma = numeric.rfind(",")
    last_dot = numeric.rfind(".")
    if last_comma >= 0 and last_dot >= 0:
        decimal_sep = "," if last_comma > last_dot else "."
        thousands_sep = "." if decimal_sep == "," else ","
        numeric = numeric.replace(thousands_sep, "")
        if decimal_sep == ",":
            numeric = numeric.replace(",", ".")
    elif last_comma >= 0:
        numeric = numeric.replace(".", "").replace(",", ".")

    amount = Decimal(numeric)
    if is_negative:
        amount = -amount
    return abs(amount).quantize(_IMPORT_CENT)


def _update_expense_categories(queryset, category):
    """Update categories without bypassing linked-account shadow sync.

    Linked expenses must go through `save()` so post_save updates the
    AssetTransaction shadow type when the category type changes.
    """
    linked = list(queryset.filter(linked_asset_id__isnull=False))
    queryset.filter(linked_asset_id__isnull=True).update(category=category)
    for expense in linked:
        expense.category = category
        expense.save(update_fields=["category"])
