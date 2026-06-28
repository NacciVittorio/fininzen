"""
portfolio/prices.py — Logica di aggiornamento prezzi via Yahoo Finance.

Usiamo yfinance invece dell'API ufficiale (deprecata nel 2017) perché:
- È la libreria open source più usata e mantenuta per Yahoo Finance
- Supporta ETF europei con suffissi (.MI, .AS, .L, ecc.)
- Gratuita, senza API key
- ATTENZIONE: è non ufficiale, potrebbe smettere di funzionare
  se Yahoo cambia la struttura del sito. In quel caso, alternative:
  Alpha Vantage (500 req/giorno gratis) o OpenFIGI.

Nota sui ticker europei:
  IWDA.AS  → iShares Core MSCI World (Amsterdam)
  VUSA.L   → Vanguard S&P 500 (Londra, in GBP!)
  SWDA.MI  → iShares Core MSCI World (Milano, in EUR)
  BTC-USD  → Bitcoin in USD
"""

import atexit
import logging
import random
import time
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeoutError
from decimal import Decimal, ROUND_HALF_UP
from datetime import datetime, timezone, date as date_cls, timedelta
import yfinance as yf
from .models import Asset, AssetPriceHistory, FXRateHistory, PortfolioSnapshot
from .price_providers import (
    BorsaItalianaFundsProvider,
    BORSA_SOURCE,
    borsa_detail_url,
    looks_like_borsa_fund_identifier,
    normalize_borsa_symbol,
)

_YFINANCE_TIMEOUT = 15  # seconds per singola chiamata Yahoo
_BACKFILL_TIMEOUT = 12  # seconds wall-clock per intero backfill (retry inclusi)
_PROVIDER_EXECUTOR = ThreadPoolExecutor(
    max_workers=4, thread_name_prefix="price-provider"
)
# MED-21: the provider pool is a long-lived module global (one per gunicorn
# worker). Register an explicit shutdown so the worker drains its price-provider
# threads on process exit instead of leaving them to the interpreter teardown;
# wait=False so a thread still blocked on a slow Yahoo/Borsa call can't hang exit.
atexit.register(_PROVIDER_EXECUTOR.shutdown, wait=False)

logger = logging.getLogger(__name__)


def _run_with_timeout(fn, timeout):
    """Run provider I/O without waiting for timed-out threads on context exit."""
    future = _PROVIDER_EXECUTOR.submit(fn)
    try:
        return future.result(timeout=timeout)
    except FuturesTimeoutError:
        future.cancel()
        raise


def _normalize_provider_currency(currency: str) -> str:
    normalized = (currency or "").strip()
    return {
        "GBp": "GBP",
        "GBX": "GBP",
        "ZAc": "ZAR",
        "USX": "USD",
        "ILA": "ILS",
    }.get(normalized, normalized.upper())


def _update_current_value_eur(asset: Asset) -> None:
    from .fx import get_exchange_rate

    rate = get_exchange_rate(asset.currency or "EUR")
    # ROUND_HALF_UP esplicito per allineare il comportamento con i quantize fatti
    # in recompute_from_transactions (CRIT-05); il default di Decimal è
    # ROUND_HALF_EVEN che divergerebbe sui mezzi-centesimi.
    asset.current_value_eur = (
        (asset.current_value * rate).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        if asset.current_value is not None and rate is not None
        else None
    )


