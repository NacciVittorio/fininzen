# Heavy backend dependencies — why they stay, and the boundary

Fininzen's backend carries a heavyweight data/scraping stack relative to a CRUD
app. This note records **why each is kept** and **how its blast radius is
pinned**, so the weight is a deliberate choice rather than accidental creep.

## What's heavy and why it stays

| Dependency | Direct use | Verdict |
|---|---|---|
| `yfinance` | Fetch live ETF/stock/FX quotes + history (Yahoo Finance) | **Keep** — core price source |
| `beautifulsoup4` (`bs4`) | Parse Borsa Italiana / FIDA quote pages (the non-Yahoo source) | **Keep** — second price provider |
| `pandas`, `numpy` | Transitive only (yfinance returns DataFrames) — **no direct app import** | Keep (transitive) |
| `curl_cffi` | Transitive only (yfinance HTTP layer) | Keep (transitive) |
| `peewee` | Was a pinned transitive of yfinance with **no app usage** | **Unpinned** — let it resolve transitively |

Only **two modules** import the heavy stack directly:

- `portfolio/price_providers.py` — Yahoo + Borsa Italiana providers (`yfinance`, `bs4`)
- `portfolio/prices.py` — price orchestration / persistence (`yfinance`)

## The boundary, enforced

`fininzen/tests/test_dependency_boundaries.py` is a static guard: it greps the app
source and fails CI if `yfinance` / `bs4` / `curl_cffi` / `pandas` / `numpy` /
`peewee` is imported anywhere **outside** the two allowed modules. This stops the
heavy stack from spreading file-by-file. To add a legitimate new provider, extend
`ALLOWED` in that test (and think hard first).

## Known gap: request-path isolation (not done)

The guard pins the **import surface**, not runtime isolation. Today
`portfolio/prices.py` is still imported by some views (e.g.
`portfolio/views/asset_mixins/analytics.py` does a lazy yfinance fetch on a cache
miss), so yfinance is loaded into the gunicorn web process and a user request can
trigger a live upstream fetch.

The intended end state is that **only** the out-of-band refresh job
(`portfolio/management/commands/refresh_asset_prices.py`, driven by
`deploy/systemd/fininzen-refresh-prices.{service,timer}`) ever calls upstream, and
views read exclusively from persisted prices. Moving the remaining lazy fetches
behind the refresh job is a separate, larger refactor and is **not** part of the
current "keep & justify" pass — tracked here as a follow-up.
