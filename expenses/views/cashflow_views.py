import logging

from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from fininzen.mixins import (
    _effective_user,
    require_view_as_full,
)
from fininzen.permissions import IsNotDemoUser

logger = logging.getLogger(__name__)


class CashFlowFeedView(APIView):
    """
    GET /api/expenses/cashflow/

    Unified feed: expenses (income/outcome) + transfer pairs + adjustments.

    Query params:
      date_from, date_to  — YYYY-MM-DD
      category            — category id
      parent_category     — parent category id
      account             — Asset id
      types               — comma-separated subset of income,outcome,transfer,adjustment
      page                — page number (default 1)
      page_size           — items per page (default 50, maximum 200)
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        from ..cashflow import get_cashflow_feed, get_cashflow_summary

        user = _effective_user(request)

        filters = {}
        date_from_str = request.query_params.get("date_from")
        date_to_str = request.query_params.get("date_to")
        category_str = request.query_params.get("category")
        parent_category_str = request.query_params.get("parent_category")
        account_str = request.query_params.get("account")
        types_str = request.query_params.get("types", "")

        if date_from_str:
            try:
                from datetime import date as _date

                filters["date_from"] = _date.fromisoformat(date_from_str)
            except ValueError:
                return Response(
                    {"error": "invalid date_from"}, status=status.HTTP_400_BAD_REQUEST
                )
        if date_to_str:
            try:
                from datetime import date as _date

                filters["date_to"] = _date.fromisoformat(date_to_str)
            except ValueError:
                return Response(
                    {"error": "invalid date_to"}, status=status.HTTP_400_BAD_REQUEST
                )
        if category_str:
            try:
                category_parts = [
                    p.strip() for p in category_str.split(",") if p.strip()
                ]
                if len(category_parts) == 1:
                    filters["category_id"] = int(category_parts[0])
                else:
                    filters["category_ids"] = [int(p) for p in category_parts]
            except ValueError:
                return Response(
                    {"error": "invalid category"}, status=status.HTTP_400_BAD_REQUEST
                )
        if parent_category_str:
            try:
                parent_parts = [
                    p.strip() for p in parent_category_str.split(",") if p.strip()
                ]
                if len(parent_parts) == 1:
                    filters["parent_category_id"] = int(parent_parts[0])
                else:
                    filters["parent_category_ids"] = [int(p) for p in parent_parts]
            except ValueError:
                return Response(
                    {"error": "invalid parent_category"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        if account_str:
            account_parts = [p.strip() for p in account_str.split(",") if p.strip()]
            if "none" in account_parts:
                filters["account_no_link"] = True
            numeric_accounts = [p for p in account_parts if p != "none"]
            if numeric_accounts:
                try:
                    if len(numeric_accounts) == 1:
                        filters["account_id"] = int(numeric_accounts[0])
                    else:
                        filters["account_ids"] = [int(p) for p in numeric_accounts]
                except ValueError:
                    return Response(
                        {"error": "invalid account"}, status=status.HTTP_400_BAD_REQUEST
                    )
        if types_str:
            valid = {"income", "outcome", "transfer", "adjustment"}
            requested = {t.strip() for t in types_str.split(",") if t.strip()}
            unknown = requested - valid
            if unknown:
                return Response(
                    {"error": f"unknown types: {unknown}"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            filters["types"] = list(requested)
        verified_str = request.query_params.get("verified")
        if verified_str is not None:
            normalized_v = verified_str.lower()
            if normalized_v in ("true", "1"):
                filters["verified"] = True
            elif normalized_v in ("false", "0"):
                filters["verified"] = False
            else:
                return Response(
                    {"error": "verified must be true, false, 1, or 0"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        search_str = request.query_params.get("search")
        if search_str:
            filters["search"] = search_str.strip()
        ordering_str = request.query_params.get("ordering")
        if ordering_str:
            valid_orderings = {"-date", "date", "-amount", "amount"}
            if ordering_str not in valid_orderings:
                return Response(
                    {"error": "invalid ordering"}, status=status.HTTP_400_BAD_REQUEST
                )
            filters["ordering"] = ordering_str

        page_size_str = request.query_params.get("page_size", "50")
        if page_size_str == "all":
            return Response(
                {"error": "page_size=all is not supported; use pagination"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            page_size = min(200, max(1, int(page_size_str)))
        except ValueError:
            page_size = 50

        try:
            page = max(1, int(request.query_params.get("page", 1)))
        except ValueError:
            page = 1

        start = (page - 1) * page_size
        end = start + page_size
        total, items = get_cashflow_feed(user, filters, offset=start, limit=page_size)
        has_next = end < total

        return Response(
            {
                "count": total,
                "next_page": page + 1 if has_next else None,
                "results": items,
                "summary": get_cashflow_summary(user, filters),
            }
        )


class CashFlowBulkView(APIView):
    """
    POST /api/expenses/cashflow/bulk/

    Body:
      {
        "selection": {
          "mode": "ids" | "filtered",
          "ids":        [...]           // when mode=ids
          "filters":    {...}           // when mode=filtered (mirrors GET params)
          "exclude_ids":[...]           // optional, mode=filtered
        },
        "action": "edit" | "delete",
        "patch":  { ... },              // required for action=edit
        "dry_run": true | false         // default false
      }
    """

    permission_classes = [IsAuthenticated, IsNotDemoUser]

    def post(self, request):
        # Bulk edit/delete are write operations: enforce full grant when view-as.
        require_view_as_full(request)
        from ..bulk import (
            BulkRefreshError,
            BulkValidationError,
            apply_bulk,
            compute_preview,
        )

        user = _effective_user(request)
        payload = request.data or {}
        dry_run = bool(payload.get("dry_run"))

        try:
            if dry_run:
                result = compute_preview(user, payload)
            else:
                result = apply_bulk(user, payload)
        except BulkValidationError as exc:
            return Response(
                {
                    "ok": False,
                    "errors": exc.errors,
                    "error_codes": exc.codes,
                    "rejected_rows": exc.rejected_rows,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        except BulkRefreshError as exc:
            return Response(
                {
                    "ok": False,
                    "errors": [
                        "asset balance recompute failed; the edit was rolled back"
                    ],
                    "error_codes": ["asset_refresh_failed"],
                    "asset_ids": exc.asset_ids,
                },
                status=status.HTTP_409_CONFLICT,
            )

        if not result.get("ok"):
            return Response(result, status=status.HTTP_400_BAD_REQUEST)
        return Response(result)