def aggiorna_prezzo_singolo(asset: Asset) -> bool:
    """
    Aggiorna il prezzo di un singolo asset via Yahoo Finance.

    Restituisce True se l'aggiornamento ha avuto successo, False altrimenti.
    Non solleva eccezioni: logga l'errore e restituisce False
    per non bloccare l'aggiornamento degli altri asset.
    """
    if not asset.has_ticker:
        logger.info(f"Asset '{asset.name}' senza ticker, skip aggiornamento automatico")
        return False

    if asset.price_source == BORSA_SOURCE:
        return _aggiorna_prezzo_borsa_italiana(asset)
    if _asset_auto_uses_borsa(asset):
        if _aggiorna_prezzo_borsa_italiana(asset):
            return True

    logger.debug(
        f"Aggiornamento prezzo: ticker={asset.price_identifier} asset='{asset.name}' currency={asset.currency}"
    )

    try:

        def _fetch_price():
            t = yf.Ticker(asset.price_identifier)
            # fast_info è la via più veloce; su alcuni ticker/orari può restituire None
            raw = t.fast_info.get("regularMarketPrice") or t.fast_info.get("lastPrice")
            currency = t.fast_info.get("currency") or ""
            logger.debug(
                f"{asset.price_identifier}: fast_info price={raw} currency={currency}"
            )
            if raw:
                return raw, currency
            # fallback: ultimo close da history (stessa fonte usata dal backfill storico)
            logger.debug(
                f"{asset.price_identifier}: fast_info vuoto, fallback a history(5d)"
            )
            hist = t.history(period="5d", interval="1d", auto_adjust=False)
            if hist is not None and not hist.empty:
                close = hist["Close"].dropna()
                if not close.empty:
                    if not currency:
                        currency = (
                            (t.fast_info.get("currency") or "")
                            if hasattr(t, "fast_info")
                            else ""
                        )
                    logger.debug(
                        f"{asset.price_identifier}: history fallback price={float(close.iloc[-1])} currency={currency}"
                    )
                    return float(close.iloc[-1]), currency
            logger.debug(
                f"{asset.price_identifier}: nessun dato né da fast_info né da history"
            )
            return None, currency

        try:
            raw_price, yf_currency = _run_with_timeout(_fetch_price, _YFINANCE_TIMEOUT)
        except FuturesTimeoutError:
            logger.warning(
                f"Timeout ({_YFINANCE_TIMEOUT}s) aggiornamento '{asset.price_identifier}': skip"
            )
            return _try_auto_borsa_fallback(asset)

        if not raw_price:
            logger.warning(
                f"Nessun prezzo trovato per ticker '{asset.price_identifier}' (yf_currency={yf_currency!r})"
            )
            return _try_auto_borsa_fallback(asset)

        prezzo = Decimal(str(raw_price))

        divisor = _ticker_currency_factor(yf_currency)
        if divisor != Decimal("1"):
            prezzo = prezzo / divisor
            logger.info(
                "%s: conversione %s→%s (÷%s)",
                asset.price_identifier,
                yf_currency,
                _normalize_provider_currency(yf_currency),
                divisor,
            )
        resolved_currency = _normalize_provider_currency(yf_currency)
        if resolved_currency:
            asset.currency = resolved_currency

        asset.price_per_share = prezzo

        # Se abbiamo il numero di quote, aggiorniamo il valore totale.
        # Quantize esplicito a 0.01 con ROUND_HALF_UP (CRIT-05): senza quantize
        # un prodotto Decimal(price)*Decimal(shares) può avere >2 decimali e il
        # save sul field con decimal_places=2 farebbe un troncamento implicito
        # divergente dal ricalcolo lato aggregato.
        if asset.shares:
            asset.current_value = (prezzo * asset.shares).quantize(
                Decimal("0.01"), rounding=ROUND_HALF_UP
            )
        else:
            # Senza quote, aggiorniamo solo il prezzo per quota
            # L'utente dovrà impostare il numero di quote manualmente
            logger.info(
                f"Asset '{asset.name}': prezzo aggiornato ma nessuna quota impostata"
            )

        asset.last_price_update = datetime.now(timezone.utc)

        _update_current_value_eur(asset)

        asset.save()

        # HIGH-06: anchor today's fetched price into the history immediately, so
        # `last_price_update` freshness is always backed by a matching chart
        # point. Mirrors the Borsa path (which upserts quote.as_of) — without it
        # the yfinance path bumped last_price_update but only wrote history via
        # the bootstrap backfill below, leaving the latest point stale (or the
        # chart empty) whenever that best-effort backfill failed.
        AssetPriceHistory.objects.update_or_create(
            asset=asset,
            date=datetime.now(timezone.utc).date(),
            defaults={
                "close": prezzo.quantize(Decimal("0.0001")),
                "owner": asset.owner,
            },
        )

        # Bootstrap: if no historical price cached yet, do a full backfill so the
        # chart selector is populated from the first transaction onwards. Without
        # this, the user sees an updated price but an empty chart on all periods.
        try:
            # <= 1 because we just upserted today's point above; a full backfill
            # is still needed when that single point is the only history we have.
            if AssetPriceHistory.objects.filter(asset=asset).count() <= 1:
                logger.info(
                    "%s: cache vuota, eseguo backfill bootstrap",
                    asset.price_identifier,
                )
                backfill_price_history(asset)
        except Exception as e:
            logger.warning(
                "Bootstrap backfill failed for '%s': %s", asset.price_identifier, e
            )

        logger.info(f"✓ {asset.price_identifier}: {prezzo} {asset.currency}")
        return True

    except Exception as e:
        # Catturo qualsiasi eccezione per non bloccare gli altri asset
        logger.error(f"Errore aggiornamento '{asset.price_identifier}': {e}")
        return _try_auto_borsa_fallback(asset)


