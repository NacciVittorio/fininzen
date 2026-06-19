from datetime import date
from decimal import Decimal
from unittest.mock import Mock, patch

from portfolio.models import Asset, AssetPriceHistory
from portfolio.price_providers import (
    BorsaItalianaFundsProvider,
    PriceQuote,
    looks_like_borsa_fund_identifier,
    search_price_sources,
)
from portfolio.prices import aggiorna_prezzo_singolo


DETAIL_HTML = """
<html>
  <head>
    <meta name="cws_cleaned_title" content="Arca Previdenza Alta Crescita Sostenibile C">
  </head>
  <body>
    <table>
      <thead>
        <tr>
          <th>Ultima</th><th>Precedente</th><th>Valuta</th><th>Data</th><th>Variazione</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><span>42,056</span></td>
          <td><span>39,841</span></td>
          <td><span>EUR</span></td>
          <td><span>30/04/26</span></td>
          <td><span>+5,56</span></td>
        </tr>
      </tbody>
    </table>
  </body>
</html>
"""

SUMMARY_HTML = """
<!--[if !IE]><!--><!--<![endif]-->
<html>
  <head>
    <meta name="cws_cleaned_title" content="Arca Previdenza Alta Crescita Sostenibile C">
  </head>
  <body>
    <div class="summary-value">
      <span class="-formatPrice"><strong>42,056</strong></span>
      <p>Valuta: <strong>EUR</strong></p>
      <p>Data: <strong>30/04/26</strong></p>
    </div>
  </body>
</html>
"""

SUMMARY_WITH_TABLE_HTML = """
<html>
  <head>
    <meta name="cws_cleaned_title" content="Arca Previdenza Alta Crescita Sostenibile C">
  </head>
  <body>
    <div class="summary-value">
      <span class="-formatPrice"><strong>42,056</strong></span>
      <p>Valuta: <strong>EUR</strong></p>
      <p>Data: <strong>30/04/26</strong></p>
    </div>
    <table>
      <thead>
        <tr>
          <th><span><strong>Ultima</strong></span></th>
          <th><span><strong>Precedente</strong></span></th>
          <th><span><strong>Valuta</strong></span></th>
          <th><span><strong>Data</strong></span></th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><span>42,056</span></td>
          <td><span>39,841</span></td>
          <td><span>EUR</span></td>
          <td><span>30/04/26</span></td>
        </tr>
      </tbody>
    </table>
  </body>
</html>
"""


def test_borsa_provider_parses_detail_quote():
    response = Mock(text=DETAIL_HTML)
    response.raise_for_status.return_value = None
    session = Mock()
    session.get.return_value = response

    quote = BorsaItalianaFundsProvider(session=session).get_quote("4ARLPAC")

    assert quote.name == "Arca Previdenza Alta Crescita Sostenibile C"
    assert quote.price == Decimal("42.056")
    assert quote.previous == Decimal("39.841")
    assert quote.currency == "EUR"
    assert quote.as_of == date(2026, 4, 30)


def test_borsa_provider_parses_real_summary_markup():
    response = Mock(text=SUMMARY_HTML)
    response.raise_for_status.return_value = None
    session = Mock()
    session.get.return_value = response

    quote = BorsaItalianaFundsProvider(session=session).get_quote("4ARLPAC")

    assert quote.name == "Arca Previdenza Alta Crescita Sostenibile C"
    assert quote.price == Decimal("42.056")
    assert quote.currency == "EUR"
    assert quote.as_of == date(2026, 4, 30)


def test_borsa_provider_parses_previous_from_nested_table_markup():
    response = Mock(text=SUMMARY_WITH_TABLE_HTML)
    response.raise_for_status.return_value = None
    session = Mock()
    session.get.return_value = response

    quote = BorsaItalianaFundsProvider(session=session).get_quote("4ARLPAC")

    assert quote.previous == Decimal("39.841")


def test_borsa_identifier_detection_avoids_isin():
    assert looks_like_borsa_fund_identifier("4ARLPAC")
    assert looks_like_borsa_fund_identifier(
        "https://www.borsaitaliana.it/borsa/fondi/dettaglio/4ARLPAC.html?lang=it"
    )
    assert not looks_like_borsa_fund_identifier("IT0001234567")


