import logging
import re
from dataclasses import dataclass
from datetime import date as date_cls, datetime
from decimal import Decimal, InvalidOperation
from html import unescape
from urllib.parse import urljoin

import requests
import yfinance as yf
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)

BORSA_SOURCE = "BORSA_ITALIANA"
YAHOO_SOURCE = "YAHOO"

BORSA_BASE_URL = "https://www.borsaitaliana.it"
BORSA_DETAIL_URL = BORSA_BASE_URL + "/borsa/fondi/dettaglio/{symbol}.html?lang=it"
BORSA_SEARCH_URL = BORSA_BASE_URL + "/borsa/fondi/fida/result.html"
BORSA_FIDA_HISTORY_URL = "https://borsaitaliana.fidainformatica.it/storici/histo/serie"
BORSA_PRODUCT_TYPES = (1, 2, 4, 5, 6)
DEFAULT_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}


@dataclass
class PriceQuote:
    price: Decimal
    currency: str
    as_of: date_cls | None = None
    name: str = ""
    previous: Decimal | None = None


def parse_italian_decimal(value: str | None) -> Decimal | None:
    if value is None:
        return None
    cleaned = (
        unescape(str(value))
        .replace("\xa0", " ")
        .replace("%", "")
        .replace("+", "")
        .strip()
    )
    if not cleaned or cleaned.upper() in {"N.D.", "ND", "N/A", "-"}:
        return None
    cleaned = re.sub(r"[^0-9,.\-]", "", cleaned)
    if "," in cleaned:
        cleaned = cleaned.replace(".", "").replace(",", ".")
    try:
        return Decimal(cleaned)
    except (InvalidOperation, ValueError):
        return None


def parse_borsa_date(value: str | None) -> date_cls | None:
    if not value:
        return None
    value = unescape(value).replace("\xa0", " ").strip()
    match = re.search(r"(\d{1,2})/(\d{1,2})/(\d{2,4})", value)
    if not match:
        return None
    day, month, year = [int(part) for part in match.groups()]
    if year < 100:
        year += 2000
    try:
        return date_cls(year, month, day)
    except ValueError:
        return None


def normalize_borsa_symbol(value: str | None) -> str:
    if not value:
        return ""
    value = value.strip()
    match = re.search(r"/borsa/fondi/dettaglio/([^/.?#]+)", value, re.I)
    if match:
        return match.group(1).upper()
    match = re.search(r"\b([A-Z0-9]{4,20})\b", value.upper())
    return match.group(1) if match else ""


def looks_like_borsa_fund_identifier(value: str | None) -> bool:
    symbol = normalize_borsa_symbol(value)
    if not symbol:
        return False
    raw = (value or "").strip()
    if re.search(r"/borsa/fondi/dettaglio/", raw, re.I):
        return True
    if "." in raw or "-" in raw:
        return False
    if re.fullmatch(r"[A-Z]{2}[A-Z0-9]{9}\d", symbol):
        return False
    return bool(
        4 <= len(symbol) <= 20
        and re.fullmatch(r"[A-Z0-9]+", symbol)
        and re.search(r"\d", symbol)
    )


def borsa_detail_url(symbol: str) -> str:
    return BORSA_DETAIL_URL.format(symbol=normalize_borsa_symbol(symbol))


def _clean_html_text(value: str | None) -> str:
    if not value:
        return ""
    text = re.sub(r"<[^>]+>", " ", str(value), flags=re.S)
    text = unescape(text).replace("\xa0", " ")
    return re.sub(r"\s+", " ", text).strip()