def _asset_auto_uses_borsa(asset: Asset) -> bool:
    return (
        asset.price_source == Asset.PRICE_SOURCE_AUTO
        and looks_like_borsa_fund_identifier(asset.price_identifier)
    )


def _try_auto_borsa_fallback(asset: Asset) -> bool:
    if asset.price_source != Asset.PRICE_SOURCE_AUTO:
        return False
    identifier = asset.price_identifier
    if not looks_like_borsa_fund_identifier(identifier):
        return False
    symbol = normalize_borsa_symbol(identifier)
    logger.info(
        "%s: identificativo compatibile con Borsa Italiana, ritento con provider Borsa",
        identifier,
    )
    asset.source_symbol = symbol
    asset.source_url = asset.source_url or borsa_detail_url(symbol)
    asset.ticker = symbol
    return _aggiorna_prezzo_borsa_italiana(asset)


def _aggiorna_prezzo_borsa_italiana(asset: Asset) -> bool:
    symbol = normalize_borsa_symbol(asset.price_identifier)
    if not symbol:
        logger.error("Errore aggiornamento Borsa '%s': simbolo mancante", asset.name)
        return False
    try:
        requested_source = asset.price_source
        quote = BorsaItalianaFundsProvider().get_quote(symbol)
        prezzo = quote.price.quantize(Decimal("0.0001"))
        asset.price_per_share = prezzo
        asset.currency = quote.currency or asset.currency or "EUR"
        asset.price_source = (
            Asset.PRICE_SOURCE_AUTO
            if requested_source == Asset.PRICE_SOURCE_AUTO
            else BORSA_SOURCE
        )
        asset.source_symbol = symbol
        asset.source_url = asset.source_url or borsa_detail_url(symbol)
        asset.ticker = symbol

        if asset.shares:
            asset.current_value = (prezzo * asset.shares).quantize(Decimal("0.01"))
        else:
            logger.info(
                "Asset '%s': prezzo Borsa aggiornato ma nessuna quota impostata",
                asset.name,
            )

        asset.last_price_update = datetime.now(timezone.utc)
        _update_current_value_eur(asset)

        asset.save()

        if quote.as_of:
            AssetPriceHistory.objects.update_or_create(
                asset=asset,
                date=quote.as_of,
                defaults={"close": prezzo, "owner": asset.owner},
            )

        try:
            if AssetPriceHistory.objects.filter(asset=asset).count() <= 1:
                backfill_price_history(asset)
        except Exception as e:
            logger.warning("Bootstrap backfill Borsa failed for '%s': %s", symbol, e)

        logger.info("✓ %s: %s %s via Borsa Italiana", symbol, prezzo, asset.currency)
        return True
    except Exception as e:
        logger.error("Errore aggiornamento Borsa '%s': %s", symbol, e)
        return False


