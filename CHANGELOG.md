# Changelog

Formato: [SemVer](https://semver.org/) — `MAJOR.MINOR.PATCH`.

---

## [0.36.3] — 2026-05-22

### Changed
- **Backfill yfinance hardened in request thread** (`portfolio/views.py:price_history`, `portfolio/prices.py`): wrapped in `ThreadPoolExecutor` con timeout wall-clock `_BACKFILL_TIMEOUT=12s`. Retry ridotto da 3 (1+3+9s) a 2 attempts (1s linear backoff) per restare sotto timeout. `import time` spostato top-level. Prevents worker pool exhaustion under slow Yahoo Finance responses.
- **`existing_earliest` query cached** (`price_history`): prima query DB ripetuta due volte (pre+post backfill); ora una variabile riusata, ri-fetchata solo dopo backfill.
- **Tx feed gated su Portfolio tab** (`PortfolioView.jsx`): `loadAssetTxFeed` useEffect skip se `tab !== "portfolio"`. Evita refetch su ogni `bumpAssetTxRefresh` quando utente è su Dashboard/Cash Flow/Settings.
- **`deleteTx(txId, assetId)` no fallback** (`AppContext.jsx`): rimosso fallback a `txPanel?.id` (txPanel rimosso); `assetId` obbligatorio, log se mancante.
- **`metaBadge` memoizzato** (`AssetCard.jsx`): IIFE → `useMemo([meta, T])`.
- **Dead code rimosso** (`PortfolioView.jsx`): `txSectionRef` + import `useRef` (riferimento orfano dopo rimozione `focusAssetTransactions`).

---

## [0.36.2] — 2026-05-22

### Fixed
- **Selettore periodo Yahoo Finance non carica dati storici**: bug cronico nel ChartModal asset (1D/5D/1M/.../MAX). Cause root e fix:
  - **Auto-backfill on cache miss** (`portfolio/views.py:price_history`): se `AssetPriceHistory` non copre il `since=today-days` richiesto, ora chiama `_backfill_price_history_with_meta(asset, from_date=since)` prima di servire la query. Prima il cache restava parziale per sempre.
  - **Retry yfinance su 429/connection** (`_yf_history_with_retry` in `prices.py`): wrapper con backoff esponenziale 1/3/9s su rate limit, timeout e connection errors. Prima il primo 429 vuotava lo storico fino al successivo refresh manuale.
  - **Bootstrap backfill in `aggiorna_prezzo_singolo`**: se la cache è vuota dopo l'update prezzo, trigger backfill automatico. Risolve "prezzo aggiornato ma grafico vuoto".
  - **Cap `days` 1825 → 3650** (10Y). MAX sul ChartModal frontend ora scarica fino a 10 anni invece di essere capped a 5.
  - **`_ticker_currency_factor`** estesa a `ZAc`, `USX`, `ILA` oltre `GBp/GBX`: prima i ticker quotati in centesimi diversi da LSE davano valori 100× sbagliati.
  - **Response envelope `{points, earliest_available, requested_since, status, message}`**: status `ok|partial|no_data|error`. Frontend mostra badge "Dati disponibili dal YYYY-MM-DD" / "Yahoo Finance error" sotto il period selector quando applicabile.
- 8 test in `portfolio/tests/test_price_history_api.py`.

### Added
- **i18n EN/IT**: `chart_data_from`, `chart_no_data`, `chart_data_error`.

---

## [0.36.1] — 2026-05-22

### Fixed
- **Tx feed Portfolio nasconde legacy tx con `owner=NULL`**: `TransactionsFeedView` ora filtra per `asset__owner=user` invece di `tx.owner=user`. `AssetTransaction.owner` è nullable (legacy) e i flussi creati prima dell'introduzione del campo erano invisibili anche quando l'asset era di proprietà. +1 test di regressione.
- **Tx feed Portfolio includeva bank account tx**: `TransactionsFeedView` ora di default esclude AssetTransaction con `asset.investment_type.is_bank_account=True` (quei flussi appartengono al Cash Flow). Opt-in via `?include_bank=true`. Frontend dropdown filtro asset rimuove bank account. +2 test.

### Removed
- **`≡` history button su AssetCard**: ridondante con la nuova sezione Transazioni globale; rimossi anche prop `onHistory` e helper `focusAssetTransactions` (dead code).

---

## [0.36.0] — 2026-05-22

### Added
- **Global Transactions feed (Portfolio)**: nuovo endpoint `GET /api/portfolio/transactions/?asset=&type=&date_from=&date_to=&verified=&page=&page_size=` (`portfolio/views.py:TransactionsFeedView`) restituisce tutte le `AssetTransaction` dell'utente con shape `{count, next_page, results[]}` come cashflow feed. Owner-scoped via `_effective_user`. Pagina 50/all. 12 test in `test_transactions_feed.py`.
- **Sezione Transazioni in tab Portfolio**: lista globale sotto allocation panel con stile cashflow (day/month divider, row layout), filtri inline (asset dropdown + 5 type pills + reset), pagination Load more/Load all. Click su riga apre edit modal; click su `×` delete confirm.
- **i18n EN/IT**: `tx_type_buy/sell/cash_in/cash_out/adjustment`, `portfolio_transactions`, `portfolio_tx_filter_all_assets`, `filter_reset`, `loading`.

### Changed
- **AssetCard `onHistory` → focus su nuova lista**: click sul pulsante "History" di un asset ora setta `asset_ids` filter sulla nuova sezione e scrolla, invece di aprire txPanel full-screen.
- **Add Transaction unico (FAB)**: il bottone Add transaction è solo nel SpeedDial FAB. Modal supporta edit (`submitAddTxFromModal(assetId, form, txId)` → PATCH). Pre-fill asset+form quando aperto via row click.
- **AppContext**: nuovo state `assetTxItems/Filters/HasMore/Loading/TotalCount/RefreshKey`, `loadAssetTxFeed/loadMoreAssetTx/loadAllAssetTx/toggleAssetTxType`. `bumpAssetTxRefresh` chiamato in `refreshAfter` su mutazioni transaction/asset/expense/allocation/CSV/demo/portfolio reset. `deleteTx(txId, assetIdOverride)` ora generica.

### Removed
- **`txPanel` full-screen Transaction History**: ~553 righe in `PortfolioView.jsx` rimosse (panel inline + form embedded + 2 bottoni `+ Add` duplicati). Sostituito dalla nuova lista globale + edit via FAB modal.

---

## [0.35.3] — 2026-05-22

### Changed
- **Form select normalizzati su `.inp`** (`styles.css`): `<select class="inp">` mostrava chrome nativo del browser, inconsistente con `<input>` nei form Portfolio (new asset, add transaction). Aggiunti `appearance: none`, freccia SVG custom theme-aware, `font-family: inherit`, `box-sizing`, regole `textarea.inp`.

---

## [0.35.2] — 2026-05-22

### Fixed
- **Description suggestions popup in edit modal** (`ExpensesView.jsx`): popover autocompletamento appariva al precaricamento del form in edit. Aggiunto flag `descTouched` che gate la fetch sulla digitazione effettiva.

---

## [0.35.1] — 2026-05-22

### Fixed
- **Cashflow feed duplica righe con parent+child category** (`expenses/cashflow.py`): `.distinct()` sul queryset finale.
- **Portfolio import leak `str(e)` al client** (`portfolio/views.py`): `logger.exception` lato server + risposta generica.
- **transfer/adjust-balance swallowano errori** (`portfolio/views.py`): aggiunto `logger.exception` con payload.
- **ExportView audit log usa `request.user`** (`finnet/export_views.py`): usa `_effective_user(request)`.

### Changed
- **Modal a11y + token swap** (`Modal.jsx`, `DemoModal`): `role="dialog"`, `aria-modal`, focus trap, restore focus, backdrop/shadow via token.
- **AssetCard token swap**: rimossi 8 hex/rgba hardcoded → token semantici; `aria-label` su `✕`.
- **CategorySelect dropdown shadow** → `var(--shadow-soft)`.
- **Token system**: nuovi `--backdrop`, `--backdrop-strong`, `--shadow-modal`.

---

## [0.35.0] — 2026-05-22

### Added
- **Recurring Expenses v2**: `status` (ACTIVE/DISABLED/DELETED), `start_date`/`end_date`, `linked_asset`, `disabled_at`; `Expense.recurring_source` + `recurring_occurrence_date` con `UniqueConstraint` anti-duplicato. Helper `backfill_recurring_expense()`, `disable_expired_recurrings()`.
- **Currency Exposure Widget (E)**: `summary.by_currency` (lista `{currency, total_eur, percent}`); card Dashboard con donut, toggleabile.
- **Recurring Overview Widget (H)**: `GET /api/expenses/recurring/status/?month=&year=` (runtime, no schema change); card Dashboard con CTA Genera.
- **Portfolio Import (G)**: 3 action `POST /api/portfolio/import-{assets,transactions,accounts}/` con contratto cashflow importer; UI Settings → Import con selettore pill + mapping dinamico.
- **Parser helpers**: `parse_import_date()` multi-format, `parse_import_decimal()` EU/US in `portfolio/services.py`.

### Changed
- **"Expense category" → "Cash Flow category" (L)**: toggle Uscite/Entrate inline filtra `by_category` per `category_type`; segno colorato per direzione.
- **`/api/expenses/summary/`**: aggiunto `category__category_type` nei `values()`.
- **`AppContext.DASH_DEFAULT`**: chiavi `currency_exposure`, `recurring_overview` (default on).

### Tests
- +2 backend (L), +2 (E), +7 (H), +8 (G).

---

## [0.34.0] — 2026-05-21

### Added
- **Data Export (F)**: `GET /api/export/?type=…` CSV per Accounts/Assets/Transactions/Cash Flow/Price History + bundle `.zip`. Demo user 403. Query scope su `_effective_user`. 11 test backend.

### Fixed
- **Audit hardening prod**: Caddyfile HSTS/security headers; `.env.example` no più `SKIP_DB_ENCRYPTION_CHECK=1`; settings rifiuta avvio prod senza secret key/allowed hosts; ViewAs warn log su `X-View-As` rifiutato; reset endpoint richiede `{"confirm": true}`; `parseAmount` locale-aware; 21 `console.error` → `logError`; `current_value_eur` NOT NULL default 0; bootstrap `Asset.save()` senza FX cascade; SQLite dev in WAL + busy_timeout 30s.

### Changed
- **Migrations 0024/0025**: `UniqueConstraint` (no più `unique_together`); `current_value_eur` NOT NULL default 0.

### Tests
- +11 backend (F), +4 frontend (`parseAmount`), +7 regressione audit.

---

## [0.33.3] — 2026-05-19

### Fixed
- **MonthlyNetWorthTable card grezza**: 26 hex hardcoded sostituiti con token (`--card-inset`/`--rule`/`--rule-soft`).
- **YearSelect `${color}55` hack**: sostituito con `color-mix(in oklab, ${color} 35%, transparent)`.
- **Cashflow filtri duplicati**: rimossa doppia copia inline + Drawer; main view ora solo chip riepilogo; verified spostato nel Drawer.

### Changed
- **MonthlyNetWorthTable Toolbar**: mode toggle a `.segmented` pill-shape; chevron rounded 32×32; titolo a `.section-title`.

---

## [0.33.2] — 2026-05-19

### Changed
- **Cashflow restructure (HANDOFF)**: `<PageHeader>` + `<MonthPager>` + `<Drawer>` filtri; KPI via `<KpiStrip>`.
- **BankAccountsView/PortfolioView/FireView/SettingsView/LoginView redesign**: migrate a `PageHeader` + `KpiStrip` + `KpiCard tone="…"` + token. Eliminati cluster legacy inline.
- **KpiCard**: prop `onClick` + `tone` → drill-down e border-left semantic.
- **Final sweep `#fff` text**: 9 occorrenze → `var(--btn-primary-fg)`.

### Verified
- Zero violazioni hex/legacy font/`#fff` in `src/views/` e `src/components/`. `vite build` 475kb/96ms. Bottom nav 52px HIG-compliant.

---

## [0.33.1] — 2026-05-19

### Added
- **6 nuove primitive UI** in `components/ui/`: `MoneyValue`, `MonthPager`, `KpiStrip`, `Drawer` (focus trap + ESC), `GroupedList`/`Item`, `PageHeader`.
- **`Card` prop `tone="accent|success|danger|warning"`**: `border-left: 3px solid var(--<tone>)`. `GlassCard` wrapper compat.

### Changed
- **AppHeader slim**: rimosso hero net-worth duplicato; lifted in `DashboardView` via `<PageHeader>`.
- **Sidebar vibrancy macOS**: `color-mix` + `backdrop-filter`.
- **MobileBottomNav HIG**: 52px min-height, font 11px, icon 20px; pill `--accent-soft` su attivo.
- **`app-content` padding** centralizzato in `styles.css` con safe-area bottom.

---

## [0.33.0] — 2026-05-19

### Fixed
- **Progress bar invisibile light theme**: 73 occorrenze `rgba(255,255,255,*)` → token semantici.
- **DM Mono/DM Sans mai caricati**: `styles.css` linkava Google Fonts ma tokens dichiarava IBM Plex Mono. 59 occorrenze inline → `var(--font-mono)`. Rimosso `@import`.
- **Heatmap RGB hardcoded**: `rgba(74,222,128,*)` → `color-mix` su `--success`/`--danger`.

### Changed
- **Token cleanup**: 31 grays + 12 accents + 17 hex pastel → token; bg `#1e2130`/`#0d0f14bb` → `var(--card-inset)`.
- **`.btn` duplicato**: rimossa definizione divergente da `styles.css`, tenuta solo `tokens.css`.
- **Chart palette**: `--chart-1..6` dual-theme.

---

## [0.32.7] — 2026-05-17

### Fixed
- **E2E `loginAsDemo` timeout**: `networkidle` → `waitForSelector('.app-net-worth')`.

### Changed
- **Dead imports**: rimossi `aggiorna_tutti_i_prezzi`, `API`, `BarRow`, export `apiFetch` di `utils/api.js`.
- **`seed_demo_for_user` → `expenses/services.py`** (estratta da views).

---

## [0.32.6] — 2026-05-17

### Fixed
- **ViewAsMixin mancante su AllocationTargetViewSet, FireViewSet**: read-grant poteva POST/PATCH.
- **Auth bypass FireView/SettingsView**: `fetch()` bare → `apiFetch` context.
- **Stale viewAs closure** in `deleteTx`, `submitTransfer`, `submitTransferInCfModal`: aggiunto `apiFetch` deps.

### Changed
- **Prefetch subcategories** in `ExpenseViewSet` (N+1 fix).
- **`FXRateHistory` index** include `owner` (4 campi).

### Tests
- `test_allocation_targets_api.py`, `test_fire_api.py` (nuovo): read-grant write-block.

---

## [0.32.5] — 2026-05-17

### Changed
- **`CategoryViewSet` import cleanup**: `OuterRef`/`Subquery`/`IntegerField` spostati al top.

---

## [0.32.4] — 2026-05-17

### Changed
- **`fetchTrendExpenses/Incomes`**: filtrato a 2 anni (corrente + precedente) parallelo.

### Fixed
- **`TRANSACTION_UPDATED` mancante** in `refreshReasons`: aggiunto + case in switch + ternario.

---

## [0.32.3] — 2026-05-17

### Fixed
- **SQLite `database is locked`**: `timeout: 20` su sqlite3 dev + sqlcipher prod.
- **Frontend `apiFetch` auth bypass**: `AssetCard`, `MonthlyNetWorthTable`, `ExpensesView` usavano helper plain — migrato a context.
- **19 stale closures `viewAs`**: aggiunto `apiFetch` deps su fetch/submit AppContext.

---

## [0.32.2] — 2026-05-17

### Tests
- **ViewAsMixin write-block** (4 test): POST/PATCH/DELETE con grant read → 403.
- **Filtro `account=none`** cashflow feed (3 test).

---

## [0.32.1] — 2026-05-17

### Fixed
- **`generate_recurring_expenses` owner isolation**: aggiunto `user` param, filter scoped, `owner=user` su create. Prima generava per tutti gli utenti con `owner=NULL`.

### Tests
- 3 regressione in `test_recurring_api.py`.

---

## [0.32.0] — 2026-05-16

### Added
- **"Senza conto" filtro account Cash Flow**: sentinella `?account=none` → `linked_asset__isnull=True`.

---

## [0.31.0] — 2026-05-16

### Added
- **Decimal separator toggle** in Settings → Language: `,`/`.` persistito via `PATCH /api/auth/profile/`.

---

## [0.30.0] — 2026-05-16

### Added
- **Filtro account + subcategory Cash Flow**: dropdown bank account; CategorySelect invia `parent_category` o `category` (exact).

---

## [0.29.0] — 2026-05-16

### Added
- **Autocomplete descrizioni (K5.5+K5.6)**: `GET /api/expenses/description-suggestions/?category_id=&q=` (LRU 10/cat, prefix match). Dropdown debounce 280ms; tracking solo su create/edit di `description`/`category`.

### Fixed
- **MonthlyNetWorthTable compare mode**: `formatEur` chiamato senza `useFormatters()` → ReferenceError che bloccava render.

### Tests
- `test_description_suggestions.py`: 8 test.

---

## [0.28.0] — 2026-05-16

### Added
- **Input importi `,`/`.` (K5.4)**: `type="number"` → `type="text"` + `inputMode="decimal"`; `filterAmountInput` + `parseAmount` normalize; placeholder per separatore utente; `error_invalid_amount`.

### Tests
- 24 test in `formatters.test.js`.

---

## [0.27.0] — 2026-05-15

### Added
- **Formatter EUR dinamici (K5.3)**: `localeFromSeparator()` + `makeEurFormatters(locale)`; hook `useFormatters()` legge `decimalSeparator` da context.

### Tests
- 8 test in `formatters.test.js`.

---

## [0.25.0] — 2026-05-15

### Added
- **`UserProfile.decimal_separator` (K5.1+K5.2)**: endpoint `GET/PATCH /api/auth/profile/` cross-device; reset a `,` su logout.

### Fixed
- **E2E suite — 6 pre-esistenti**: login throttle 5→20/min; `openImportSection` selector; CategorySelect via `dispatchEvent('click')`; `page.reload()` post API; Transfer modal click target; lista asset stale.

### Tests
- `profile.test.js` (6), `test_profile_api.py` (2).

---

## [0.24.0] — 2026-05-15

### Added
- **Transfer in Cash Flow form (K4.5)**: 3a opzione tipo (Uscite/Entrate/Trasferimento); rimosso transfer da Accounts.

### Tests
- E2E `transfer-cf.spec.ts`.

---

## [0.23.0] — 2026-05-15

### Added
- **CSV import — CategorySelect (K4.4)**: `category_id` (scoped owner) oltre legacy `category_name`.

### Tests
- 2 backend + E2E `settings-import.spec.ts`.

---

## [0.22.0] — 2026-05-15

### Added
- **Cash Flow filtro categoria (K4.3)**: `CategorySelect` in barra filtri; tipo adattivo a filtro attivo.

### Fixed
- **Reload non triggerato**: aggiunto `cfFilters` a `useEffect` deps.

### Tests
- E2E `cashflow.spec.ts` (5).

---

## [0.21.0] — 2026-05-15

### Added
- **`CategorySelect` component (K4.1+K4.2)**: gerarchico, espansione inline subcategory, props `value`/`onChange`/`categoryType`/`placeholder`/`categories`.

### Tests
- `components.test.jsx` (5).

---

## [0.20.0] — 2026-05-14

### Added
- **Verified badge + delete + filter (K-3)**: badge `✓` read-only; pulsante × su All Transactions con confirm modal; `is_verified` in edit modal expense/transfer; pillole filtro Tutte/✓/○; row click-to-edit.

### Tests
- `TestIsVerifiedFilter`, `TestVerifiedFilter`.

---

## [0.19.0] — 2026-05-14

### Added
- **All Transactions view (K-3)**: feed unificato `cashflow/`; 4 toggle tipo; verify/unverify inline con propagazione atomica transfer; paginazione 50 / load all; click-to-edit per tipo.

### Tests
- 8 frontend in `cashflowFeed.test.js`.

---

## [0.18.0] — 2026-05-13

### Added
- **Cash Flow feed unificato (K-2)**: `GET /api/expenses/cashflow/` aggrega expense/transfer/adjustment; filtri `date_from`/`to`/`category`/`parent_category`/`account`/`types`/`verified`; pagination 50, `page_size=all`.

### Tests
- 22 backend in `test_cashflow_feed.py`.

---

## [0.17.0] — 2026-05-13

### Added
- **K1 Data Foundation**: `Expense.is_verified`, `AssetTransaction.is_verified`, `UserProfile.decimal_separator`, `ExpenseDescriptionSuggestion` (LRU 10/cat); PATCH transfer propaga `is_verified` su entrambe le leg via `derived_from`.

### Tests
- Profile API, suggestion tracking/pruning, propagazione verified.

---

## [0.16.0] — 2026-05-12

### Added
- **Playwright E2E suite**: `workers: 1`; helper auth con cache token demo; 3 spec (year-navigation, compare-mode, data-access-grant).

### Fixed
- **5 IDOR**: `BudgetViewSet.create`, `CategoryViewSet.destroy` (reassign), `create_transaction` source/dest, `refresh-prices` global scope, grants email enumeration.
- **CSV import ViewAs**: `owner=_effective_user` invece di `request.user`.
- **CSP `unsafe-inline`** rimosso da `script-src`.

### Tests
- 14 hardening (`test_security_hardening.py`, `test_grants_security.py`).

---

## [0.15.0] — 2026-05-09

### Added
- **Log rotation startup** (retention 7gg): `finnet/apps.py` rinomina con timestamp; `fcntl` lock multi-worker. `rotate_logs.sh` per gunicorn.

### Fixed
- **Logout involontario refresh concorrenti**: `refreshingRef` in `apiFetch` — singola promise condivisa.
- **Doppio refresh prezzi gunicorn**: `fcntl` exclusive lock su `/tmp/finnet_startup_refresh.lock`.
- **Budget Progress**: rimosso zero-padding `month`; rollup subcategory verso padre; colore barra verde/arancio/rosso.
- **`DashboardSummary` invalidazione**: `user=None` produce warning + skip; ogni callsite forwarda owner.
- **Monthly Net Worth**: localStorage validato; effect dipende da `year`; refresh key su mutazioni; compare mode con summary completo; mesi allineati per range; doppia call al cambio anno (ref locali); frecce limitate ad `available_years`.
- **Wealth Trend**: tick formatter range-aware; `_step_at()` per MANUAL (no interpolazione); valore di partenza 0 pre-prima-tx; `chartHasData` per serie vuote; tooltip nearest-point; metriche mensili solo ≥6M; goal line label localizzata; downsampling 5Y/MAX a fine-mese.
- **PortfolioSnapshot**: breakdown usa `current_value_eur`.
- **`_fx_for_month`**: warning su fallback 1:1.
- **`annualize_return`**: no `decimal.InvalidOperation`; ROI/TWR/Sharpe `—` con <1 anno.
- **Importi decimali**: rimosso `maximumFractionDigits: 0` + `Math.round()` — 40+ usi di `formatEur` corretti.
- **Budget Progress Dashboard**: usa `expSummaryCurrentMonth` dedicato.
- **`search_ticker`**: `except Exception` → `logger.warning`.
- **Icona PWA + favicon** definitivi.

### Tests
- `tokenRefresh.test.js` (4), `test_budget_progress.py` (3), `budgetProgress.test.js` (7), dashboard invalidation (9), formatters, snapshot breakdown, history step function.

---

## [0.14.0] — 2026-05-07

### Added
- **Compare Years (D)**: toggle [single/compare] in `MonthlyNetWorthTable`; dropdown Anno A/B da `available_years`; sub-colonne affiancate; NW Change MoM per anno; persistenza localStorage.

---

## [0.13.0] — 2026-05-07

### Added
- **Budget Progress widget Dashboard (C)**: card categorie budget mese corrente, barre con colore progressivo. Zero nuove API.

---

## [0.12.0] — 2026-05-07

### Added
- **Multi-metric Wealth Trend + Goal Line (B+I)**: toggle Wealth/Balance/Investing/Income/Outcome/Cash Saving; doppio asse Y; goal line tratteggiata configurabile in Settings; navigazione mese×mese ≥6M; touch tooltip; persistenza localStorage.
- **Cash Flow Trend**: nuovo grafico Dashboard separato per Income/Outcome/Cash Saving annuale.

### Changed
- **Wealth Trend**: rimosse metriche mensili dal grafico patrimonio (solo Wealth/Balance/Investing/Goal).

---

## [0.11.0] — 2026-05-07

### Added
- **Monthly Net Worth Table (A)**: `GET /api/portfolio/monthly-overview/?year=YYYY` (FX storica via `FXRateHistory`); summary Balance/NW/NW Change/Income/Outcome/Cash Saving. UI: selettore anno + range (3/6/9/12M), sticky first col, mese corrente highlight.

### Tests
- 6 in `test_monthly_overview_api.py`.

---

## [0.10.0] — 2026-05-07

### Added
- **FX Currency Fixes**: nuovo `FXRateHistory` (tassi giornalieri per utente, Frankfurter/ECB); `PortfolioSnapshot` usa `current_value_eur`; lookback 7gg + fallback live.

### Fixed
- **Summary FX**: `current_value_eur` invece di `current_value` nativo.
- **Navigazione mesi Dashboard**: rimosso `useEffect` reset spurio.

### Tests
- 3 per FX/ROI zero.

---

## [0.9.0] — 2026-05-07

### Added
- **Structured logging `portfolio/views.py`**: ogni action significativa logga param/outcome a DEBUG/INFO/WARNING.

---

## [0.8.0] — 2026-05-06

### Fixed
- **Saldi negativi**: MANUAL `current_value` non clampato a 0.
- **Asset form mobile**: edit riceve oggetto completo; ticker/ISIN nascosti se `!supports_ticker`.
- **Accounts**: Investments scoped per `source_account`; nav Total Income/Outcome modali; refresh asset+summary on tab access.
- **CSV import UX**: `skipped_details` con motivo; guard 2MB; logging DEBUG.
- **Settings**: no auto-expand; subcat pre-fill icon; Data Sharing accordion.
- **PRICE TREND sparkline**: "no data" su history vuota.
- **Cash Flow filters**: fallback anno/mese correnti.
- **Wealth Trend default**: 1Y → 1W.
- **iOS PWA**: `env(safe-area-inset-top)` globale.
- **Performance ROI/TWR**: `—` se `invested_capital < 1€`.

---

## [0.7.0] — 2026-05-04

### Added
- **Live Demo (read-only)**: `POST /api/auth/demo/`; `IsNotDemoUser` blocca mutazioni 403; `create_demo_user` con seed; banner + `DemoModal` + `guardDemo()`; auto-seed al primo login.

### Fixed
- **Demo seed**: spese con `linked_asset`; budget esempio; saldo Checking post-CASH_OUT; investmenti filtrati; reset Budget.
- **404 su summary/monthly/import-csv**: code irraggiungibile post `seed_demo_for_user` return — rispostate come metodi ViewSet.
- **`DemoLoginView`**: `select_for_update` + throttle.
- **Label "Link to account"** i18n EN/IT.

---

## [0.6.0]

### Added
- **Account Types separati**: Settings tab dedicato per `is_bank_account=true`; modal context-aware.

### Fixed
- **API base URL** `${hostname}:8000/api` → `/api` (relativo).
- **`STATIC_ROOT`** per `collectstatic` prod.
- **`django-sqlcipher3`** commentato (lib sistema mancante).
- **`aggiorna_prezzo_singolo`**: fallback `history(period="5d")`.
- **Guard `isAuthenticated`** su `useEffect` fetch (evita loop 401 pre-login).

---

## [0.5.0] — 2026-05-03

### Fixed
- **Doppio `perform_create` `AssetViewSet`**: asset salvati `owner=NULL`. Fusi con `owner=self.get_effective_user()` + backfill ticker.
- **`fetch()` senza Authorization**: SettingsView/FireView/BankAccountsView → `apiFetch`; export `apiFetch` nel context.
- **`fetchExpSummary` viewMode-conditioned**: ora sempre `month`+`year`.
- **Delete categoria hint**: messaggio fino a selezione radio.
- **6 IDOR**: `InvestmentType`/`AllocationTarget`/`FireViewSet`/`CategoryViewSet` destroy/create senza owner.
- **JWT blacklist**: abilitato `token_blacklist` + `BLACKLIST_AFTER_ROTATION`.
- **`StrongPasswordValidator`**: rimosso max 30; check frontend localizzato.
- **`DashboardSummary` race**: `UniqueConstraint(owner)`.
- **Demo seed wipe**: filtro per `owner=user`.
- **`AssetTransaction` ADJUSTMENT**: owner corretto.
- **`rebuild_manual_history`**: no clamp a 0 (saldi negativi).
- **`monthly` year hardcoded** → `date.today().year`.
- **`AssetViewSet.reset`**: scoped owner.
- **Import CSV categorie**: scoped owner.
- **Grant email enumerate**: 404 → 400.
- **`portfolio/prices.py`**: esclusi asset `owner=None`.
- **`fire.py`**: `calculate_fire_projection` continua a crescere NW post-FIRE.
- **`FireViewSet.annual_expenses`**: annualizzato per mesi presenti × 12.

### Tests
- 4 regressione (reset/manual balance/import/monthly).

---

## [0.4.0] — 2026-05-03

### Added
- **SQLCipher (5)**: `django_sqlcipher` se `DB_ENCRYPTION_KEY`; SQLite standard dev; `ImproperlyConfigured` prod senza key. `encrypt_db.py` per migrazione.
- **HTTPS (6)**: Vite auto-detect certs; `start.sh` gunicorn TLS con `certs/localhost*.pem`.
- **Caddyfile**: reverse proxy + TLS Let's Encrypt.

---

## [0.3.0] — 2026-05-03

### Added
- **Data Sharing (ViewAs)**: `DataAccessGrant` (read/write/full + `UniqueConstraint(owner, grantee)`); API `auth/grants/`; `ViewAsMiddleware` + `ViewAsMixin` + `_effective_user()`. UI: switcher header con badge, sezione Sharing in Settings.

---

## [0.2.0] — 2026-05-03

### Added
- **Password strength**: min 10/max 30, upper/digit/special; 5 validator; `password2` su register.
- **Rate limiting**: login 5/min, register 3/min.
- **Security headers middleware**: CSP, X-Frame-Options DENY, X-Content-Type-Options, Referrer-Policy; `/admin/` solo `DEBUG=True`.
- **`backup.sh`**: AES-256-CBC; `chmod 600 db.sqlite3` su startup.
- **19 test data segregation**.

### Fixed
- **`CategoryViewSet.destroy()`** senza owner — cross-user delete.
- **`register()`**: mostra errori backend invece di generico.

---

## [0.1.0] — 2026-05-02

### Added
- **JWT auth**: `simplejwt` (`/auth/token/`, `/refresh/`, `/register/`); FK `owner` su tutti i model; filter `get_queryset()` + `perform_create()`; auto-refresh in `apiFetch`; CORS Vite dev.
- **LoginView** con tab login/register.

### Fixed
- **Data leakage endpoint aggregati**: `history`/`performance`/`fire`/`monthly`/`reset`/`import-csv` ora scoped owner.

---

## [0.0.5] — 2026-04-29 / 2026-05-01

### Changed (breaking)
- **Asset model rewrite**: `tracking_type` (AUTO/MANUAL), `invested_capital`, `current_value` via `recompute_from_transactions()`. Nuovi tx type `CASH_IN`/`CASH_OUT`/`ADJUSTMENT` (MANUAL), `BUY`/`SELL` (AUTO). `derived_from` self-FK per mirror tx. Bank account separati (`is_bank_account`). Validazione SELL no oversell.

### Added
- `InvestmentType.tax_rate`; `Expense.linked_asset` per integrazione Cash Flow ↔ Portfolio; transfer endpoint con insufficient-balance warning; `adjust-balance` MANUAL; click-to-edit globale; category edit; `AssetPriceHistory` rebuild MANUAL; DB indexes; snapshot breakdown asset class/asset; multi-currency (`fx.py` Frankfurter + cache 24h, `current_value_eur`); `services.py` business logic estratta; analytics (TWR/IRR/Sharpe/max drawdown/underwater); FIRE planning (number/Coast/proiezioni/sensitività); dashboard cache materializzata; iOS/PWA mobile; confirm delete asset/account.