class BorsaItalianaFundsProvider:
    source = BORSA_SOURCE

    def __init__(self, session=None, timeout=10):
        self.session = session or requests.Session()
        self.timeout = timeout

    def _get(self, url, **kwargs):
        response = self.session.get(
            url,
            timeout=self.timeout,
            headers=DEFAULT_HEADERS,
            **kwargs,
        )
        response.raise_for_status()
        return response

    def _post_json(self, url, payload):
        response = self.session.post(
            url,
            json=payload,
            timeout=self.timeout,
            headers={**DEFAULT_HEADERS, "Accept": "application/json"},
        )
        response.raise_for_status()
        return response

    def get_quote(self, symbol_or_url: str) -> PriceQuote:
        symbol = normalize_borsa_symbol(symbol_or_url)
        if not symbol:
            raise ValueError("missing Borsa Italiana fund symbol")

        response = self._get(borsa_detail_url(symbol))
        raw_quote = self._parse_quote_from_html(response.text)
        if raw_quote:
            return raw_quote

        soup = BeautifulSoup(response.text, "html.parser")
        name = self._parse_name(soup)
        table_quote = self._parse_quote_table(soup)
        if table_quote:
            table_quote.name = name
            return table_quote

        price_node = soup.select_one(".summary-value .-formatPrice strong")
        currency_node = soup.find(string=re.compile(r"Valuta:"))
        date_node = soup.find(string=re.compile(r"Data:"))
        price = parse_italian_decimal(
            price_node.get_text(" ", strip=True) if price_node else ""
        )
        currency = self._extract_following_strong(currency_node) or "EUR"
        as_of = parse_borsa_date(self._extract_following_strong(date_node))
        if price is None:
            raise ValueError(f"Borsa Italiana quote not found for {symbol}")
        return PriceQuote(price=price, currency=currency, as_of=as_of, name=name)

    def get_history(self, symbol_or_url: str) -> list[tuple[date_cls, Decimal]]:
        symbol = normalize_borsa_symbol(symbol_or_url)
        if not symbol:
            return []
        try:
            response = self._post_json(BORSA_FIDA_HISTORY_URL, {"ticker": symbol})
            data = response.json()
            points = self._extract_history_points(data, symbol)
            if points:
                return points
            primary_series = self._find_primary_fida_series(data)
            if primary_series:
                quote = self.get_quote(symbol)
                points = self._rebase_history_points(primary_series, quote, symbol)
                if points:
                    return points
            logger.warning(
                "Borsa FIDA history payload has no series for requested symbol %s",
                symbol,
            )
        except Exception as exc:
            logger.warning("Borsa FIDA history unavailable for %s: %s", symbol, exc)
        return []

    def search(self, query: str, limit=8) -> list[dict]:
        query = (query or "").strip()
        if len(query) < 2:
            return []

        exact_symbol = normalize_borsa_symbol(query)
        results: list[dict] = []
        seen: set[str] = set()
        if exact_symbol and (
            query.startswith("http") or looks_like_borsa_fund_identifier(query)
        ):
            try:
                quote = self.get_quote(exact_symbol)
                results.append(
                    {
                        "symbol": exact_symbol,
                        "name": quote.name or exact_symbol,
                        "exchange": "Borsa Italiana",
                        "type": "Fund",
                        "source": BORSA_SOURCE,
                        "url": borsa_detail_url(exact_symbol),
                        "currency": quote.currency,
                    }
                )
                seen.add(exact_symbol)
            except Exception as exc:
                # Best-effort exact-symbol probe: a miss just means we fall back
                # to the product-type search below. Log at debug so a provider
                # outage is diagnosable instead of vanishing silently. (HIGH-13)
                logger.debug(
                    "Borsa exact-symbol probe failed q=%s: %s", exact_symbol, exc
                )

        for product_type in BORSA_PRODUCT_TYPES:
            if len(results) >= limit:
                break
            try:
                response = self._get(
                    BORSA_SEARCH_URL,
                    params={
                        "lang": "it",
                        "productType": product_type,
                        "partOfName": query,
                    },
                )
            except Exception as exc:
                logger.warning(
                    "Borsa search failed productType=%s q=%s: %s",
                    product_type,
                    query,
                    exc,
                )
                continue
            for item in self._parse_search_results(response.text):
                symbol = item["symbol"]
                if symbol in seen:
                    continue
                seen.add(symbol)
                results.append(item)
                if len(results) >= limit:
                    break
        return results[:limit]

    def _parse_name(self, soup: BeautifulSoup) -> str:
        meta = soup.find("meta", attrs={"name": "cws_cleaned_title"})
        if meta and meta.get("content"):
            return meta["content"].strip()
        h1 = soup.find("h1")
        return h1.get_text(" ", strip=True) if h1 else ""

    def _parse_quote_from_html(self, html: str) -> PriceQuote | None:
        price = None
        summary_match = re.search(
            r'class="[^"]*\bsummary-value\b[^"]*".{0,3000}?<strong[^>]*>(.*?)</strong>',
            html,
            flags=re.I | re.S,
        )
        if summary_match:
            price = parse_italian_decimal(_clean_html_text(summary_match.group(1)))

        if price is None:
            price_match = re.search(
                r'class="[^"]*-formatPrice[^"]*".{0,1200}?<strong[^>]*>(.*?)</strong>',
                html,
                flags=re.I | re.S,
            )
            if price_match:
                price = parse_italian_decimal(_clean_html_text(price_match.group(1)))

        if price is None:
            return None

        currency_match = re.search(
            r"Valuta\s*:?.{0,400}?<strong[^>]*>(.*?)</strong>",
            html,
            flags=re.I | re.S,
        )
        date_match = re.search(
            r"Data\s*:?.{0,400}?<strong[^>]*>(.*?)</strong>",
            html,
            flags=re.I | re.S,
        )
        previous = self._parse_previous_from_html(html)
        return PriceQuote(
            price=price,
            previous=previous,
            currency=(
                _clean_html_text(currency_match.group(1)) if currency_match else "EUR"
            )[:3]
            or "EUR",
            as_of=parse_borsa_date(
                _clean_html_text(date_match.group(1)) if date_match else ""
            ),
            name=self._parse_name_from_html(html),
        )

    def _parse_name_from_html(self, html: str) -> str:
        meta = re.search(
            r'<meta[^>]+name=["\']cws_cleaned_title["\'][^>]+content=["\']([^"\']+)["\']',
            html,
            flags=re.I | re.S,
        )
        if meta:
            return _clean_html_text(meta.group(1))
        title = re.search(r"<title[^>]*>(.*?)</title>", html, flags=re.I | re.S)
        if title:
            name = re.sub(
                r"\s*-\s*Borsa Italiana\s*$",
                "",
                _clean_html_text(title.group(1)),
                flags=re.I,
            )
            if name:
                return name
        h1 = re.search(r"<h1[^>]*>(.*?)</h1>", html, flags=re.I | re.S)
        return _clean_html_text(h1.group(1)) if h1 else ""

    def _parse_previous_from_html(self, html: str) -> Decimal | None:
        for table in re.findall(r"<table[^>]*>.*?</table>", html, flags=re.I | re.S):
            headers = [
                _clean_html_text(cell).lower()
                for cell in re.findall(r"<th[^>]*>(.*?)</th>", table, flags=re.I | re.S)
            ]
            if not {"ultima", "precedente", "valuta", "data"}.issubset(set(headers)):
                continue
            body = re.search(r"<tbody[^>]*>(.*?)</tbody>", table, flags=re.I | re.S)
            row = (
                re.search(r"<tr[^>]*>(.*?)</tr>", body.group(1), flags=re.I | re.S)
                if body
                else None
            )
            cells = (
                re.findall(r"<td[^>]*>(.*?)</td>", row.group(1), flags=re.I | re.S)
                if row
                else []
            )
            if len(cells) >= 2:
                return parse_italian_decimal(_clean_html_text(cells[1]))
        return None

    def _parse_quote_table(self, soup: BeautifulSoup) -> PriceQuote | None:
        for table in soup.find_all("table"):
            headers = [
                th.get_text(" ", strip=True).lower() for th in table.find_all("th")
            ]
            if not {"ultima", "precedente", "valuta", "data"}.issubset(set(headers)):
                continue
            row = table.find("tbody").find("tr") if table.find("tbody") else None
            if not row:
                continue
            cells = [td.get_text(" ", strip=True) for td in row.find_all("td")]
            if len(cells) < 4:
                continue
            price = parse_italian_decimal(cells[0])
            if price is None:
                continue
            return PriceQuote(
                price=price,
                previous=parse_italian_decimal(cells[1]),
                currency=(cells[2].strip() or "EUR")[:3],
                as_of=parse_borsa_date(cells[3]),
            )
        return None

    def _parse_search_results(self, html: str) -> list[dict]:
        soup = BeautifulSoup(html, "html.parser")
        items = []
        for row in soup.select("table tr"):
            link = row.select_one('a[href*="/borsa/fondi/dettaglio/"]')
            if not link:
                continue
            href = link.get("href", "")
            symbol = normalize_borsa_symbol(href)
            name = link.get_text(" ", strip=True)
            if not symbol or not name:
                continue
            cells = [
                td.get_text(" ", strip=True) for td in row.select("td.u-hidden.-xs")
            ]
            currency = cells[3].strip()[:3] if len(cells) >= 4 else "EUR"
            items.append(
                {
                    "symbol": symbol,
                    "name": name,
                    "exchange": "Borsa Italiana",
                    "type": "Fund",
                    "source": BORSA_SOURCE,
                    "url": urljoin(BORSA_BASE_URL, href),
                    "currency": currency or "EUR",
                }
            )
        return items

    def _extract_following_strong(self, text_node) -> str:
        if not text_node or not getattr(text_node, "parent", None):
            return ""
        strong = text_node.parent.find("strong")
        return strong.get_text(" ", strip=True) if strong else ""

    def _extract_history_points(
        self, data, symbol: str
    ) -> list[tuple[date_cls, Decimal]]:
        series = self._find_series_for_symbol(data, symbol)
        return self._parse_history_series(series)

    def _parse_history_series(self, series) -> list[tuple[date_cls, Decimal]]:
        points = []
        for item in series or []:
            if not isinstance(item, dict):
                continue
            raw_date = item.get("date") or item.get("Date") or item.get("data")
            raw_close = (
                item.get("Close")
                or item.get("close")
                or item.get("value")
                or item.get("y")
            )
            parsed_date = self._parse_history_date(raw_date)
            close = (
                parse_italian_decimal(str(raw_close)) if raw_close is not None else None
            )
            if parsed_date and close is not None:
                points.append((parsed_date, close.quantize(Decimal("0.0001"))))
        return sorted(dict(points).items())

    def _find_primary_fida_series(self, data):
        """Return the fund series declared first by FIDA, excluding benchmarks."""
        if not isinstance(data, dict):
            return []
        ids = data.get("ids")
        if not isinstance(ids, list) or not ids or not ids[0]:
            return []
        return self._find_series_for_symbol(data.get("results"), str(ids[0]))

    def _rebase_history_points(
        self, series, quote: PriceQuote, symbol: str
    ) -> list[tuple[date_cls, Decimal]]:
        """Convert a FIDA performance index into NAV values anchored to the quote."""
        points = self._parse_history_series(series)
        if (
            len(points) < 2
            or quote.as_of is None
            or quote.previous is None
            or quote.price <= 0
            or points[-1][1] <= 0
        ):
            logger.warning(
                "Borsa FIDA normalized series cannot be validated for %s", symbol
            )
            return []

        if points[-1][0] != quote.as_of:
            logger.warning(
                "Borsa FIDA normalized series date mismatch for %s: %s != %s",
                symbol,
                points[-1][0],
                quote.as_of,
            )
            return []

        factor = quote.price / points[-1][1]
        rebased = [
            (day, (close * factor).quantize(Decimal("0.0001"))) for day, close in points
        ]
        if not self._matches_displayed_value(rebased[-1][1], quote.price):
            logger.warning("Borsa FIDA normalized latest NAV mismatch for %s", symbol)
            return []
        if not self._matches_displayed_value(rebased[-2][1], quote.previous):
            logger.warning("Borsa FIDA normalized previous NAV mismatch for %s", symbol)
            return []
        return rebased

    def _matches_displayed_value(self, value: Decimal, displayed: Decimal) -> bool:
        precision = Decimal(1).scaleb(displayed.as_tuple().exponent)
        return value.quantize(precision) == displayed

    def _find_series_for_symbol(self, value, symbol: str):
        """Return only a series explicitly associated with the requested symbol.

        FIDA responses have changed shape over time. Recursing is useful, but
        accepting the first date/value list is unsafe because a payload may
        contain multiple instruments.
        """
        requested = symbol.upper()
        if isinstance(value, list):
            for item in value:
                found = self._find_series_for_symbol(item, requested)
                if found:
                    return found
        elif isinstance(value, dict):
            for key, item in value.items():
                if str(key).upper() == requested and isinstance(item, list):
                    return item

            item_symbol = (
                value.get("ticker")
                or value.get("symbol")
                or value.get("id")
                or value.get("code")
            )
            if str(item_symbol or "").upper() == requested:
                for key in ("series", "points", "values", "data"):
                    item = value.get(key)
                    if isinstance(item, list):
                        return item

            for item in value.values():
                found = self._find_series_for_symbol(item, requested)
                if found:
                    return found
        return []

    def _parse_history_date(self, raw):
        if raw is None:
            return None
        if isinstance(raw, (int, float)):
            value = float(raw)
            if value > 10_000_000_000:
                value /= 1000
            try:
                return datetime.fromtimestamp(value).date()
            except (ValueError, OSError):
                return None
        text = str(raw).strip()
        parsed = parse_borsa_date(text)
        if parsed:
            return parsed
        try:
            return datetime.fromisoformat(text.replace("Z", "+00:00")).date()
        except ValueError:
            return None