def _ticker_currency_factor(yf_currency: str) -> Decimal:
    """Fattore di conversione dalla valuta Yahoo alla valuta nominale dell'asset.
    LSE (GBp/GBX), ZA cents (ZAc) e USD cents (USX) sono quotati in centesimi:
    dividi per 100 per arrivare alla valuta nominale."""
    if not yf_currency:
        return Decimal("1")
    normalized = yf_currency.strip()
    if normalized in ("GBp", "GBX", "ZAc", "USX"):
        return Decimal("100")
    if normalized.upper() == "ILA":  # Israeli agora (cents)
        return Decimal("100")
    return Decimal("1")


def _yf_history_with_retry(
    ticker_obj, start, end, interval, auto_adjust, max_attempts=2
):
    """Wrapper su yf.Ticker.history con retry su 429/connection errors.

    Yahoo Finance throttla per IP; un singolo 429 può vuotare lo storico fino al
    prossimo refresh. Retry con backoff esponenziale leggero + jitter,
    max_attempts=2 di default per restare sotto _BACKFILL_TIMEOUT quando
    chiamato in request thread.
    """
    last_exc = None
    for attempt in range(max_attempts):
        try:
            hist = ticker_obj.history(
                start=start,
                end=end,
                interval=interval,
                auto_adjust=auto_adjust,
            )
            return hist, None
        except Exception as e:
            last_exc = e
            msg = str(e).lower()
            transient = (
                "429" in msg
                or "rate limit" in msg
                or "too many requests" in msg
                or "timeout" in msg
                or "connection" in msg
            )
            if not transient or attempt == max_attempts - 1:
                break
            sleep_s = min(2**attempt, 4) + random.uniform(0, 0.25)
            logger.warning(
                "yfinance transient error '%s' (attempt %d/%d), retry in %.2fs",
                e,
                attempt + 1,
                max_attempts,
                sleep_s,
            )
            time.sleep(sleep_s)
    return None, last_exc


def backfill_price_history(asset: Asset, from_date: date_cls | None = None) -> int:
    """Riempie la cache `AssetPriceHistory` per `asset` da `from_date` (inclusa) a oggi.

    Usa `yf.Ticker(...).history(start=, end=)` (giornaliero). Entry duplicate vengono
    ignorate via bulk_create(ignore_conflicts). Retry su rate limit / connection.

    Ritorna il numero di nuove entry create. Non solleva eccezioni.
    """
    result, _meta = _backfill_price_history_with_meta(asset, from_date=from_date)
    return result


def _backfill_price_history_with_meta(
    asset: Asset, from_date: date_cls | None = None
) -> tuple[int, dict]:
    """Variante che ritorna anche metadata {status, message} per la response API.

    status: "ok" | "no_ticker" | "no_data" | "error" | "future_start"
    """
    if not asset.has_ticker:
        return 0, {"status": "no_ticker", "message": "asset has no ticker"}

    today = date_cls.today()

    if from_date is None:
        first_tx = asset.transactions.order_by("date").first()
        from_date = (
            first_tx.date
            if first_tx
            else (asset.created_at.date() if asset.created_at else today)
        )

    if from_date > today:
        return 0, {"status": "future_start", "message": "from_date is in the future"}

    points, meta = fetch_price_history_points(
        asset, from_date, today=today, include_open=True
    )
    if meta["status"] != "ok":
        return 0, meta

    normalized_points = [
        (item[0], item[1], item[2]) if len(item) == 3 else (item[0], None, item[1])
        for item in points
    ]

    existing_dates = set(
        AssetPriceHistory.objects.filter(
            asset=asset, date__in=[day for day, _open, _close in normalized_points]
        ).values_list("date", flat=True)
    )
    rows = [
        AssetPriceHistory(
            asset=asset,
            date=day,
            open=open_price,
            close=close,
            owner=asset.owner,
        )
        for day, open_price, close in normalized_points
        if day not in existing_dates
    ]
    for day, open_price, _close in normalized_points:
        if day in existing_dates and open_price is not None:
            AssetPriceHistory.objects.filter(
                asset=asset,
                date=day,
                open__isnull=True,
            ).update(open=open_price)
    created = AssetPriceHistory.objects.bulk_create(rows, ignore_conflicts=True)
    logger.info(
        "%s: backfill %d righe preparate, %d nuove (%s→%s)",
        asset.price_identifier,
        len(rows),
        len(created),
        from_date,
        today,
    )
    return len(created), {"status": "ok", "message": f"{len(created)} new rows"}


