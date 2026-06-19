import logging
import calendar
from django.db.models import Min
from django.db.models.functions import ExtractYear
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.response import Response

from ...models import (
    Asset,
    AssetPriceHistory,
    AssetTransaction,
    FXRateHistory,
)
from ...prices import (
    get_historical_price,
)
from ...services import (
    asset_current_value_eur,
    asset_invested_capital_eur,
)
from datetime import datetime, timedelta, timezone, date as date_cls
from decimal import Decimal
from finnet.accounting import accounting_month_range, get_user_accounting_start_day

from .._common import (
    _build_fx_lookup,
    _fx_at,
    _price_at,
    _step_at,
)

from portfolio import views as _pv

logger = logging.getLogger(__name__)


class _AssetAnalyticsMixin:
    @action(detail=False, methods=["get"], url_path="history")
    def history(self, request):
        """GET /api/portfolio/history/?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD

        Calcola la curva patrimonio on-the-fly dalle transazioni + `AssetPriceHistory`.
        Per ogni data nel range:
          - per asset con ticker: shares cumulate × ultimo prezzo noto a quella data
          - per asset illiquidi: ultimo valore totale registrato
        """
        today = date_cls.today()

        def _parse(s, default):
            if not s:
                return default
            try:
                return datetime.fromisoformat(s).date()
            except ValueError:
                return default

        start_date = _parse(
            request.query_params.get("start_date"), today - timedelta(days=365)
        )
        end_date = _parse(request.query_params.get("end_date"), today)
        logger.debug(
            "history: start=%s end=%s user=%s", start_date, end_date, request.user
        )
        include_breakdown = (
            request.query_params.get("include_breakdown", "").lower() == "true"
        )
        if start_date > end_date:
            start_date, end_date = end_date, start_date

        # Cap max range per evitare payload enormi.
        # CRIT-06: il cap legacy di 10 anni rendeva l'endpoint O(asset×giorni)
        # con potenziali timeout. 5 anni copre tutti gli use case di reporting
        # personale; per range più lunghi i client devono passare a snapshot
        # materializzati (PortfolioSnapshot).
        max_days = 366 * 5
        if (end_date - start_date).days > max_days:
            start_date = end_date - timedelta(days=max_days)

        # Pre-carica tutti gli asset e le loro transazioni / price history
        assets = list(
            Asset.objects.prefetch_related("transactions").filter(
                owner=self.get_effective_user(), is_archived=False
            )
        )

        # Per ogni asset AUTO: lista ordinata di (date, delta_shares) solo per BUY/SELL
        # Per ogni asset MANUAL: prima data nota (transazione o price history) per evitare
        # l'extrapolazione all'indietro del valore su date antecedenti all'acquisto.
        per_asset_tx = {}  # asset_id -> [(date, delta_shares)]  (solo AUTO)
        asset_start_date = {}  # asset_id -> date | None  (prima data nota)
        for a in assets:
            txs = sorted(
                (t for t in a.transactions.all() if t.is_verified),
                key=lambda t: t.date,
            )
            first_tx_date = txs[0].date if txs else None
            if a.has_ticker:
                events = []
                for tx in txs:
                    if tx.transaction_type == AssetTransaction.BUY:
                        events.append((tx.date, tx.shares))
                    elif tx.transaction_type == AssetTransaction.SELL:
                        events.append((tx.date, -tx.shares))
                per_asset_tx[a.id] = events
                asset_start_date[a.id] = first_tx_date
            else:
                # MANUAL: start = opening balance date, se presente, altrimenti prima transazione.
                asset_start_date[a.id] = a.opening_balance_date or first_tx_date

        # Pre-carica price history per asset (lista ordinata di (date, close)).
        # CRIT-06: cap superiore sulla data — non carichiamo entry future a
        # `end_date`. Il bound inferiore non è applicabile perché _price_at()
        # consulta l'ultima entry <= day come "carryover", quindi serve mantenere
        # le entry precedenti a `start_date` (regression test history_manual_step).
        per_asset_prices = {a.id: [] for a in assets}
        tracked_ids = {a.id for a in assets if a.has_ticker}
        history_rows = (
            AssetPriceHistory.objects.filter(
                asset__in=assets,
                date__lte=end_date,
            )
            .order_by("asset_id", "date")
            .values_list("asset_id", "date", "close")
        )
        for asset_id, point_date, close in history_rows:
            if asset_id not in tracked_ids or close > 0:
                per_asset_prices[asset_id].append((point_date, close))
        for a in assets:
            pts = per_asset_prices[a.id]
            per_asset_prices[a.id] = pts
            # Per MANUAL senza transazioni, considera il primo punto di price history come inizio
            if not a.has_ticker and asset_start_date[a.id] is None and pts:
                asset_start_date[a.id] = pts[0][0]

        # Pre-calcola shares cumulate per AUTO asset ad ogni data di evento (ottimizzazione O(A×T))
        # per_asset_cum[asset_id] = lista ordinata di (date, cum_shares)
        per_asset_cum: dict[int, list] = {}
        for a in assets:
            if not a.has_ticker:
                continue
            events = per_asset_tx[a.id]
            cum = []
            running = Decimal("0")
            for tx_date, delta in events:
                running += delta
                cum.append((tx_date, running))
            per_asset_cum[a.id] = cum

        def _shares_at(asset_id, day):
            """Shares cumulate di un asset AUTO a `day`, usando binary-search sui cumulati."""
            cum = per_asset_cum.get(asset_id, [])
            if not cum or cum[0][0] > day:
                return Decimal("0")
            # Trova l'ultimo evento <= day
            lo, hi = 0, len(cum) - 1
            while lo < hi:
                mid = (lo + hi + 1) // 2
                if cum[mid][0] <= day:
                    lo = mid
                else:
                    hi = mid - 1
            return cum[lo][1]

        # Pre-carica tassi FX storici per convertire valori a EUR
        effective_user = self.get_effective_user()
        fx_lookup = _build_fx_lookup(effective_user, start_date, end_date)
        fx_fallback: dict[str, Decimal] = {}

        def _asset_value_at(a, day) -> Decimal | None:
            """Valore in valuta nativa di un asset a `day`. None = escludi dal totale."""
            start = asset_start_date.get(a.id)
            price_points = per_asset_prices[a.id]
            if a.has_ticker:
                shares = _shares_at(a.id, day)
                if shares <= 0:
                    return None
                price = _price_at(price_points, day)
                if price is None:
                    return None
                return shares * price
            else:
                # MANUAL: se la data è antecedente alla prima data nota (tx o price history),
                # l'asset non esisteva ancora → valore 0 (non estrappolare all'indietro).
                if start is not None and day < start:
                    return None
                # Step function: il saldo è costante tra le transazioni, senza interpolazione.
                # _price_at produrrebbe una discesa graduale tra punti sparsi (artefatto).
                value = _step_at(price_points, day)
                if value is None:
                    return Decimal(a.current_value) if a.current_value else None
                return value

        # Itera giorno per giorno
        points = []
        fx_incomplete = set()
        day = start_date
        while day <= end_date:
            total = Decimal("0")
            liquid = Decimal("0")
            illiquid = Decimal("0")
            by_class: dict[str, float] = {} if include_breakdown else {}
            by_asset_list: list = [] if include_breakdown else []

            for a in assets:
                value = _asset_value_at(a, day)
                if value is None:
                    continue

                fx_rate = _fx_at(fx_lookup, a.currency, day, fx_fallback)
                if fx_rate is None:
                    fx_incomplete.add((a.id, a.currency))
                    continue
                value_eur = (Decimal(value) * fx_rate).quantize(Decimal("0.01"))
                total += value_eur
                if a.is_liquid:
                    liquid += value_eur
                else:
                    illiquid += value_eur

                if include_breakdown:
                    type_id = (
                        str(a.investment_type_id) if a.investment_type_id else "null"
                    )
                    by_class[type_id] = round(
                        by_class.get(type_id, 0.0) + float(value_eur), 2
                    )
                    by_asset_list.append(
                        {
                            "asset_id": a.id,
                            "name": a.name,
                            "type_id": a.investment_type_id,
                            "value": float(value_eur),
                        }
                    )

            point = {
                "snapshot_date": datetime.combine(day, datetime.min.time())
                .replace(tzinfo=timezone.utc)
                .isoformat(),
                "total_value": str(total.quantize(Decimal("0.01"))),
                "liquid_value": str(liquid.quantize(Decimal("0.01"))),
                "illiquid_value": str(illiquid.quantize(Decimal("0.01"))),
            }
            if include_breakdown:
                point["by_asset_class"] = by_class
                point["by_asset"] = by_asset_list
            points.append(point)
            day += timedelta(days=1)

        response = Response(points)
        response["X-FX-Incomplete"] = "true" if fx_incomplete else "false"
        return response

    @action(detail=True, methods=["get"], url_path="historical-price")
    def historical_price(self, request, pk=None):
        """GET /api/portfolio/{id}/historical-price/?date=YYYY-MM-DD

        Ritorna il prezzo cachato (o recuperato da Yahoo al volo) per un asset con ticker
        a una data specifica. Usato dal form transazione per autofill.
        """
        asset = self.get_object()
        if not asset.has_ticker:
            return Response(
                {"error": "Asset senza ticker"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        date_str = request.query_params.get("date")
        if not date_str:
            return Response(
                {"error": "Parametro 'date' richiesto (YYYY-MM-DD)"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            target = datetime.fromisoformat(date_str).date()
        except ValueError:
            return Response(
                {"error": "Formato data non valido (atteso YYYY-MM-DD)"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        price = get_historical_price(asset, target)
        if price is None:
            return Response(
                {"error": f"Prezzo non disponibile per {asset.ticker} a {target}"},
                status=status.HTTP_404_NOT_FOUND,
            )
        return Response(
            {
                "close": str(price),
                "currency": asset.currency,
                "date": target.isoformat(),
            }
        )

    @action(detail=True, methods=["get"], url_path="price-history")
    def price_history(self, request, pk=None):
        """GET /api/portfolio/{id}/price-history/?days=N

        Ritorna la storia prezzi dell'asset dalla cache AssetPriceHistory.
        Auto-backfill via Yahoo Finance se la cache non copre `since`.
        Cap: `days` ∈ [30, 3650]; default 365.

        Response: {
            points: [{date, close}, ...],
            earliest_available: ISO date or null,
            requested_since: ISO date,
            status: "ok" | "partial" | "no_data" | "error",
            message: str | null,
        }
        """
        from concurrent.futures import TimeoutError as FuturesTimeoutError
        from ...prices import (
            _BACKFILL_TIMEOUT,
            _backfill_price_history_with_meta,
            _run_with_timeout,
        )

        asset = self.get_object()
        try:
            days = int(request.query_params.get("days", 365))
            days = max(30, min(days, 3650))
        except (ValueError, TypeError):
            days = 365

        from datetime import date, timedelta

        since = date.today() - timedelta(days=days)

        meta = {"status": "ok", "message": None}

        history = AssetPriceHistory.objects.filter(asset=asset)
        if asset.has_ticker:
            history = history.filter(close__gt=0)
        existing_earliest = (
            history.order_by("date").values_list("date", flat=True).first()
        )

        if asset.has_ticker and (
            existing_earliest is None or existing_earliest > since
        ):
            # Cache doesn't reach back to the requested window — pull from yfinance
            # in a worker thread with a hard wall-clock cap so a slow Yahoo
            # response cannot exhaust the gunicorn worker pool.
            def _run_backfill():
                return _backfill_price_history_with_meta(asset, from_date=since)

            try:
                _, backfill_meta = _run_with_timeout(_run_backfill, _BACKFILL_TIMEOUT)
                meta["status"] = backfill_meta.get("status", "ok")
                meta["message"] = backfill_meta.get("message")
            except FuturesTimeoutError:
                logger.warning(
                    "price-history auto-backfill timeout (>%ds) asset=%s",
                    _BACKFILL_TIMEOUT,
                    asset.id,
                )
                meta["status"] = "error"
                meta["message"] = f"backfill timeout after {_BACKFILL_TIMEOUT}s"
            except Exception as e:
                logger.exception(
                    "price-history auto-backfill failed asset=%s", asset.id
                )
                meta["status"] = "error"
                meta["message"] = str(e)

            # Refresh earliest_available after backfill — may have changed.
            existing_earliest = (
                history.order_by("date").values_list("date", flat=True).first()
            )

        pts = list(
            history.filter(date__gte=since).order_by("date").values("date", "close")
        )

        if pts and meta["status"] == "no_data":
            meta["status"] = "partial"
        if meta["status"] == "ok" and existing_earliest and existing_earliest > since:
            meta["status"] = "partial"
            meta["message"] = (
                f"data starts at {existing_earliest.isoformat()}, "
                f"requested since {since.isoformat()}"
            )

        return Response(
            {
                "points": [
                    {"date": p["date"].isoformat(), "close": float(p["close"])}
                    for p in pts
                ],
                "earliest_available": existing_earliest.isoformat()
                if existing_earliest
                else None,
                "requested_since": since.isoformat(),
                "status": meta["status"],
                "message": meta["message"],
            }
        )

    @action(detail=False, methods=["get"], url_path="dashboard-overview")
    def dashboard_overview(self, request):
        """GET /api/portfolio/dashboard-overview/

        Ritorna la cache materializzata del dashboard. Se stale, ricalcola prima di rispondere.
        """
        from ...services import rebuild_dashboard_summary
        from ...models import DashboardSummary

        effective = self.get_effective_user()
        summary = DashboardSummary.get_singleton(user=effective)
        if summary.is_stale:
            summary = rebuild_dashboard_summary(user=effective)
            source = "live_recompute"
        else:
            source = "materialized"

        return Response(
            {
                **summary.payload,
                "meta": {
                    "source": source,
                    "computed_at": summary.computed_at.isoformat()
                    if summary.computed_at
                    else None,
                    "last_invalidation_reason": summary.last_invalidation_reason,
                },
            }
        )

    @action(detail=False, methods=["get"], url_path="summary")
    def summary(self, request):
        _pv._reconcile_due_manual_assets_safe(self.get_effective_user())
        assets = list(
            Asset.objects.select_related("investment_type").filter(
                owner=self.get_effective_user(), is_archived=False
            )
        )

        total_invested = Decimal("0")
        total_current = Decimal("0")
        total_tax_liability = Decimal("0")
        liquid_invested = Decimal("0")
        liquid_current = Decimal("0")
        illiquid_invested = Decimal("0")
        illiquid_current = Decimal("0")
        by_type_map = {}
        by_currency_map = {}

        incomplete_assets = []
        for a in assets:
            inv = asset_invested_capital_eur(a)
            cur = asset_current_value_eur(a)
            if cur is None:
                incomplete_assets.append({"asset_id": a.id, "currency": a.currency})
                continue
            if inv is None:
                incomplete_assets.append({"asset_id": a.id, "currency": a.currency})
            gain = cur - inv if inv is not None else Decimal("0")
            tax_rate = (
                a.investment_type.tax_rate if a.investment_type else Decimal("0")
            ) or Decimal("0")
            tax = max(gain, Decimal("0")) * tax_rate

            if inv is not None:
                total_invested += inv
            total_current += cur
            total_tax_liability += tax

            if a.is_liquid:
                if inv is not None:
                    liquid_invested += inv
                liquid_current += cur
            else:
                if inv is not None:
                    illiquid_invested += inv
                illiquid_current += cur

            it = a.investment_type
            tid = it.id if it else None
            if tid not in by_type_map:
                by_type_map[tid] = {
                    "type_id": tid,
                    "type_name": (it.name if it else "Other"),
                    "type_color": (it.color if it else "#4f7fff"),
                    "type_icon": (it.icon if it else "📈"),
                    "is_bank_account": bool(it.is_bank_account) if it else False,
                    "total_invested": Decimal("0"),
                    "total_current": Decimal("0"),
                }
            by_type_map[tid]["total_invested"] += inv or Decimal("0")
            by_type_map[tid]["total_current"] += cur

            ccy = (a.currency or "EUR").upper()
            by_currency_map[ccy] = by_currency_map.get(ccy, Decimal("0")) + cur

        by_type = sorted(
            by_type_map.values(), key=lambda x: x["total_current"], reverse=True
        )
        by_currency = [
            {
                "currency": ccy,
                "total_eur": amount,
                "percent": (
                    float(amount / total_current * 100) if total_current else 0.0
                ),
            }
            for ccy, amount in sorted(
                by_currency_map.items(), key=lambda kv: kv[1], reverse=True
            )
        ]
        total_post_tax = total_current - total_tax_liability

        return Response(
            {
                "total_invested": total_invested,
                "total_current": total_current,
                "total_gain": total_current - total_invested,
                "total_gain_percent": (
                    ((total_current - total_invested) / total_invested * 100)
                    if total_invested
                    else 0
                ),
                "total_tax_liability": total_tax_liability,
                "total_post_tax_value": total_post_tax,
                "liquid": {
                    "invested": liquid_invested,
                    "current": liquid_current,
                },
                "illiquid": {
                    "invested": illiquid_invested,
                    "current": illiquid_current,
                },
                "by_type": by_type,
                "by_currency": by_currency,
                "meta": {
                    "fx_incomplete": bool(incomplete_assets),
                    "incomplete_assets": incomplete_assets,
                },
            }
        )

    @action(detail=False, methods=["get"], url_path="monthly-overview")
    def monthly_overview(self, request):
        """GET /api/portfolio/monthly-overview/?year=YYYY

        Restituisce il patrimonio mensile per ogni asset e i totali di riepilogo.
        Tutti i valori sono in EUR (convertiti con FXRateHistory per asset in valuta estera).
        """
        from expenses.models import Expense

        try:
            year = int(request.query_params.get("year", date_cls.today().year))
        except (TypeError, ValueError):
            return Response({"error": "Invalid year"}, status=400)

        user = self.get_effective_user()
        logger.debug("monthly_overview: year=%s user=%s", year, user)

        # --- Bulk load AssetPriceHistory fino a fine anno ---
        year_start = date_cls(year, 1, 1)
        year_end = date_cls(year, 12, 31)
        tracked_asset_ids = set(
            Asset.objects.filter(owner=user, is_archived=False)
            .exclude(ticker="", source_symbol="")
            .values_list("id", flat=True)
        )

        ph_rows = (
            AssetPriceHistory.objects.filter(
                asset__owner=user,
                date__lte=year_end,
            )
            .values("asset_id", "date", "close")
            .order_by("asset_id", "date")
        )

        # Per ogni asset, costruiamo:
        # - prezzo "base" prima dell'anno (se esiste)
        # - ultimo close per ogni mese dell'anno
        ph_base_before_year: dict[int, Decimal] = {}
        ph_by_asset_month_raw: dict[int, dict[int, Decimal]] = {}
        ph_by_asset_month_exact: dict[tuple[int, int], Decimal] = {}
        for row in ph_rows:
            aid = row["asset_id"]
            d = row["date"]
            close = Decimal(row["close"])
            if aid in tracked_asset_ids and close <= 0:
                continue
            if d < year_start:
                ph_base_before_year[aid] = close
                continue
            if d.year != year:
                continue
            ph_by_asset_month_raw.setdefault(aid, {})[d.month - 1] = close
            ph_by_asset_month_exact[(aid, d.month - 1)] = close

        # Carry-forward: se in un mese manca il close, usa l'ultimo disponibile
        # precedente (incluso quello pre-anno), per evitare mesi "vuoti".
        # Non riempire però i mesi futuri: per l'anno corrente ci si ferma al
        # mese corrente, per gli anni futuri non si riempie nulla. Altrimenti
        # i mesi successivi a "oggi" mostrerebbero il valore attuale proiettato.
        today = date_cls.today()
        if year > today.year:
            last_real_month = -1
        elif year == today.year:
            last_real_month = today.month - 1
        else:
            last_real_month = 11
        ph_by_asset_month: dict[tuple[int, int], Decimal] = {}
        all_price_asset_ids = set(ph_by_asset_month_raw.keys()) | set(
            ph_base_before_year.keys()
        )
        for aid in all_price_asset_ids:
            month_map = ph_by_asset_month_raw.get(aid, {})
            last_close = ph_base_before_year.get(aid)
            for m in range(last_real_month + 1):
                if m in month_map:
                    last_close = month_map[m]
                if last_close is not None:
                    ph_by_asset_month[(aid, m)] = last_close

        # --- Bulk load FXRateHistory per l'anno ---
        fx_rows = (
            FXRateHistory.objects.filter(
                owner=user,
                to_currency="EUR",
                date__range=(date_cls(year, 1, 1) - timedelta(days=7), year_end),
            )
            .values("from_currency", "date", "rate")
            .order_by("from_currency", "date")
        )

        # dict: (currency, month_index) → rate (ultimo disponibile nel mese)
        fx_by_currency_month: dict[tuple, Decimal] = {}
        for row in fx_rows:
            m = row["date"].month - 1
            key = (row["from_currency"], m)
            existing_date = fx_by_currency_month.get(f"_d_{key}")
            if existing_date is None or row["date"] > existing_date:
                fx_by_currency_month[key] = row["rate"]
                fx_by_currency_month[f"_d_{key}"] = row["date"]

        missing_fx_currencies = set()

        def _fx_for_month(currency: str, month_idx: int) -> Decimal | None:
            """Cerca il tasso FX del mese; fallback sui mesi precedenti fino a 2 mesi."""
            if not currency or currency in ("EUR", ""):
                return Decimal("1")
            for delta in range(3):
                m = month_idx - delta
                if m < 0:
                    break
                rate = fx_by_currency_month.get((currency, m))
                if rate:
                    return Decimal(rate)
            # No FX rate found in 3-month lookback — aggregati EUR potrebbero essere
            # falsati. Logga per diagnostica (allineato a _fx_at del history endpoint).
            missing_fx_currencies.add(currency)
            logger.warning(
                "monthly_overview: no FX rate for %s month=%s", currency, month_idx
            )
            return None

        # --- Assets ---
        assets = list(
            Asset.objects.select_related("investment_type")
            .filter(owner=user, is_archived=False)
            .order_by("investment_type__name", "name")
        )
        first_tx_by_asset = {
            row["asset_id"]: row["first_tx"]
            for row in AssetTransaction.objects.filter(
                asset__owner=user, is_verified=True
            )
            .values("asset_id")
            .annotate(first_tx=Min("date"))
        }
        tx_events_by_asset: dict[int, list] = {}
        tx_rows = (
            AssetTransaction.objects.filter(
                asset__owner=user,
                is_verified=True,
                transaction_type__in=[AssetTransaction.BUY, AssetTransaction.SELL],
            )
            .values("asset_id", "date", "transaction_type", "shares")
            .order_by("asset_id", "date", "id")
        )
        for row in tx_rows:
            tx_events_by_asset.setdefault(row["asset_id"], []).append(row)

        assets_out = []
        # monthly_values[i] = valore EUR per il mese i (0=gennaio), None se nessun dato
        asset_monthly: dict[int, list] = {}

        for a in assets:
            mv = [None] * 12
            # Do not show values before the first transaction date: otherwise
            # old market history appears as if the asset was already owned.
            first_tx = first_tx_by_asset.get(a.id)
            events = tx_events_by_asset.get(a.id, [])
            for m in range(12):
                if first_tx and (
                    year < first_tx.year
                    or (year == first_tx.year and m < (first_tx.month - 1))
                ):
                    continue
                if a.tracking_type == Asset.AUTO:
                    close = ph_by_asset_month.get((a.id, m))
                else:
                    close = ph_by_asset_month.get((a.id, m))
                if close is None:
                    continue
                close = Decimal(close)

                # AUTO assets: month value = month-end shares * close.
                if a.tracking_type == Asset.AUTO:
                    month_end = date_cls(
                        year,
                        m + 1,
                        calendar.monthrange(year, m + 1)[1],
                    )
                    shares = Decimal("0")
                    for ev in events:
                        if ev["date"] > month_end:
                            break
                        if ev["transaction_type"] == AssetTransaction.BUY:
                            shares += Decimal(ev["shares"])
                        elif ev["transaction_type"] == AssetTransaction.SELL:
                            shares -= Decimal(ev["shares"])
                    if shares < 0:
                        shares = Decimal("0")
                    if shares == 0:
                        # No position held in that month: show missing value in UI.
                        continue
                    close = close * shares

                if not a.currency or a.currency == "EUR":
                    mv[m] = float(close.quantize(Decimal("0.01")))
                else:
                    # Close is in the asset's native currency; apply FX to convert to EUR
                    fx = _fx_for_month(a.currency, m)
                    if fx is not None:
                        mv[m] = float((close * fx).quantize(Decimal("0.01")))

            asset_monthly[a.id] = mv
            it = a.investment_type
            assets_out.append(
                {
                    "id": a.id,
                    "name": a.name,
                    "currency": a.currency,
                    "tracking_type": a.tracking_type,
                    "investment_type": {
                        "id": it.id if it else None,
                        "name": it.name if it else "Other",
                        "color": it.color if it else "#4f7fff",
                        "is_bank_account": it.is_bank_account if it else False,
                    }
                    if it
                    else None,
                    "monthly_values": mv,
                }
            )

        # --- Summary rows ---
        balance = [None] * 12
        nw = [None] * 12

        for m in range(12):
            bal_sum = Decimal("0")
            nw_sum = Decimal("0")
            has_any = False
            for a in assets:
                v = asset_monthly[a.id][m]
                if v is None:
                    continue
                has_any = True
                nw_sum += Decimal(str(v))
                it = a.investment_type
                if it and it.is_bank_account:
                    bal_sum += Decimal(str(v))
            if has_any:
                balance[m] = float(bal_sum.quantize(Decimal("0.01")))
                nw[m] = float(nw_sum.quantize(Decimal("0.01")))

        nw_change_abs = [None] * 12
        nw_change_pct = [None] * 12
        prev_nw = None
        for m in range(12):
            if nw[m] is not None and prev_nw is not None:
                delta = nw[m] - prev_nw
                nw_change_abs[m] = round(delta, 2)
                nw_change_pct[m] = round(delta / prev_nw * 100, 2) if prev_nw else None
            if nw[m] is not None:
                prev_nw = nw[m]

        # --- Income / Outcome da Expense ---
        # Esclude trasferimenti (categoria con nome "Trasferimento")
        accounting_start_day = get_user_accounting_start_day(user)
        accounting_ranges = [
            accounting_month_range(year, month, accounting_start_day)
            for month in range(1, 13)
        ]
        expense_range_start = accounting_ranges[0][0]
        expense_range_end = accounting_ranges[-1][1]
        exp_qs = (
            Expense.objects.filter(
                owner=user,
                is_verified=True,
                date__range=(expense_range_start, expense_range_end),
            )
            .exclude(category__name="Trasferimento")
            .select_related("category")
        )

        income_by_month = [None] * 12
        outcome_by_month = [None] * 12
        inc_acc = [Decimal("0")] * 12
        out_acc = [Decimal("0")] * 12
        has_income = [False] * 12
        has_outcome = [False] * 12

        for exp in exp_qs:
            m = None
            for idx, (period_start, period_end) in enumerate(accounting_ranges):
                if period_start <= exp.date <= period_end:
                    m = idx
                    break
            if m is None:
                continue
            cat_type = exp.category.category_type if exp.category else "expense"
            if cat_type == "income":
                inc_acc[m] += exp.amount
                has_income[m] = True
            else:
                out_acc[m] += exp.amount
                has_outcome[m] = True

        for m in range(12):
            if has_income[m]:
                income_by_month[m] = float(inc_acc[m].quantize(Decimal("0.01")))
            if has_outcome[m]:
                outcome_by_month[m] = float(out_acc[m].quantize(Decimal("0.01")))

        cash_saving_abs = [None] * 12
        cash_saving_pct = [None] * 12
        for m in range(12):
            if income_by_month[m] is not None and outcome_by_month[m] is not None:
                inc = income_by_month[m]
                out = outcome_by_month[m]
                saving = inc - out
                cash_saving_abs[m] = round(saving, 2)
                cash_saving_pct[m] = round(saving / inc * 100, 2) if inc else None

        tx_years = set(
            AssetTransaction.objects.filter(owner=user, is_verified=True)
            .annotate(y=ExtractYear("date"))
            .values_list("y", flat=True)
            .distinct()
        )
        ph_years = set(
            AssetPriceHistory.objects.filter(owner=user)
            .annotate(y=ExtractYear("date"))
            .values_list("y", flat=True)
            .distinct()
        )
        available_years = sorted(tx_years | ph_years, reverse=True)

        return Response(
            {
                "year": year,
                "available_years": available_years,
                "assets": assets_out,
                "summary": {
                    "balance": balance,
                    "nw": nw,
                    "nw_change_abs": nw_change_abs,
                    "nw_change_pct": nw_change_pct,
                    "income": income_by_month,
                    "outcome": outcome_by_month,
                    "cash_saving_abs": cash_saving_abs,
                    "cash_saving_pct": cash_saving_pct,
                },
                "meta": {
                    "fx_incomplete": bool(missing_fx_currencies),
                    "missing_fx_currencies": sorted(missing_fx_currencies),
                },
            }
        )

    @action(detail=False, methods=["get"], url_path="monthly-investment-stats")
    def monthly_investment_stats(self, request):
        """GET /api/portfolio/monthly-investment-stats/?month=MM&year=YYYY

        Ritorna per il mese indicato:
        - invested: totale BUY (primarie, verified)
        - realized: guadagno/perdita sulle SELL del mese (con % sul cost basis)
        - unrealized: guadagno/perdita sul portafoglio corrente (asset non-conto)
        """
        today = date_cls.today()
        try:
            month = int(request.query_params.get("month", today.month))
            year = int(request.query_params.get("year", today.year))
        except (TypeError, ValueError):
            return Response({"error": "Invalid month/year"}, status=400)

        user = self.get_effective_user()

        # ── Investito nel mese (BUY primarie, verified) ──────────────────────
        buy_txs = AssetTransaction.objects.filter(
            owner=user,
            transaction_type=AssetTransaction.BUY,
            derived_from__isnull=True,
            date__month=month,
            date__year=year,
            is_verified=True,
        )
        invested = sum(
            (tx.shares * tx.price_per_share for tx in buy_txs),
            Decimal("0"),
        )

        # ── Realized gain sulle SELL del mese ────────────────────────────────
        sell_in_month = AssetTransaction.objects.filter(
            owner=user,
            transaction_type=AssetTransaction.SELL,
            derived_from__isnull=True,
            date__month=month,
            date__year=year,
            is_verified=True,
        ).select_related("asset")

        affected_asset_ids = list(
            sell_in_month.values_list("asset_id", flat=True).distinct()
        )

        realized_gain = Decimal("0")
        realized_cost_basis = Decimal("0")

        for asset_id in affected_asset_ids:
            all_txs = (
                AssetTransaction.objects.filter(
                    asset_id=asset_id,
                    transaction_type__in=[AssetTransaction.BUY, AssetTransaction.SELL],
                    derived_from__isnull=True,
                    is_verified=True,
                )
                .order_by("date", "created_at")
                .only(
                    "transaction_type",
                    "shares",
                    "price_per_share",
                    "fee",
                    "tax_amount",
                    "date",
                )
            )

            r_shares = Decimal("0")
            r_cost = Decimal("0")

            for t in all_txs:
                if t.transaction_type == AssetTransaction.BUY:
                    r_shares += t.shares
                    r_cost += t.shares * t.price_per_share
                elif t.transaction_type == AssetTransaction.SELL:
                    if r_shares > 0:
                        avg_cost = r_cost / r_shares
                        sold = min(t.shares, r_shares)
                        cost_basis = sold * avg_cost
                        gain = (
                            sold * t.price_per_share - cost_basis - t.fee - t.tax_amount
                        )
                        r_cost -= cost_basis
                        r_shares -= sold
                        if t.date.month == month and t.date.year == year:
                            realized_gain += gain
                            realized_cost_basis += cost_basis

        realized_gain_pct = float(
            realized_gain / realized_cost_basis * 100 if realized_cost_basis else 0
        )

        # ── Unrealized gain (stato corrente, asset non-conto) ────────────────
        inv_assets = (
            Asset.objects.select_related("investment_type")
            .filter(owner=user, is_archived=False)
            .exclude(investment_type__is_bank_account=True)
        )

        unrealized_invested = Decimal("0")
        unrealized_current = Decimal("0")
        # Post-tax idealistico: se vendessi tutto ora, ogni asset paga la sua
        # aliquota (effective_tax_rate) solo sul gain positivo. Valore aggregato.
        post_tax_gain = Decimal("0")
        for a in inv_assets:
            inv = asset_invested_capital_eur(a)
            cur = asset_current_value_eur(a)
            if inv is not None and cur is not None:
                unrealized_invested += inv
                unrealized_current += cur
                gain_a = cur - inv
                tax_a = max(gain_a, Decimal("0")) * Decimal(a.effective_tax_rate or 0)
                post_tax_gain += gain_a - tax_a

        unrealized_gain = unrealized_current - unrealized_invested
        unrealized_gain_pct = float(
            unrealized_gain / unrealized_invested * 100 if unrealized_invested else 0
        )

        return Response(
            {
                "invested": str(invested.quantize(Decimal("0.01"))),
                "realized": {
                    "gain": str(realized_gain.quantize(Decimal("0.01"))),
                    "gain_pct": round(realized_gain_pct, 4),
                    "cost_basis": str(realized_cost_basis.quantize(Decimal("0.01"))),
                },
                "unrealized": {
                    "gain": str(unrealized_gain.quantize(Decimal("0.01"))),
                    "gain_pct": round(unrealized_gain_pct, 4),
                    "invested": str(unrealized_invested.quantize(Decimal("0.01"))),
                    "current": str(unrealized_current.quantize(Decimal("0.01"))),
                },
                "post_tax": {
                    "gain": str(post_tax_gain.quantize(Decimal("0.01"))),
                },
            }
        )