def search_yahoo(query: str, limit=8) -> list[dict]:
    results = yf.Search(query, max_results=limit).quotes
    return [
        {
            "symbol": r.get("symbol", ""),
            "name": r.get("shortname") or r.get("longname") or "",
            "exchange": r.get("exchange") or r.get("fullExchangeName") or "",
            "type": r.get("quoteType", ""),
            "source": YAHOO_SOURCE,
            "url": "",
            "currency": "",
        }
        for r in (results or [])
        if r.get("symbol")
    ][:limit]


def _looks_like_isin(query: str) -> bool:
    return bool(re.fullmatch(r"[A-Z]{2}[A-Z0-9]{9}\d", (query or "").upper()))


def search_price_sources(query: str, limit=8, fallback_query: str = "") -> list[dict]:
    results = []
    seen = set()
    queries = [(query, "isin" if _looks_like_isin(query) else "query")]
    if fallback_query and fallback_query.strip().lower() != query.strip().lower():
        queries.append((fallback_query, "name"))

    for candidate_query, match_reason in queries:
        for searcher in (
            lambda q: BorsaItalianaFundsProvider().search(q, limit=limit),
            lambda q: search_yahoo(q, limit=limit),
        ):
            try:
                for item in searcher(candidate_query):
                    key = (item.get("source"), item.get("symbol"))
                    if key in seen:
                        continue
                    seen.add(key)
                    results.append({**item, "match_reason": match_reason})
                    if len(results) >= limit:
                        return results
            except Exception as exc:
                logger.warning(
                    "price source search failed q=%s: %s", candidate_query, exc
                )
        if results:
            break
    return results[:limit]