def fetch_price_history_points(
    asset: Asset,
    from_date: date_cls,
    *,
    today: date_cls | None = None,
    include_open: bool = False,
) -> tuple[list[tuple], dict]:
    """Read validated provider history without mutating the local cache."""
    if not asset.has_ticker:
        return [], {"status": "no_ticker", "message": "asset has no ticker"}

    today = today or date_cls.today()
    if from_date > today:
        return [], {"status": "future_start", "message": "from_date is in the future"}

    if asset.price_source == BORSA_SOURCE or _asset_auto_uses_borsa(asset):
        symbol = asset.price_identifier
        try:
            points = BorsaItalianaFundsProvider().get_history(symbol)
        except Exception as exc:
            logger.error("Errore lettura storico Borsa '%s': %s", symbol, exc)
            return [], {"status": "error", "message": f"Borsa Italiana: {exc}"}
        points = [(d, close) for d, close in points if from_date <= d <= today]
        points = [(d, close) for d, close in points if close > 0]
        if not points:
            return [], {
                "status": "no_data",
                "message": (
                    f"Borsa Italiana returned no validated history from {from_date}"
                ),
            }
        if include_open:
            return [(day, None, close) for day, close in points], {
                "status": "ok",
                "message": f"{len(points)} rows",
            }
        return points, {"status": "ok", "message": f"{len(points)} rows"}

    ticker = yf.Ticker(asset.price_identifier)
    hist, exc = _yf_history_with_retry(
        ticker,
        start=from_date.isoformat(),
        end=(today + timedelta(days=1)).isoformat(),
        interval="1d",
        auto_adjust=False,
    )
    if exc is not None:
        logger.error("Errore lettura storico '%s': %s", asset.price_identifier, exc)
        return [], {"status": "error", "message": f"yfinance: {exc}"}
    if hist is None or hist.empty:
        logger.warning(
            "%s: nessuno storico Yahoo tra %s e %s",
            asset.price_identifier,
            from_date,
            today,
        )
        return [], {
            "status": "no_data",
            "message": f"yfinance returned empty history from {from_date}",
        }

    yf_currency = ""
    try:
        if hasattr(ticker, "fast_info"):
            yf_currency = ticker.fast_info.get("currency") or ""
    except Exception:
        # fast_info network call may fail; non-fatal — divisor defaults to 1.
        yf_currency = ""
    divisor = _ticker_currency_factor(yf_currency)
    logger.debug(
        "%s: storico ricevuto %d righe, yf_currency=%r, divisor=%s",
        asset.price_identifier,
        len(hist),
        yf_currency,
        divisor,
    )

    points = []
    for idx, row in hist.iterrows():
        open_price = row.get("Open")
        close = row.get("Close")
        if close is None or str(close) == "nan":
            logger.debug(
                "%s: riga %s ignorata (close=%r)", asset.price_identifier, idx, close
            )
            continue
        d = idx.date() if hasattr(idx, "date") else idx
        open_dec = None
        if open_price is not None and str(open_price) != "nan":
            open_dec = (Decimal(str(open_price)) / divisor).quantize(Decimal("0.0001"))
            if open_dec <= 0:
                open_dec = None
        close_dec = (Decimal(str(close)) / divisor).quantize(Decimal("0.0001"))
        if close_dec <= 0:
            logger.warning(
                "%s: riga %s ignorata (close non positivo=%s)",
                asset.price_identifier,
                idx,
                close_dec,
            )
            continue
        if include_open:
            points.append((d, open_dec, close_dec))
        else:
            points.append((d, close_dec))
    if not points:
        return [], {
            "status": "no_data",
            "message": f"yfinance returned no valid close from {from_date}",
        }
    return points, {"status": "ok", "message": f"{len(points)} rows"}