def test_borsa_history_accepts_series_for_requested_symbol():
    response = Mock()
    response.raise_for_status.return_value = None
    response.json.return_value = {
        "results": [
            {
                "4ARLPAC": [
                    {"date": "31/03/2026", "close": "39,841"},
                    {"date": "30/04/2026", "close": "42,056"},
                ]
            }
        ]
    }
    session = Mock()
    session.post.return_value = response

    points = BorsaItalianaFundsProvider(session=session).get_history("4ARLPAC")

    assert points == [
        (date(2026, 3, 31), Decimal("39.8410")),
        (date(2026, 4, 30), Decimal("42.0560")),
    ]


def test_borsa_history_rejects_unrelated_nested_series_without_quote_fallback():
    response = Mock()
    response.raise_for_status.return_value = None
    response.json.return_value = {
        "results": [
            {
                "OTHER": [
                    {"date": "31/03/2026", "close": "999,999"},
                ]
            }
        ],
        "metadata": {
            "series": [
                {"date": "30/04/2026", "close": "42,056"},
            ]
        },
    }
    session = Mock()
    session.post.return_value = response

    points = BorsaItalianaFundsProvider(session=session).get_history("4ARLPAC")

    assert points == []
    session.get.assert_not_called()


def test_borsa_history_rebases_primary_fida_series_and_ignores_benchmark():
    history_response = Mock()
    history_response.raise_for_status.return_value = None
    history_response.json.return_value = {
        "ids": ["ARACRE", "BSCI122"],
        "results": [
            {
                "ARACRE": [
                    {"date": "2026-03-31T00:00:00", "Close": 120.961227},
                    {"date": "2026-04-30T00:00:00", "Close": 127.686188},
                ]
            },
            {
                "BSCI122": [
                    {"date": "2026-03-31T00:00:00", "Close": 149.999999},
                    {"date": "2026-04-30T00:00:00", "Close": 150.999999},
                ]
            },
        ],
    }
    quote_response = Mock(text=SUMMARY_WITH_TABLE_HTML)
    quote_response.raise_for_status.return_value = None
    session = Mock()
    session.post.return_value = history_response
    session.get.return_value = quote_response

    points = BorsaItalianaFundsProvider(session=session).get_history("4ARLPAC")

    assert points == [
        (date(2026, 3, 31), Decimal("39.8410")),
        (date(2026, 4, 30), Decimal("42.0560")),
    ]


def test_borsa_history_rejects_normalized_series_when_previous_nav_mismatches():
    history_response = Mock()
    history_response.raise_for_status.return_value = None
    history_response.json.return_value = {
        "ids": ["ARACRE", "BSCI122"],
        "results": [
            {
                "ARACRE": [
                    {"date": "2026-03-31T00:00:00", "Close": 100},
                    {"date": "2026-04-30T00:00:00", "Close": 127.686188},
                ]
            }
        ],
    }
    quote_response = Mock(text=SUMMARY_WITH_TABLE_HTML)
    quote_response.raise_for_status.return_value = None
    session = Mock()
    session.post.return_value = history_response
    session.get.return_value = quote_response

    points = BorsaItalianaFundsProvider(session=session).get_history("4ARLPAC")

    assert points == []


def test_search_price_sources_uses_name_fallback_after_isin_miss():
    yahoo_match = {
        "symbol": "0P0001EJWF.F",
        "name": "Amundi Core Pension Azionario Plus 90%",
        "exchange": "FRA",
        "type": "MUTUALFUND",
        "source": "YAHOO",
        "url": "",
        "currency": "",
    }
    with (
        patch.object(BorsaItalianaFundsProvider, "search", return_value=[]),
        patch(
            "portfolio.price_providers.search_yahoo",
            side_effect=[[], [yahoo_match]],
        ) as yahoo_search,
    ):
        results = search_price_sources(
            "QS0000061309",
            fallback_query="Amundi Core Pension Azionario Plus 90%",
        )

    assert results == [{**yahoo_match, "match_reason": "name"}]
    assert yahoo_search.call_count == 2


def test_create_asset_promotes_borsa_identifier(client, itype):
    res = client.post(
        "/api/portfolio/",
        data={
            "name": "Arca Previdenza",
            "ticker": "4ARLPAC",
            "source_symbol": "4ARLPAC",
            "investment_type": itype.id,
            "tracking_type": "AUTO",
            "shares": "10.000000",
            "invested_capital": "400.00",
            "current_value": "400.00",
        },
        content_type="application/json",
    )

    assert res.status_code == 201
    data = res.json()
    assert data["price_source"] == Asset.PRICE_SOURCE_AUTO
    assert data["source_symbol"] == "4ARLPAC"
    assert data["source_url"].endswith("/4ARLPAC.html?lang=it")
    asset = Asset.objects.get(pk=data["id"])
    assert asset.price_source == Asset.PRICE_SOURCE_AUTO


