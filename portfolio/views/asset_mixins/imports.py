import logging
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from ...models import (
    Asset,
    AssetTransaction,
    InvestmentType,
)
from ...serializers import (
    AssetTransactionSerializer,
)
from ...services import (
    create_transaction,
    _refresh_manual_asset,
)
from datetime import date as date_cls
from decimal import Decimal, ROUND_DOWN, ROUND_HALF_UP
from finnet.utils import parse_optional_bool

from .._common import (
    _resolve_contribution_source,
    IMPORT_PRICE_QUANT,
    IMPORT_SHARES_QUANT,
    IMPORT_MAX_ROWS,
)

logger = logging.getLogger(__name__)


class _AssetImportMixin:
    @action(detail=False, methods=["post"], url_path="import-assets")
    def import_assets(self, request):
        """POST /api/portfolio/import-assets/

        Body: {
          rows: [{name?, isin?, transaction_type|segno, date, shares,
                  price_per_share, source_account_id?, contribution_source?, notes?}],
          preview_only?: bool,
          include_duplicate_rows?: [row_number...]
        }

        This importer does NOT create new assets.
        It resolves a pre-existing asset by ISIN (preferred) then name.
        """
        from ...services import (
            parse_import_date,
            parse_import_decimal,
            create_transaction,
        )

        owner = self.get_effective_user()
        rows = request.data.get("rows", [])
        if not isinstance(rows, list) or len(rows) > IMPORT_MAX_ROWS:
            return Response(
                {"error": f"rows must be a list with at most {IMPORT_MAX_ROWS} items"},
                status=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            )
        preview_only = bool(request.data.get("preview_only", False))
        include_duplicate_rows = request.data.get("include_duplicate_rows", []) or []
        include_duplicate_rows = {
            int(v) for v in include_duplicate_rows if str(v).strip().isdigit()
        }
        imported = 0
        skipped = 0
        errors = []
        duplicate_rows = []
        imported_rows = []

        for i, row in enumerate(rows):
            try:
                row_number = i + 1
                isin = str(row.get("isin", "")).strip()[:12]
                name = str(row.get("name", "")).strip()
                if not isin and not name:
                    errors.append(
                        {
                            "row": row_number,
                            "error": "missing match keys (isin or name)",
                        }
                    )
                    skipped += 1
                    continue

                asset = None
                if isin:
                    asset = Asset.objects.filter(owner=owner, isin__iexact=isin).first()
                if not asset and name:
                    asset = Asset.objects.filter(owner=owner, name__iexact=name).first()
                if not asset:
                    errors.append(
                        {
                            "row": row_number,
                            "error": f"asset not found (isin='{isin}' name='{name}')",
                        }
                    )
                    skipped += 1
                    continue

                raw_tx_type = str(row.get("transaction_type", "")).strip().lower()
                if raw_tx_type in {AssetTransaction.BUY, AssetTransaction.SELL}:
                    tx_type = raw_tx_type
                else:
                    segno = str(row.get("segno", "")).strip().upper()
                    if segno == "A":
                        tx_type = AssetTransaction.BUY
                    elif segno:
                        tx_type = AssetTransaction.SELL
                    else:
                        errors.append(
                            {
                                "row": row_number,
                                "error": "missing transaction_type (or legacy segno)",
                            }
                        )
                        skipped += 1
                        continue

                tx_date = parse_import_date(row.get("date"))
                if not tx_date:
                    errors.append(
                        {
                            "row": row_number,
                            "error": f"invalid date '{row.get('date')}'",
                        }
                    )
                    skipped += 1
                    continue

                shares = parse_import_decimal(row.get("shares"))
                price = parse_import_decimal(row.get("price_per_share"))
                if shares is None or shares <= 0:
                    errors.append({"row": row_number, "error": "shares must be > 0"})
                    skipped += 1
                    continue
                shares = shares.quantize(IMPORT_SHARES_QUANT, rounding=ROUND_DOWN)
                if shares <= 0:
                    errors.append({"row": row_number, "error": "shares must be > 0"})
                    skipped += 1
                    continue
                if price is None or price <= 0:
                    errors.append(
                        {"row": row_number, "error": "price_per_share must be > 0"}
                    )
                    skipped += 1
                    continue
                price = price.quantize(IMPORT_PRICE_QUANT, rounding=ROUND_HALF_UP)
                is_verified = parse_optional_bool(row.get("is_verified"))

                source_account_id = (
                    str(
                        row.get("source_account_id")
                        or row.get("debit_from_account")
                        or ""
                    ).strip()
                    or None
                )

                is_duplicate = AssetTransaction.objects.filter(
                    asset=asset,
                    transaction_type=tx_type,
                    date=tx_date,
                    shares=shares,
                    price_per_share=price,
                ).exists()
                if is_duplicate:
                    raw_contribution_source = str(
                        row.get("contribution_source", "")
                    ).strip()
                    duplicate_rows.append(
                        {
                            "row": row_number,
                            "asset_id": asset.id,
                            "asset_name": asset.name,
                            "transaction_type": tx_type,
                            "date": str(tx_date),
                            "shares": str(shares),
                            "price_per_share": str(price),
                            "source_account_id": source_account_id,
                            "contribution_source": raw_contribution_source,
                        }
                    )
                    if preview_only:
                        continue
                    if row_number not in include_duplicate_rows:
                        skipped += 1
                        continue

                if preview_only:
                    continue

                contribution_source = _resolve_contribution_source(
                    owner, row.get("contribution_source")
                )
                serializer_data = {
                    "transaction_type": tx_type,
                    "date": tx_date,
                    "shares": shares,
                    "price_per_share": price,
                    "notes": str(row.get("notes", "")).strip()[:255],
                    "contribution_source": (
                        contribution_source.pk if contribution_source else None
                    ),
                }
                if is_verified is not None:
                    serializer_data["is_verified"] = is_verified
                tx_serializer = AssetTransactionSerializer(
                    data=serializer_data,
                    context={"request": request},
                )
                try:
                    tx_serializer.is_valid(raise_exception=True)
                except ValidationError as e:
                    detail = e.detail
                    if isinstance(detail, dict):
                        field, messages = next(iter(detail.items()))
                        if isinstance(messages, list) and messages:
                            msg = messages[0]
                        else:
                            msg = messages
                        errors.append({"row": row_number, "error": f"{field}: {msg}"})
                    elif isinstance(detail, list) and detail:
                        errors.append({"row": row_number, "error": str(detail[0])})
                    else:
                        errors.append({"row": row_number, "error": str(detail)})
                    skipped += 1
                    continue
                create_transaction(
                    asset,
                    tx_serializer,
                    source_account_id=source_account_id,
                    owner=owner,
                )
                imported += 1
                imported_rows.append(
                    {
                        "row": row_number,
                        "asset_id": asset.id,
                        "asset_name": asset.name,
                        "transaction_type": tx_type,
                        "date": str(tx_date),
                        "shares": str(shares),
                        "price_per_share": str(price),
                    }
                )
            except ValueError as e:
                errors.append({"row": row_number, "error": str(e)})
                skipped += 1
            except Exception:
                logger.exception("import: row %d failed", row_number)
                errors.append({"row": row_number, "error": "unexpected error"})
                skipped += 1

        if preview_only:
            return Response(
                {
                    "rows": len(rows),
                    "duplicates": len(duplicate_rows),
                    "duplicate_rows": duplicate_rows[:200],
                    "errors": errors[:50],
                }
            )

        logger.info(
            "import_assets_as_transactions: user=%s imported=%d skipped=%d errors=%d",
            owner,
            imported,
            skipped,
            len(errors),
        )
        return Response(
            {
                "imported": imported,
                "skipped": skipped,
                "duplicates": len(duplicate_rows),
                "imported_rows": imported_rows[:200],
                "errors": errors[:50],
            }
        )

    @action(detail=False, methods=["post"], url_path="import-transactions")
    def import_transactions(self, request):
        """POST /api/portfolio/import-transactions/

        Body: {rows: [{asset_id, transaction_type, date, shares,
        price_per_share, contribution_source?, notes?}]}
        """
        from ...services import parse_import_date, parse_import_decimal

        owner = self.get_effective_user()
        rows = request.data.get("rows", [])
        if not isinstance(rows, list) or len(rows) > IMPORT_MAX_ROWS:
            return Response(
                {"error": f"rows must be a list with at most {IMPORT_MAX_ROWS} items"},
                status=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            )
        valid_types = {c for c, _ in AssetTransaction.TYPE_CHOICES}
        imported = 0
        skipped = 0
        errors = []

        for i, row in enumerate(rows):
            try:
                asset_id = row.get("asset_id")
                asset = Asset.objects.filter(pk=asset_id, owner=owner).first()
                if not asset:
                    errors.append(
                        {"row": i + 1, "error": f"asset_id {asset_id} not found"}
                    )
                    skipped += 1
                    continue

                tx_type = str(row.get("transaction_type", "")).strip().lower()
                if tx_type not in valid_types:
                    errors.append(
                        {"row": i + 1, "error": f"invalid transaction_type '{tx_type}'"}
                    )
                    skipped += 1
                    continue

                tx_date = parse_import_date(row.get("date"))
                if not tx_date:
                    errors.append(
                        {"row": i + 1, "error": f"invalid date '{row.get('date')}'"}
                    )
                    skipped += 1
                    continue

                shares = parse_import_decimal(row.get("shares"))
                price = parse_import_decimal(row.get("price_per_share"))
                if shares is None or shares <= 0:
                    errors.append({"row": i + 1, "error": "shares must be > 0"})
                    skipped += 1
                    continue
                shares = shares.quantize(IMPORT_SHARES_QUANT, rounding=ROUND_DOWN)
                if shares <= 0:
                    errors.append({"row": i + 1, "error": "shares must be > 0"})
                    skipped += 1
                    continue
                if price is None:
                    errors.append({"row": i + 1, "error": "missing price_per_share"})
                    skipped += 1
                    continue
                is_verified = parse_optional_bool(row.get("is_verified"))
                contribution_source = _resolve_contribution_source(
                    owner, row.get("contribution_source")
                )

                serializer_data = {
                    "transaction_type": tx_type,
                    "date": tx_date,
                    "shares": shares,
                    "price_per_share": price,
                    "notes": str(row.get("notes", "")).strip()[:255],
                    "contribution_source": (
                        contribution_source.pk if contribution_source else None
                    ),
                    "is_verified": is_verified if is_verified is not None else False,
                }
                tx_serializer = AssetTransactionSerializer(
                    data=serializer_data,
                    context={"request": request},
                )
                tx_serializer.is_valid(raise_exception=True)
                create_transaction(asset, tx_serializer, owner=owner)
                imported += 1
            except ValueError as e:
                errors.append({"row": i + 1, "error": str(e)})
                skipped += 1
            except Exception:
                # str(e) would leak SQL column names, FK identifiers, or stack
                # context to the client. Log full detail server-side and return
                # a generic message keyed by row number so the user can still
                # locate the offending CSV line.
                logger.exception("import: row %d failed", i + 1)
                errors.append({"row": i + 1, "error": "unexpected error"})
                skipped += 1

        logger.info(
            "import_transactions: user=%s imported=%d skipped=%d errors=%d",
            owner,
            imported,
            skipped,
            len(errors),
        )
        return Response(
            {"imported": imported, "skipped": skipped, "errors": errors[:50]}
        )

    @action(detail=False, methods=["post"], url_path="import-accounts")
    def import_accounts(self, request):
        """POST /api/portfolio/import-accounts/

        Body: {rows: [{name, currency?, investment_type_id (is_bank_account),
        invested_capital?}]}
        """
        from ...services import parse_import_decimal

        owner = self.get_effective_user()
        rows = request.data.get("rows", [])
        if not isinstance(rows, list) or len(rows) > IMPORT_MAX_ROWS:
            return Response(
                {"error": f"rows must be a list with at most {IMPORT_MAX_ROWS} items"},
                status=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            )
        imported = 0
        skipped = 0
        errors = []

        for i, row in enumerate(rows):
            try:
                name = str(row.get("name", "")).strip()
                if not name:
                    errors.append({"row": i + 1, "error": "missing name"})
                    skipped += 1
                    continue

                inv_type_id = row.get("investment_type_id")
                if not inv_type_id:
                    errors.append({"row": i + 1, "error": "missing investment_type_id"})
                    skipped += 1
                    continue
                inv_type = InvestmentType.objects.filter(
                    pk=inv_type_id, owner=owner
                ).first()
                if not inv_type:
                    errors.append(
                        {
                            "row": i + 1,
                            "error": f"investment_type_id {inv_type_id} not found",
                        }
                    )
                    skipped += 1
                    continue
                if not inv_type.is_bank_account:
                    errors.append(
                        {
                            "row": i + 1,
                            "error": "investment_type is not a bank account",
                        }
                    )
                    skipped += 1
                    continue

                currency = (str(row.get("currency", "EUR")).strip() or "EUR").upper()[
                    :3
                ]
                invested = parse_import_decimal(row.get("invested_capital")) or Decimal(
                    "0"
                )
                if invested < 0:
                    errors.append(
                        {"row": i + 1, "error": "invested_capital must be >= 0"}
                    )
                    skipped += 1
                    continue

                acct = Asset.objects.create(
                    name=name,
                    tracking_type=Asset.MANUAL,
                    investment_type=inv_type,
                    is_liquid=True,
                    currency=currency,
                    invested_capital=invested,
                    owner=owner,
                )
                if invested > 0:
                    AssetTransaction.objects.create(
                        asset=acct,
                        transaction_type=AssetTransaction.CASH_IN,
                        date=date_cls.today(),
                        shares=Decimal("1"),
                        price_per_share=invested,
                        notes="Import iniziale",
                        is_verified=True,
                        owner=owner,
                    )
                    _refresh_manual_asset(acct)
                imported += 1
            except Exception:
                # str(e) would leak SQL column names, FK identifiers, or stack
                # context to the client. Log full detail server-side and return
                # a generic message keyed by row number so the user can still
                # locate the offending CSV line.
                logger.exception("import: row %d failed", i + 1)
                errors.append({"row": i + 1, "error": "unexpected error"})
                skipped += 1

        logger.info(
            "import_accounts: user=%s imported=%d skipped=%d errors=%d",
            owner,
            imported,
            skipped,
            len(errors),
        )
        return Response(
            {"imported": imported, "skipped": skipped, "errors": errors[:50]}
        )