def extend_price_history_daily(user=None) -> int:
    """Estende la cache `AssetPriceHistory` dal max(date) cachato a oggi per ogni asset con ticker.

    Ritorna il numero totale di nuove entry create. Chiamata dal daemon startup e dal
    'Refresh prices' button.
    """
    total = 0
    assets = Asset.objects.filter(tracking_type=Asset.AUTO, is_archived=False).exclude(
        ticker="", source_symbol=""
    )
    if user is not None:
        assets = assets.filter(owner=user)
    for asset in assets:
        last = AssetPriceHistory.objects.filter(asset=asset).order_by("-date").first()
        from_date = (last.date + timedelta(days=1)) if last else None
        total += backfill_price_history(asset, from_date=from_date)
    return total


def get_historical_price(asset: Asset, target_date: date_cls) -> Decimal | None:
    """Prezzo di `asset` a `target_date` dalla cache `AssetPriceHistory`.

    - Se esiste entry esatta → la ritorna.
    - Altrimenti usa l'ultimo prezzo noto precedente.
    - Se la cache è vuota e l'asset ha ticker → prova backfill mirato intorno a target_date.
    - Ritorna None se impossibile determinare un prezzo.
    """

    def _query_latest():
        qs = AssetPriceHistory.objects.filter(asset=asset, date__lte=target_date)
        if asset.has_ticker:
            qs = qs.filter(close__gt=0)
        return qs.order_by("-date").first()

    before = _query_latest()

    if not before and asset.has_ticker:
        # cache vuota: tenta backfill breve intorno alla data
        try:
            start = target_date - timedelta(days=7)
            backfill_price_history(asset, from_date=start)
        except Exception:
            pass
        before = _query_latest()

    return before.close if before else None


def log_illiquid_value_snapshot(asset: Asset) -> None:
    """Registra il `current_value` di un asset illiquido in `AssetPriceHistory` (close=valore totale)."""
    if asset.tracking_type != Asset.MANUAL or asset.has_ticker:
        return
    if asset.current_value is None:
        return
    today = date_cls.today()
    AssetPriceHistory.objects.update_or_create(
        asset=asset,
        date=today,
        defaults={
            "close": Decimal(asset.current_value).quantize(Decimal("0.0001")),
            "owner": asset.owner,
        },
    )


def rebuild_manual_history(asset: Asset) -> None:
    """Ricostruisce `AssetPriceHistory` per asset MANUAL camminando sulle transazioni.

    Per ogni data di transazione, registra il saldo cumulato risultante
    (opening_balance + cash_in - cash_out + adjustments).
    Idempotente: cancella tutto e ricostruisce. Aggiunge sempre un punto a oggi col saldo finale.
    No-op per asset con ticker (gestiti da yfinance).
    """
    from .models import AssetTransaction, split_manual_opening_balance

    if asset.has_ticker:
        return

    AssetPriceHistory.objects.filter(asset=asset).delete()

    txs = list(
        asset.transactions.filter(is_verified=True).order_by("date", "created_at")
    )
    if not txs:
        if asset.opening_balance:
            today = date_cls.today()
            AssetPriceHistory.objects.bulk_create(
                [
                    AssetPriceHistory(
                        asset=asset,
                        date=asset.opening_balance_date or today,
                        close=Decimal(asset.opening_balance).quantize(
                            Decimal("0.0001")
                        ),
                        owner=asset.owner,
                    ),
                    AssetPriceHistory(
                        asset=asset,
                        date=today,
                        close=Decimal(
                            asset.current_value or asset.opening_balance
                        ).quantize(Decimal("0.0001")),
                        owner=asset.owner,
                    ),
                ],
                ignore_conflicts=True,
            )
        return

    opening_balance = Decimal(asset.opening_balance or 0)
    opening_date = asset.opening_balance_date or txs[0].date
    _, _, txs = split_manual_opening_balance(txs)
    cash_in = Decimal("0")
    cash_out = Decimal("0")
    adjustments = Decimal("0")
    daily_balance = {}

    if opening_date is not None:
        daily_balance[opening_date] = opening_balance

    for tx in txs:
        if tx.transaction_type == AssetTransaction.CASH_IN:
            cash_in += tx.price_per_share
        elif tx.transaction_type == AssetTransaction.CASH_OUT:
            cash_out += tx.price_per_share
        elif tx.transaction_type == AssetTransaction.ADJUSTMENT:
            adjustments += tx.price_per_share
        # NOTE: do not clamp — mirrors recompute_from_transactions behavior (overdraft allowed)
        invested = cash_in - cash_out
        balance = invested + adjustments + opening_balance
        daily_balance[tx.date] = balance

    today = date_cls.today()
    if asset.current_value is not None:
        daily_balance[today] = Decimal(asset.current_value)

    rows = [
        AssetPriceHistory(
            asset=asset, date=d, close=v.quantize(Decimal("0.0001")), owner=asset.owner
        )
        for d, v in daily_balance.items()
    ]
    AssetPriceHistory.objects.bulk_create(rows, ignore_conflicts=True)