def test_refresh_borsa_asset_updates_price_and_history(itype, test_user):
    asset = Asset.objects.create(
        name="Arca Previdenza",
        ticker="4ARLPAC",
        source_symbol="4ARLPAC",
        price_source=Asset.PRICE_SOURCE_BORSA_ITALIANA,
        investment_type=itype,
        shares=Decimal("10.000000"),
        invested_capital=Decimal("400.00"),
        current_value=Decimal("400.00"),
        owner=test_user,
    )
    provider = Mock()
    provider.get_quote.return_value = PriceQuote(
        price=Decimal("42.056"),
        currency="EUR",
        as_of=date(2026, 4, 30),
        name="Arca Previdenza Alta Crescita Sostenibile C",
    )
    provider.get_history.return_value = [(date(2026, 4, 30), Decimal("42.0560"))]

    with patch("portfolio.prices.BorsaItalianaFundsProvider", return_value=provider):
        assert aggiorna_prezzo_singolo(asset) is True

    asset.refresh_from_db()
    assert asset.price_per_share == Decimal("42.0560")
    assert asset.current_value == Decimal("420.56")
    assert asset.current_value_eur == Decimal("420.56")
    assert AssetPriceHistory.objects.filter(
        asset=asset, date=date(2026, 4, 30), close=Decimal("42.0560")
    ).exists()


def test_refresh_promotes_borsa_code_when_yahoo_fails(itype, test_user):
    asset = Asset.objects.create(
        name="Arca Previdenza",
        ticker="4ARLPAC",
        source_symbol="4ARLPAC",
        price_source=Asset.PRICE_SOURCE_AUTO,
        investment_type=itype,
        shares=Decimal("10.000000"),
        invested_capital=Decimal("400.00"),
        current_value=Decimal("400.00"),
        owner=test_user,
    )
    provider = Mock()
    provider.get_quote.return_value = PriceQuote(
        price=Decimal("42.056"),
        currency="EUR",
        as_of=date(2026, 4, 30),
        name="Arca Previdenza Alta Crescita Sostenibile C",
    )
    provider.get_history.return_value = [(date(2026, 4, 30), Decimal("42.0560"))]

    with (
        patch("portfolio.prices.yf.Ticker", side_effect=Exception("yahoo broken")),
        patch("portfolio.prices.BorsaItalianaFundsProvider", return_value=provider),
    ):
        assert aggiorna_prezzo_singolo(asset) is True

    asset.refresh_from_db()
    assert asset.price_source == Asset.PRICE_SOURCE_AUTO
    assert asset.price_per_share == Decimal("42.0560")
    assert asset.current_value == Decimal("420.56")


def test_refresh_does_not_promote_when_yahoo_is_forced(itype, test_user):
    asset = Asset.objects.create(
        name="Arca Previdenza",
        ticker="4ARLPAC",
        source_symbol="4ARLPAC",
        price_source=Asset.PRICE_SOURCE_YAHOO,
        investment_type=itype,
        shares=Decimal("10.000000"),
        owner=test_user,
    )

    with (
        patch("portfolio.prices.yf.Ticker", side_effect=Exception("yahoo broken")),
        patch("portfolio.prices.BorsaItalianaFundsProvider") as provider_cls,
    ):
        assert aggiorna_prezzo_singolo(asset) is False

    provider_cls.assert_not_called()
    asset.refresh_from_db()
    assert asset.price_source == Asset.PRICE_SOURCE_YAHOO
    assert asset.price_per_share is None


def test_search_ticker_returns_price_source_metadata(client):
    with patch(
        "portfolio.views.search_price_sources",
        return_value=[
            {
                "symbol": "4ARLPAC",
                "name": "Arca Previdenza Alta Crescita Sostenibile C",
                "exchange": "Borsa Italiana",
                "type": "Fund",
                "source": "BORSA_ITALIANA",
                "url": "https://www.borsaitaliana.it/borsa/fondi/dettaglio/4ARLPAC.html?lang=it",
                "currency": "EUR",
            }
        ],
    ) as search:
        res = client.get(
            "/api/portfolio/search-ticker/?q=QS0000061309&name=Amundi%20Core%20Pension"
        )

    assert res.status_code == 200
    data = res.json()
    assert data[0]["symbol"] == "4ARLPAC"
    assert data[0]["source"] == "BORSA_ITALIANA"
    assert data[0]["currency"] == "EUR"
    search.assert_called_once_with(
        "QS0000061309",
        limit=8,
        fallback_query="Amundi Core Pension",
    )