def aggiorna_tutti_i_prezzi(user=None) -> dict:
    """
    Aggiorna i prezzi di tutti gli asset con ticker.
    Viene chiamato quando l'utente preme il bottone 'Refresh Prices' nel frontend.

    Restituisce un dizionario con il riepilogo dell'aggiornamento.
    """

    # Recuperiamo solo gli asset automatici con un identificatore prezzo.
    asset_con_ticker = Asset.objects.filter(
        tracking_type=Asset.AUTO, is_archived=False
    ).exclude(ticker="", source_symbol="")
    if user is not None:
        asset_con_ticker = asset_con_ticker.filter(owner=user)

    successi = 0
    errori = 0
    dettagli = []

    for asset in asset_con_ticker:
        ok = aggiorna_prezzo_singolo(asset)
        if ok:
            successi += 1
            dettagli.append(
                {
                    "name": asset.name,
                    "ticker": asset.price_identifier,
                    "status": "ok",
                    "price": float(asset.price_per_share or 0),
                }
            )
        else:
            errori += 1
            dettagli.append(
                {
                    "name": asset.name,
                    "ticker": asset.price_identifier,
                    "status": "error",
                }
            )

    # Estendi lo storico prezzi giornaliero (cache AssetPriceHistory)
    try:
        nuove = extend_price_history_daily(user=user)
        logger.info(f"✓ Storico prezzi esteso: {nuove} nuove righe")
    except Exception as e:
        logger.error(f"Errore estensione storico prezzi: {e}")

    # Crea uno snapshot del portfolio totale dopo l'aggiornamento.
    # Salta se tutti gli aggiornamenti sono falliti: uno snapshot con prezzi stale
    # è peggio di nessuno snapshot.
    if successi == 0 and errori > 0:
        logger.warning(
            "Nessun prezzo aggiornato con successo — snapshot non creato per evitare dati stale"
        )
    else:
        try:
            all_assets_qs = Asset.objects.select_related(
                "investment_type", "owner"
            ).filter(owner__isnull=False, is_archived=False)
            if user is not None:
                all_assets_qs = all_assets_qs.filter(owner=user)
            tutti_gli_asset = list(all_assets_qs)
            # Crea un snapshot per ogni utente che possiede almeno un asset
            by_owner: dict = {}
            for asset in tutti_gli_asset:
                uid = asset.owner_id
                if uid not in by_owner:
                    by_owner[uid] = {"owner": asset.owner, "assets": []}
                by_owner[uid]["assets"].append(asset)

            for uid, group in by_owner.items():
                owner = group["owner"]
                assets_for_user = group["assets"]

                # Use current_value_eur (EUR-converted) so snapshots are currency-agnostic.
                # Falls back to current_value for EUR assets where current_value_eur may be null.
                def _eur(a):
                    if not a.currency or a.currency == "EUR":
                        return a.current_value or Decimal("0")
                    return a.current_value_eur

                converted_assets = [a for a in assets_for_user if _eur(a) is not None]
                total_value = sum(_eur(a) for a in converted_assets) or Decimal("0")
                liquid_value = sum(
                    _eur(a) for a in converted_assets if a.is_liquid
                ) or Decimal("0")
                illiquid_value = sum(
                    _eur(a) for a in converted_assets if not a.is_liquid
                ) or Decimal("0")

                # by_asset_class and by_asset must use EUR-converted values, otherwise
                # the breakdown sum doesn't reconcile with total_value when assets are
                # in mixed currencies (e.g. USD). Mirrors the totals above.
                by_asset_class: dict[str, float] = {}
                by_asset_list = []
                for asset in converted_assets:
                    type_id = (
                        str(asset.investment_type_id)
                        if asset.investment_type_id
                        else "null"
                    )
                    asset_eur = float(_eur(asset))
                    by_asset_class[type_id] = round(
                        by_asset_class.get(type_id, 0.0) + asset_eur, 2
                    )
                    entry: dict = {
                        "asset_id": asset.id,
                        "name": asset.name,
                        "type_id": asset.investment_type_id,
                        "value": round(asset_eur, 2),
                    }
                    if asset.shares is not None:
                        entry["shares"] = float(asset.shares)
                    if asset.price_per_share is not None:
                        entry["price"] = float(asset.price_per_share)
                    by_asset_list.append(entry)

                PortfolioSnapshot.objects.update_or_create(
                    owner=owner,
                    snapshot_day=date_cls.today(),
                    defaults={
                        "total_value": total_value,
                        "liquid_value": liquid_value,
                        "illiquid_value": illiquid_value,
                        "by_asset_class": by_asset_class,
                        "by_asset": by_asset_list,
                        "snapshot_date": datetime.now(timezone.utc),
                    },
                )
                logger.info(f"✓ Portfolio snapshot per user={uid}: {total_value} EUR")
        except Exception as e:
            logger.error(f"Errore creazione portfolio snapshot: {e}")

    # Persist today's FX rates for all non-EUR currencies in the portfolio.
    # These are used by history and monthly-overview endpoints to convert values to EUR.
    try:
        from .fx import get_exchange_rate

        today_date = date_cls.today()
        all_assets = (
            Asset.objects.filter(is_archived=False)
            .exclude(currency="EUR")
            .exclude(currency__isnull=True)
            .exclude(currency="")
            .select_related("owner")
        )
        if user is not None:
            all_assets = all_assets.filter(owner=user)
        seen: set = set()
        for asset in all_assets:
            key = (asset.currency, asset.owner_id)
            if key in seen or not asset.owner_id:
                continue
            seen.add(key)
            ccy = asset.currency
            if ccy in ("GBp", "GBX"):
                ccy = "GBP"
            try:
                rate = get_exchange_rate(ccy, "EUR")
                if rate is None:
                    continue
                FXRateHistory.objects.update_or_create(
                    from_currency=ccy,
                    to_currency="EUR",
                    date=today_date,
                    owner=asset.owner,
                    defaults={"rate": rate},
                )
                logger.debug("FX storico: %s→EUR %s = %s", ccy, today_date, rate)
            except Exception as fx_err:
                logger.warning(
                    "FX storico: impossibile salvare %s→EUR per user=%s: %s",
                    ccy,
                    asset.owner_id,
                    fx_err,
                )
    except Exception as e:
        logger.error("Errore salvataggio FXRateHistory: %s", e)

    try:
        from .services import invalidate_dashboard_summary
        from .models import DashboardSummary
        from django.contrib.auth.models import User as _User

        # Invalida la cache per ogni utente con asset
        owner_ids = Asset.objects.values_list("owner_id", flat=True).distinct()
        if user is not None:
            owner_ids = owner_ids.filter(owner=user)
        for user_obj in _User.objects.filter(pk__in=owner_ids):
            invalidate_dashboard_summary(
                DashboardSummary.REASON_PRICE_REFRESH, user=user_obj
            )
    except Exception:
        pass

    return {
        "updated": successi,
        "errors": errori,
        "total": successi + errori,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "details": dettagli,
        "updated_prices": successi,
        "updated_assets": successi,
        "warnings": [d for d in dettagli if d["status"] == "error"],
    }


def refresh_prices_for_user(user) -> dict:
    return aggiorna_tutti_i_prezzi(user=user)
