# Code Review — Fininzen (v2)

> Data: **2026-06-13** (v1: 2026-06-06)
> Branch: `code-review` **rebasato su `main`** (HEAD `cb05b76` = main `12ba561` + fix Critical + questo report).
> Scope: re-verifica dei 98 finding v1 contro il codice attuale + audit delle superfici introdotte dai 56 commit di `main` (iOS redesign, WebAuthn/passkey, demo account, dashboard deep-dive, archiviazione asset, migrazioni 0036-0039).
> Metodologia: rebase con riconciliazione manuale dei fix Critical, poi verifica file-per-file con tassonomia di stato. Test suite eseguita su entrambi i branch per attribuire i fallimenti.

## ⚠️ Re-audit v3 — 2026-06-27 (verifica sulla codebase attuale)

> Questa sezione è il risultato di una **ri-verifica leggendo il codice attuale** (non
> fidandosi delle conferme nel testo v2). Da v2 (2026-06-13/15) la codebase è cambiata
> molto: migrazione JS→TypeScript del frontend Vite, **riscrittura Next.js in `web/` con
> cutover in produzione** (PR #20, TanStack Query al posto di `AppContext.jsx`), versioning
> unificato (PR #22), refactor delle view in package, fix CodeQL stack-trace (PR #24) e
> override Dependabot (PR #23). Il file **resta in vita** (decisione utente): le sole fix di
> sicurezza sono applicate; i residui "by-design"/qualità restano da decidere prima di
> chiudere il documento.

### Backend — confermato risolto nel codice
CRIT-01…08, HIGH-02/03/04/05/13/17, MED-01/15, LOW-02, NEW-MED-03/04, throttles, WebAuthn
(`is_active` + throttle + `IsNotDemoUser`), JWT cookie httpOnly + CSRF double-submit,
`fininzen/api_errors.py` (anti stack-trace), deps Dependabot (cryptography 48.0.1, PyYAML
6.0.3, override postcss/js-yaml/undici). Verificati per file/riga sul codice rebasato.

### Frontend — cluster "moot" per migrazione, postura riportata in `web/`
La produzione è `web/` (Next.js). I finding scritti su `frontend/AppContext.jsx`/`vite.config.js`
non si applicano più a quel codice; la postura è stata **verificata in `web/`**:
HIGH-21 (token in memoria + refresh cookie httpOnly + CSRF, `web/src/utils/api.ts`) ✅,
CRIT-04/HIGH-25/26 (parser monetario string-based, `web/src/utils/formatters.ts`) ✅,
HIGH-24/27 (parse localStorage con normalizer) ✅, HIGH-31 ErrorBoundary ✅,
NEW-LOW-04 focus-trap BottomSheet ✅, HIGH-22 sourcemap (Next default off) ✅,
HIGH-30 God-context → TanStack Query (moot) ✅. `frontend/` resta come legacy
(buildato/testato dal justfile ma non in produzione → candidato a rimozione).

### 🔴 Finding di sicurezza REALMENTE aperti trovati nel re-audit — ora corretti
- **HIGH-23 (regressione migrazione) — CSP assente sulla SPA di produzione.** La CSP
  v2 era iniettata da un plugin Vite `<meta>` che non esiste più; né `web/next.config.ts`,
  né il `Caddyfile`, né Django (copre solo `/api/*`) mettevano una `Content-Security-Policy`
  sull'HTML servito da Next.js. **Fix**: `web/src/middleware.ts` — CSP **nonce-based**
  (`script-src 'self' 'nonce-…' 'strict-dynamic'`, `object-src 'none'`, `base-uri/form-action
  'self'`, `frame-ancestors 'none'`; `'unsafe-eval'/'unsafe-inline'` solo in dev per l'HMR) +
  `web/src/app/layout.tsx` legge `headers()` per forzare il rendering dinamico così Next
  applica il nonce ai suoi script. Verificato a runtime: header CSP presente e **tutti** i 16
  `<script>` portano il nonce coerente (0 script senza nonce).
- **CodeQL residuo — leak di eccezione provider.** `portfolio/prices.py:468/495`
  costruiscono `f"yfinance: {exc}"` / `f"Borsa Italiana: {exc}"` che arrivava al client via
  `portfolio/views/asset_mixins/analytics.py:352` **senza** `safe_client_message` (la PR #24
  aveva sanificato solo il ramo `except`). **Fix**: il messaggio di backfill è ora scrubbato
  con `safe_client_message` al confine HTTP (il dettaglio resta nei log e nel comando CLI).

### 🟡 Residui non-sicurezza / by-design — DA DECIDERE prima di eliminare questo file
Sotto il criterio "solo fix in codice" questi bloccano la cancellazione, ma forzarli sarebbe
in parte una regressione di prodotto: **HIGH-01** (messaggio esplicito su register, già
throttled), **MED-06** (CORS≠CSRF in dev), **MED-07** (semantica FX), **MED-08** (migration
backfill 0029), **LOW-07** (`amount__gt=0` = constraint volontario), **LOW-11** (paginazione
globale = regressione frontend), e debito di qualità **MED-16/17/21/23/33**, **LOW-16**,
**NEW-LOW-02** (duplicazione `_recompute_and_rebuild_asset`). Decidere caso per caso se
implementare o accettare; alla chiusura di tutti, il file può essere eliminato.

---

## Legenda stato

- ✅ **Risolto** — corretto nel codice attuale (fix Critical di `fa452c8`/`cb05b76` o commit indipendente di `main`).
- ⚠️ **Ancora valido** — invariato; il finding regge.
- 🔀 **Parziale** — mitigato ma non chiuso, o l'impatto è cambiato.
- ❌ **Non applicabile / ricalibrato** — codice rimosso, o impatto v1 sovrastimato.

## Sintesi numerica

### Finding v1 — stato dopo la verifica

| Severità | v1 | ✅ Risolto | 🔀 Parziale | ⚠️ Valido | ❌ Ricalibrato |
| -------- | -- | --------- | ---------- | -------- | ------------- |
| Critical | 8  | 8 | 0 | 0 | 0 |
| High     | 35 | 11 | 6 | 17 | 1 |
| Medium   | 37 | 1 | 3 | 33 | 0 |
| Low      | 18 | 0 | 1 | 17 | 0 |

> **Aggiornamento sessione fix (2026-06-13)**: chiusi i 2 Critical parziali (CRIT-04, CRIT-07) e tutti i NEW finding tranne quelli infra (CI/CD). I 5 test rossi sono ora verdi.
> **Sessione High (2026-06-13)**: chiusi 8 finding High come ✅ (HIGH-04 throttle account, HIGH-09 race già coperta da constraint, HIGH-16 già annotato, HIGH-18 N+1 `source_account`, HIGH-22 sourcemap off, HIGH-25 `saveAdjustBalance`, HIGH-28 AbortController feed, HIGH-31 ErrorBoundary) + HIGH-20 → 🔀 (doc `REDIS_URL`). NEW-LOW-05 → ✅ (doc env già presente). Suite verde. Restano i refactor strutturali (HIGH-14/21/30) e l'infra (HIGH-32/33/34/35).
> **Sessione High batch 2 (2026-06-14)**: chiusi i restanti High non-strutturali. ✅ HIGH-02 (`GrantRateThrottle` era `AnonRateThrottle` = no-op su endpoint autenticato → `UserRateThrottle`, +test), HIGH-03 (rimosso `style-src 'unsafe-inline'`; carve-out solo admin dev), HIGH-05 (flag `eur_complete` API+UI), HIGH-06 (price update àncora subito il punto history), HIGH-11 (`_q2` ROUND_HALF_UP nel feed), HIGH-13 (bare except loggati/ristretti), HIGH-15 (verificato: no N+1), HIGH-17 (TTL reconcile + cache-clear in conftest), HIGH-19 (verificato: import bulk), HIGH-23 (CSP `<meta>` SPA via plugin Vite build-only + `modulePreload.polyfill=false`), HIGH-24 (verificato: normalizer su tutti i parse localStorage), HIGH-27 (year bound `2000..+1`), HIGH-29 (guard selection-signature anteprima bulk), HIGH-32 (GitHub Actions CI), HIGH-33 (`.pre-commit-config.yaml` + `just hooks`), HIGH-35 (Sentry opt-in backend + hook ErrorBoundary). 🔀 HIGH-01 (enumeration register: già throttled `RegisterRateThrottle`; messaggio esplicito tenuto per UX, anti-enum completo = scelta di prodotto/email-verification), HIGH-34 (Caddy `rate_limit` documentato — richiede modulo community — + `deploy/fail2ban/README.md`). **Restano aperti i 3 refactor strutturali** HIGH-14 (split `portfolio/views.py`), HIGH-21 (token JWT in `localStorage`→cookie httpOnly), HIGH-30 (split `AppContext.jsx`): grossi e a rischio regressione, raccomandati come PR dedicate. Suite backend **544** + frontend **224** verdi. **Stato High corrente (post-batch-2): 25 ✅ · 6 🔀 · 3 ⚠️ · 1 ❌** — gli unici High ancora ⚠️ sono i 3 refactor strutturali.
> **Sessione pragmatic Medium/Low (2026-06-14)**: chiuso il batch concordato senza affrontare i refactor strutturali né HIGH-21. ✅ MED-01/02/03/04/05/09/10/12/13/18/19/20/26/27/31/35/37, LOW-01/13/18, NEW-LOW-04. 🔀 MED-34/36 restano parzialmente operativi/documentali. Aggiunti `ResetRateThrottle`, hard cap ZIP export, `filename*`, helper condivisi `fininzen/utils.py`, focus-trap BottomSheet, logger frontend dev-only, `formatDate` locale-aware, theme cross-tab sync, smoke auth guard, coverage gate full-suite (`--cov-fail-under=75`) e checklist `wiki/OPS_HARDENING.md`. Verifica: backend **548 passed**, coverage **84.91%**; frontend **228 passed**; build/lint/format verdi.
> **Sessione refactor strutturali (2026-06-15)**: affrontati i 3 High rimasti `⚠️`. ✅ **HIGH-14** (split `portfolio/views.py` + `expenses/views.py` in package `views/` + estrazione `expenses/import_csv.py`), ✅ **HIGH-21** (refresh token → cookie httpOnly + access in memoria + CSRF double-submit + endpoint logout). 🔀 **HIGH-30** (decomposizione `AppContext.jsx` avviata: estratti helpers puri, form builders e il hook `useThemeLang`; lo strato dati accoppiato resta nel provider per evitare regressioni con copertura test parziale). Branch `feat/high-structural-refactors`, un commit per finding. **Stato High: 27 ✅ · 7 🔀 · 0 ⚠️ · 1 ❌**. Verifica: backend **559 passed**, coverage **86%**; frontend **227 passed**; `ruff check`/`format`, `prettier`, `vite build` verdi.
> **Sessione Medium/Low batch (2026-06-15, post-merge)**: verificati i finding ancora `⚠️` contro il codice attuale (molti già risolti o scelte deliberate) e chiusi quelli realmente aperti e a basso rischio, tests-first. ✅ **MED-11** (atomicità expense↔shadow), ✅ **MED-15** (detect `database table is locked`), ✅ **MED-29** (`parseCSV` quote-aware), ✅ **LOW-02** (HealthView 503). ✅ VERIFICATO senza modifiche: MED-14, MED-22, MED-24, MED-25, MED-32 (contrasto supera AA), LOW-03, LOW-06, LOW-09. **Flag (decisione utente, non toccati)**: MED-06 (CORS/CSRF dev), MED-07 (semantica FX), MED-08 (backfill migration 0029), LOW-07 (`amount__gt=0` = constraint volontario), LOW-11 (paginazione globale = regressione frontend). **Rinviati a pass dedicata**: MED-33 (empty/loading chart, design), LOW-16 (`React.memo`, micro-opt). Branch `feat/code-review-med-low-batch`, 2 commit. Verifica: backend **563 passed**, coverage **85.86%**; frontend **230 passed**; lint/format/build verdi.

### Nuovi finding (codice post-redesign)

| Severità | # | Dominio principale | Stato fix |
| -------- | - | ------------------ | --------- |
| High     | 2 | Auth/WebAuthn, DevOps (test suite rossa) | NEW-HIGH-01 ✅ · NEW-HIGH-02 🔀 (test verdi, CI aperta) |
| Medium   | 4 | Auth/WebAuthn, correttezza (opening balance, bulk empty selection), frontend (export) | NEW-MED-01/02/03/04/05 ✅ |
| Low      | 5 | Auth/demo, qualità, a11y, repo hygiene | NEW-LOW-01 ✅ · NEW-LOW-03 ✅ · NEW-LOW-04 ✅ · NEW-LOW-05 ✅ · NEW-LOW-02 ⚠️ aperto |

## Executive Summary (aggiornato)

Il rebase ha riportato sul branch i **fix degli 8 Critical** scritti in `fa452c8`, riconciliandoli con l'evoluzione di `main` (conflitti su `signals.py`, `cashflow.py`, `models.py` risolti manualmente). Punti salienti:

1. **Atomicità scritture finanziarie (CRIT-01/02)**: `main` ha già introdotto `portfolio/services.py:157 _recompute_asset_locked` (`transaction.atomic` + `select_for_update`) e un nuovo `portfolio/signals.py` con contratto `skip_recompute`. La riconciliazione fa usare il recompute *locked* anche al path Expense (`expenses/signals.py`). **Risolto.**
2. **Precisione decimale backend/frontend (CRIT-04/05)**: helper `_q2` (ROUND_HALF_UP) applicato uniformemente in `models.py`/`prices.py`/`cashflow.py`; frontend con parser string-based, cap `1e12`, edge case MED-26 corretto e `parseMoneyToString` cablato ai body monetari. **Risolto.**
3. **Performance feed/history (CRIT-06/07)**: cap history a 5 anni + filtro `date__lte`; `count()` cappato a 10k e saltato quando non si pagina. **Risolto.**
4. **Backup off-site (CRIT-08)**: aggiunto `scripts/backup_offsite.sh` (rsync/rclone + alert). **Risolto** (resta da schedularlo in cron su prod).
5. **Nuova superficie auth (WebAuthn/passkey)**: challenge server-side monouso, `expected_rp_id`/`origin`, `require_user_verification`, sign-count, no enumeration, throttle dedicato sugli endpoint `AllowAny`, blocco utenti inattivi e demo sandbox ripristinato sulle operazioni mutanti. **Risolto nei finding NEW-HIGH/NEW-MED/NEW-LOW correlati.**
6. **Test suite / CI**: i 5 test rossi originari sono stati chiusi; CI GitHub Actions, pre-commit, build frontend e coverage gate full-suite sono ora presenti. Restano solo azioni operative di deploy dove indicate.

### Verifica del rebase / test

- `git diff main code-review --stat` → solo i 12 file di `cb05b76` (report + fix). Nessun marker di conflitto residuo; `py_compile` OK.
- Stato corrente post-sessione pragmatic (2026-06-14): backend **548 passed**, coverage **84.91%** con gate `--cov-fail-under=75`; frontend **228 passed**; `vite build`, `ruff check`, `ruff format --check`, `prettier --check` verdi.

---

## Critical — stato

### CRIT-01 ✅ — `recompute_from_transactions` atomico + row lock
`portfolio/services.py:157` (`_recompute_asset_locked`, `transaction.atomic` + `select_for_update`). Usato da `portfolio/signals.py:48`, dai bulk (`_refresh_manual_asset_strict`) e ora anche dal path Expense (`expenses/signals.py:18` `_recompute_and_rebuild_asset`). **Nota qualità**: questo helper in `expenses/signals.py` duplica `services._refresh_manual_asset` → vedi NEW-LOW-02.

### CRIT-02 ✅ — Signal `sync_expense_to_asset` atomico su cambio `linked_asset`
`expenses/signals.py:106` dentro `transaction.atomic`; recompute via helper *locked* con `try/except logger.exception`; `_cleanup_old_shadow_tx` esce presto se `affected_ids` vuoto. Il gating `skip_recompute` (main) differisce il recompute in modalità bulk.

### CRIT-03 ✅ — Cache FX thread-safe
`portfolio/fx.py:24` `_RATE_CACHE_LOCK = threading.Lock()`; read/write protette (`:53`, `:67`). Resta la nota v1: con `LocMemCache`/pre-fork ogni worker ha cache propria (accettabile; per dedup richieste → Redis).

### CRIT-04 ✅ — `parseFloat` sugli importi (frontend)
`frontend/src/utils/formatters.js`: parser riscritto su `_normalizeDecimalString` (`:95`), cap `MONEY_MAX_MAGNITUDE = 1e12` (`:89`), edge case MED-26 corretto, e nuovo `parseMoneyToString` (string decimale per il body).
- **Fix**: `parseMoneyToString` ora cablato su **tutti i 7 body monetari** di `AppContext.jsx`: ricorrente (`amount`), transazione panel + modale (`shares`/`price_per_share`), spesa (`amount`), edit transfer CF (`price_per_share`), transfer standalone + in modale CF (`amount`). `parseAmount`/`parseFlexibleDecimal` restano solo per la **validazione** (isNaN/≤0) e il display; il valore inviato al backend è la stringa decimale canonica (nessun round-trip via `Number`). Suite frontend 224/224, prettier OK.

### CRIT-05 ✅ — `quantize` consistente
Helper `_q2 = quantize(0.01, ROUND_HALF_UP)` in `portfolio/models.py:21`, applicato a `opening_balance/invested_capital/current_value/*_eur` (`:301-356`); `portfolio/prices.py` allinea `ROUND_HALF_UP` (`:73`, `:176`).

### CRIT-06 ✅ — Endpoint history con cap e filtro data
`portfolio/views.py:943` `max_days = 366 * 5`; prefetch `AssetPriceHistory` con `date__lte=end_date` (`:988`).

### CRIT-07 ✅ — `get_cashflow_feed`: count cappato + offset bounded + prefetch verificato
`expenses/cashflow.py:25` `_MAX_COUNT_CAP = 10_000`; `_bounded` (`:284`) conta solo `cap+1` pk **e solo quando si pagina** (riconciliazione del fix branch con lo skip-quando-`limit=None` di `d2fa587`).
- **Fix (offset abuse)**: `fetch_limit` ora clampato a `min(offset+limit, _MAX_COUNT_CAP + limit)`. Senza il clamp un `?page=99999999` calcolava un `fetch_limit` enorme e ogni branch faceva `qs[:fetch_limit]` → materializzava **l'intero feed** in dict per restituire una pagina vuota (DoS da offset illimitato). Test `test_absurd_page_returns_empty_without_error`.
- **Prefetch subcategorie**: già coperto — la feed usa `select_related("category", "category__parent", "linked_asset")` + `.only(...)` con `category__parent_id`, e i filtri per parent usano `category__parent_id__in=...` in query (nessun N+1, nessuna query per-riga sulle subcategorie). Verificato.
- **Pagination_class**: `CashFlowFeedView` è una `APIView` che aggrega 2 modelli (Expense + AssetTransaction) in una lista unita: non c'è un singolo queryset su cui montare un paginator DRF. La paginazione manuale è già esplicita e bounded (`page_size` cap 200, `page_size=all` rifiutato, count cap 10k, offset clampato). La `DEFAULT_PAGINATION_CLASS` globale per i ModelViewSet resta tracciata in **LOW-11** (cambierebbe la shape delle risposte → da valutare lato frontend).

### CRIT-08 ✅ — Backup off-site
`scripts/backup_offsite.sh` (rsync/rclone, `--delete-after`, alert email on-failure). *Azione operativa*: aggiungere la riga cron post-backup su prod e un restore-test periodico.

---

## High — stato (sintesi)

### Backend Security
- **HIGH-01 🔀** Email enumeration su register — `fininzen/views.py:53` ("A user with this email already exists.").
  - **Stato**: l'endpoint è già rate-limited (`RegisterRateThrottle`, 10/min/IP, AnonRateThrottle — funziona perché register è `AllowAny`). Il messaggio esplicito è tenuto per UX; con il throttle l'enumerazione automatica è impraticabile (OWASP accetta messaggi espliciti con rate-limit). L'anti-enumeration completo (success-200 + verifica email) è una scelta di prodotto che richiede infrastruttura email → fuori scope di un fix di sicurezza.
- **HIGH-02 ✅ FATTO** Email enumeration su DataAccessGrant — `fininzen/views.py:190` (`user_not_found`).
  - **Fix**: `GrantRateThrottle` estendeva `AnonRateThrottle`, che ritorna `None` (nessun throttle) per le richieste autenticate — ma gli endpoint grant richiedono autenticazione, quindi l'enumerazione via `POST /grants/` era di fatto **illimitata**. Cambiato in `UserRateThrottle` (keyed by user pk, scope `grant` = 20/min): ora un account non può sondare gli email registrati oltre il limite. Test `test_grants_email_enumeration_is_rate_limited` (21ª richiesta → 429).
- **HIGH-03 ✅ FATTO** CSP `style-src 'unsafe-inline'` — `fininzen/middleware.py`.
  - **Fix**: rimosso `'unsafe-inline'` da `style-src` nella policy strict (`_STRICT_CSP`), aggiunti `base-uri 'self'`/`object-src 'none'`. In prod il middleware tocca solo risposte `/api/*` JSON (l'admin è montato solo sotto `DEBUG`, mai in prod, e non è proxied da Caddi) → nessun impatto reale; il carve-out `_ADMIN_CSP` tiene `'unsafe-inline'` solo sui path `/admin/` per non rompere l'admin in dev. La CSP sulla SPA è separata (HIGH-23).
- **HIGH-04 ✅ FATTO** `AccountView.delete` (`fininzen/views.py:412`) senza throttle scope né conferma asincrona.
  - **Fix**: aggiunto `throttle_scope = "account"` a `AccountView` **e** `ChangePasswordView` (entrambe verificano la password corrente → superficie di brute-force). Il `ScopedRateThrottle` globale ora le limita a `10/minute` (scope `account` keyed by user pk). Test `test_account_endpoints_define_throttle_scope` (parametrizzato) + comportamentale `test_change_password_is_rate_limited` (11ª richiesta → 429, `cache.clear()` in `finally` per non inquinare gli altri test). La "conferma asincrona" (soft-delete + grace period) resta una scelta di prodotto, non un fix di sicurezza → fuori scope.

### Backend Correttezza finanziaria
- **HIGH-05 ✅ FATTO** `invested_capital_eur=None` se manca storico FX — `portfolio/models.py` (`eur_complete`). Nessun flag visivo in API/UI.
  - **Fix**: nuovo campo serializer `eur_complete` (`AssetSerializer.get_eur_complete`): `True` per asset in EUR (nessuna conversione), altrimenti `current_value_eur is not None and invested_capital_eur is not None`. Lato UI (`AssetCard.jsx`) quando `eur_complete === false` il valore è prefissato `~`, colorato `var(--warning)` e con `title` i18n (`eur_incomplete` EN/IT) — non legge più come un importo € esatto quando in realtà è il valore in valuta nativa per FX storico incompleto.
- **HIGH-06 ✅ FATTO** `last_price_update` aggiornato anche se il backfill history fallisce — `portfolio/prices.py`.
  - **Fix**: nel path yfinance, dopo `asset.save()` si fa subito l'upsert del prezzo odierno in `AssetPriceHistory` (come già faceva il path Borsa con `quote.as_of`). Così la freschezza di `last_price_update` è sempre coperta da un punto chart corrispondente, anche se il backfill bootstrap (best-effort) fallisce. Guardia bootstrap aggiornata a `count() <= 1` (perché ora c'è sempre almeno il punto odierno).
- **HIGH-07 🔀** Double-refresh su bulk — mitigato: `skip_recompute` thread-local (`portfolio/signals.py:20`, `expenses/signals.py:104,128`) differisce a un solo `_refresh_assets_strict`. Il signal non è disconnesso ma il recompute per-item è saltato. (main `d2fa587`)
- **HIGH-08 ❌** `MinValueValidator` su asset bancari negativi — **ricalibrato**: `MinValueValidator` è un validator Python che **non gira su `.save()`** (solo su `full_clean`), e il recompute salva diretto. L'overdraft funziona; l'impatto "save fallisce con IntegrityError" è errato. Resta solo come incoerenza semantica se un serializer chiama `full_clean` → MED al più.
- **HIGH-09 ✅ FATTO** Race su `_create_occurrence_if_missing` (recurring) — `expenses/services.py`.
  - **Fix/verifica**: la race è **già gestita atomicamente** dal DB. Esiste `UniqueConstraint(owner, recurring_source, recurring_occurrence_date)` (`expenses/models.py:145`, con `condition` su not-null) e la funzione fa `get_or_create(...)` + `except IntegrityError: return False`. `select_for_update` **non è applicabile**: non c'è una riga preesistente da lockare (la corsa è insert-vs-insert), e il constraint+IntegrityError è il pattern Django corretto per questo caso. Due generatori concorrenti non possono creare occorrenze duplicate. Nessuna modifica necessaria.
- **HIGH-10 🔀** `recompute` O(T) per ogni save — mitigato dal `skip_recompute` in batch; per il singolo save resta O(T).
- **HIGH-11 ✅ FATTO** Transfer amount nel feed senza quantize intermedio — `expenses/cashflow.py` (`_transfer_to_item`).
  - **Fix**: helper `_q2` (ROUND_HALF_UP) in `cashflow.py`, applicato a transfer/adjustment amount e ai totali summary, allineando l'arrotondamento dei centesimi mostrati nel feed alla convenzione del recompute aggregato (`portfolio.models._q2`) invece del default `ROUND_HALF_EVEN`. Copre anche MED-10.
- **HIGH-12 ✅** `runway_years` — `portfolio/fire.py:32` guardia `if annual_expenses > 0 else None`; `_q` con `try/except InvalidOperation` (`:8-9`). (fix indipendente main)

### Backend Qualità / Performance
- **HIGH-13 ✅ FATTO** `bare except Exception` diffusi — `fininzen/views.py:73`, `fininzen/accounting.py:38`, `portfolio/services.py:186,232`, `portfolio/price_providers.py:224`, `expenses/bulk.py:783`.
  - **Fix**: i due site senza diagnostica sono ora coperti — `accounting.py` ristretto a `(ObjectDoesNotExist, AttributeError)` (solo il caso profilo-mancante raggiunge il fallback), e `price_providers.py:224` (`except Exception: pass`) ora logga `logger.debug`. Gli altri (`services.py`, `views.py`, `bulk.py`) avevano già `logger.exception`. Nessun `except Exception` nudo e silenzioso residuo nei file citati.
- **HIGH-14 ✅ FATTO** Fat view — `portfolio/views.py` (3288 LOC) e `expenses/views.py` (1093 LOC) erano God-file; import CSV inline.
  - **Fix (refactor strutturale, 2026-06-15)**: entrambe convertite in package `views/` con `__init__.py` che ri-esporta ogni simbolo pubblico (urls.py e test invariati). `portfolio/views/`: `_common` (helper FX/prezzo/import + costanti), `catalog`, `allocation`, `transactions_feed`, `fire`, `assets` (AssetViewSet composto da `asset_mixins/` imports/transactions/analytics/lifecycle). I nomi monkeypatchati dai test (`reconcile_due_manual_assets`, `search_price_sources`, `logger`) restano attributi del package e i call-site che si sono spostati li raggiungono via `from portfolio import views as _pv`. `expenses/views/`: `helpers`, `category`, `expense`, `budget`, `recurring`, `cashflow_views`; il corpo di `import_csv` (~320 righe) estratto in `expenses/import_csv.py:run_csv_import(rows, user, request_user)` (engine senza framework; la view è un wrapper sottile). File più grande ora ~939 LOC vs 3288. **Verifica**: backend 553 passed, ruff + format puliti.
- **HIGH-15 ✅ FATTO** N+1 `CategorySerializer` — `expenses/views.py`.
  - **Verifica**: nessun N+1. `CategoryViewSet.get_queryset` prefetcha le subcategorie con `expense_count` annotato (`Prefetch("subcategories", queryset=subcats_qs.annotate(...))`), e `get_subcategory_expense_count` somma le annotazioni già caricate (nessuna subquery correlata per riga). Nessuna modifica necessaria.
- **HIGH-16 ✅ FATTO** `ContributionSourceSerializer` fallback `.count()` per istanza — `portfolio/serializers.py`.
  - **Fix/verifica**: il `ContributionSourceViewSet.get_queryset` (`portfolio/views.py:228`) **già annota** `transaction_count=Count("transactions", distinct=True)` e `asset_count=Count("asset_links", distinct=True)`. Il `getattr(obj, "transaction_count", None)` nel serializer usa l'annotazione quando presente; il fallback `obj.transactions.count()` è solo rete difensiva per usi del serializer fuori dal viewset (es. dopo un `create`, su singola istanza), dove l'N+1 non si verifica. Nessun N+1 nel path list. Nessuna modifica necessaria.
- **HIGH-17 ✅ FATTO** `reconcile_due_manual_assets` su ogni GET — `_reconcile_due_manual_assets_safe` (`portfolio/views.py`).
  - **Fix**: aggiunto un guard TTL per-utente via `cache` (`_RECONCILE_TTL_SECONDS = 90`): se il reconcile è già girato nella finestra, si salta. Un mount dashboard che spara più read (list/summary/fire) ora innesca un solo reconcile invece di uno per endpoint; i movimenti manuali diventano effettivi su confine di data, quindi 90s di staleness è trascurabile. Non si arma il TTL su skip transiente (lock SQLite) → retry alla prossima read. Aggiunta fixture autouse `_clear_cache` in `conftest.py` per isolare il guard tra i test.
- **HIGH-18 ✅ FATTO** `AssetViewSet.get_queryset` list con N+1 sui FK del serializer — `portfolio/views.py:333`.
  - **Fix**: il riferimento v1 (`category__parent` su `expenses/views.py`) era errato — `Asset` non ha `category`. L'N+1 reale è in `AssetSerializer.get_source_account_name` che dereferenzia `obj.source_account.name` per ogni riga, mentre il queryset faceva solo `select_related("investment_type")`. Aggiunto `source_account` al `select_related`. (I method-field `custom_contribution_source_ids`/`available_contribution_sources` restano query per-asset ma il volume per utente è basso — ottimizzazione più profonda tracciabile a parte.)
- **HIGH-19 ✅ FATTO** CSV import per-riga — `expenses/views.py`.
  - **Verifica**: `import_csv` è interamente bulk — pre-carica categorie/account in dict (`categories_by_id/name`, `accounts_by_id/name`), il loop fa solo lookup in-memory, poi `bulk_create` per spese e shadow-tx e un refresh per asset-affetto (necessariamente per-asset, non per-riga). I lookup `:159,176` citati in v1 sono nel `destroy` categoria (operazione one-shot, non un loop di righe). Nessuna modifica necessaria.
- **HIGH-20 🔀 PARZIALE** Throttling per-process senza Redis — `fininzen/settings.py` (`LocMemCache` + `ScopedRateThrottle`).
  - **Fix**: il supporto codice c'era già (`settings.py:218` switcha a `RedisCache` se `REDIS_URL` è settato), mancava solo la documentazione operativa. Aggiunto `REDIS_URL` (commentato, con spiegazione del moltiplicatore N×workers) a `.env.example`. **Resta operativo**: provisioning Redis + `pip install redis` sul prod restano azioni di deploy.

### Frontend
- **HIGH-21 ✅ FATTO** Token in `localStorage` — `frontend/src/utils/api.js:7` (`access_token`).
  - **Fix (2026-06-15)**: refresh token spostato in un cookie **httpOnly** (`fn_refresh`, `SameSite=Lax`, path `/api/auth/`, `Secure` in prod); access token tenuto **solo in memoria** (`api.js` module var, mai in localStorage). Backend `fininzen/jwt_cookies.py` + viste: login/demo/WebAuthn-verify restituiscono solo `access` nel body e settano il cookie; `CookieTokenRefreshView` legge il refresh dal cookie (mai dal body), valida un **CSRF double-submit** (cookie `fn_csrf` leggibile, path `/`, echeggiato in header `X-CSRF-Token`), ruota il cookie; `LogoutView` blacklista il refresh e pulisce i cookie. Frontend: `setAccessToken`/`getAccessToken`/`clearAccessToken`, `apiFetch` rinfresca via cookie+CSRF (niente token in localStorage), boot ottimistico via hint non-segreto `fn_session` + silent-refresh sul primo 401. Poiché l'access viaggia in header Authorization (non cookie), l'API autenticata è CSRF-immune; solo refresh/logout sono cookie-based e applicano il double-submit. **Verifica**: 6 test nuovi in `test_jwt_cookies.py`, backend fininzen 92 passed, frontend 227 passed.
- **HIGH-22 ✅ FATTO** Sourcemap non disabilitato — `frontend/vite.config.js`.
  - **Fix**: aggiunto blocco `build: { sourcemap: false }` (i prod source map espongono il sorgente leggibile e gonfiano il bundle). Nessun impatto sui test (vitest non builda).
- **HIGH-23 ✅ FATTO** CSP meta assente — `frontend/index.html` (servito da Caddy, non da Django).
  - **Fix**: plugin Vite `cspMetaPlugin` (`apply: 'build'`) inietta un `<meta http-equiv="Content-Security-Policy">` **solo nel build di produzione** (così l'HMR del dev server, che usa script/style inline + WebSocket, resta intatto). Policy: `script-src 'self'` (nessuno script inline; richiede `modulePreload.polyfill=false`, aggiunto, per non far iniettare a Vite il polyfill inline), `style-src 'self' 'unsafe-inline' fonts.googleapis`, `font-src 'self' fonts.gstatic data:`, `connect-src 'self'` (API same-origin via Caddy/proxy), `object-src 'none'`, `base-uri/form-action 'self'`. Verificato sul build: meta presente, tutti gli script esterni, nessuna source-map.
- **HIGH-24 ✅ FATTO** `JSON.parse` da localStorage senza schema — `AppContext.jsx`.
  - **Verifica**: i tre parse (dashConfig, wealthChartMetrics, monthlyOverviewPrefs) sono tutti in `try/catch` **e** passati a normalizer robusti (`mergeDashConfig`, `normalizeWealthMetrics`, `normalizeMonthlyOverviewPrefs`) che validano tipi e clampano i valori. Lo schema-validation è già presente. Nessuna modifica necessaria.
- **HIGH-25 ✅ FATTO** `saveAdjustBalance` senza `isFinite`/cap.
  - **Fix**: il call site usava `parseFloat(adjustForm.new_balance)`, che (a) mangiava l'input formattato IT (`"1.234,56"` → `1.234`) e (b) lasciava passare `Infinity` (`isNaN(Infinity) === false`). Sostituito con `parseAmount(..., decimalSeparator)` per la validazione (rifiuta `Infinity`/`>1e12`, **preserva** negativi e zero per l'overdraft) e con `parseMoneyToString(..., decimalSeparator)` per il body → stringa decimale canonica, nessun round-trip `Number`. **Completa anche CRIT-04** su questo 8° sito monetario (era l'unico rimasto su `parseFloat`).
- **HIGH-26 🔀** `parseFlexibleDecimal` senza `isFinite` — ora delega a `_normalizeDecimalString` che usa `Number.isFinite`. Sostanzialmente risolto.
- **HIGH-27 ✅ FATTO** Year boundary 1900-2076 — `AppContext.jsx` (`normalizeMonthlyOverviewPrefs`).
  - **Fix**: `isReasonableYear` ristretto da `1900..thisYear+50` a `2000..thisYear+1` — il 2000 precede qualsiasi primo movimento plausibile, `+1` consente uno sguardo all'anno prossimo. Storage corrotto non guida più query vuote su anni fuori dal range realistico. Test `dashboardPrefs.test.js` invariati (2021-2023 verbatim, 3000 clampato).
- **HIGH-28 ✅ FATTO** `loadCfFeed` non aborta le richieste — `AppContext.jsx`.
  - **Fix**: aggiunto `cfAbortRef` (mirror del pattern già usato in `autofillTxPrice`): ogni nuova `loadCfFeed` aborta la precedente in volo prima di partire, passa `{ signal }` ad `apiFetch`, ignora l'`AbortError` nel catch e cede il `cfLoading` solo alla richiesta ancora corrente. Il sequence guard `cfRequestSeqRef` resta come protezione contro il resolve out-of-order.
- **HIGH-29 ✅ FATTO** `runCfBulkPreview` può mostrare anteprima di filtri non più attivi — `AppContext.jsx`.
  - **Fix**: oltre all'`AbortController` già presente (che impedisce a una risposta lenta di sovrascrivere una più nuova), aggiunto un guard sulla **signature della selection** (`cfBulkPreviewSelSigRef`): quando filtri/ids cambiano, l'anteprima stale viene azzerata subito (pannello in loading) invece di mostrare conteggi per un filtro morto. Keyed sulla sola selection (non sul patch) → niente flicker durante l'editing.
- **HIGH-30 🔀 PARZIALE** `AppContext.jsx` monolitico — era **5822 LOC**.
  - **Fix parziale (2026-06-15)**: avviata la decomposizione, mantenendo `useApp()` e l'oggetto-context (~426 chiavi) **identici** (zero modifiche ai 54 consumer). Estratti in moduli dedicati: `context/appContextHelpers.js` (tutti gli helper/costanti puri senza React: matematica mese-contabile, merge layout dashboard, normalizer, mappe feature/tab — i 3 export importati altrove sono ri-esportati), `context/formBuilders.js` (le 5 factory dei form), `context/useThemeLang.js` (il concern tema light/dark/auto + i18n: stato, listener matchMedia, sync cross-tab, `<meta theme-color>`, `MONTHS`). `AppContext.jsx` 5822 → ~5400 LOC, ora un modulo multi-file. **Resta dentro il provider** lo strato dati fortemente accoppiato (expenses/portfolio/cashflow/fire/recurring + l'orchestrazione fetch via `apiFetch`, lo stato privacy/app-lock idratato da `applyProfileData` prima che `apiFetch` esista): estrarlo richiede dependency-threading invasivo e, con copertura test frontend parziale (227 test), porta rischio di regressione. **Raccomandato**: completarlo in step successivi, idealmente dopo aver aggiunto test sui flussi dati. **Verifica**: frontend 227 passed dopo ogni estrazione.
- **HIGH-31 ✅ FATTO** Nessun `ErrorBoundary` — assente in tutto `frontend/src/`.
  - **Fix**: nuovo `frontend/src/components/ErrorBoundary.jsx` (class component, `getDerivedStateFromError` + `componentDidCatch` che logga lo stack), che avvolge `<App/>` in `main.jsx`. Fallback accessibile (`role="alert"`, token CSS coerenti) con bottone "Ricarica"; sostituisce la schermata bianca su crash di render. Testo statico perché il boundary sta **fuori** da `AppProvider` (niente i18n disponibile). Hook per Sentry (HIGH-35) lasciato come `console.error`.

### DevOps
- **HIGH-32 ✅ FATTO** Nessuna CI/CD — `.github/workflows/` assente.
  - **Fix**: `.github/workflows/ci.yml` su push `main` + ogni PR. Job backend (Python 3.12: `ruff check`, `ruff format --check`, `pytest -c pytest.ini`) e job frontend (Node 22: `prettier --check`, `vitest run`, `vite build`). Mirror di `just lint test`. Chiude NEW-HIGH-02 come gate di merge (i 5 test che prima sfuggivano a un run manuale ora non possono più mergiare in rosso). Lint+format verificati localmente verdi sull'intero tree.
- **HIGH-33 ✅ FATTO** Nessun pre-commit hook.
  - **Fix**: `.pre-commit-config.yaml` (ruff `v0.15.15` check+format in lockstep con `requirements.txt`, prettier locale sul `frontend/src`, hook igiene base) + target `just hooks`/`just hooks-run` e `pre-commit==4.4.0` in requirements.
- **HIGH-34 🔀 PARZIALE** Caddy senza rate-limit / fail2ban.
  - **Fix**: blocco `rate_limit` documentato nel `Caddyfile` (commentato — la direttiva richiede il modulo community `caddy-ratelimit`, build via `xcaddy`) come difesa edge per `/api/auth/*` davanti al throttle DRF. Alternativa col binario stock: `deploy/fail2ban/README.md` (filtro+jail fail2ban sul JSON access-log di Caddy). **Resta operativo**: build/abilitazione lato deploy.
- **HIGH-35 ✅ FATTO** Nessuna observability (Sentry/Prometheus).
  - **Fix**: Sentry opt-in. Backend: init condizionale in `settings.py` (no-op senza `SENTRY_DSN`, no-op in pytest, import guarded; `send_default_pii=False` per non spedire i body finanziari). `sentry-sdk==2.62.0` in requirements; `SENTRY_DSN`/`SENTRY_ENVIRONMENT`/`SENTRY_TRACES_SAMPLE_RATE` documentati in `.env.example`. Frontend: `ErrorBoundary.componentDidCatch` inoltra a `window.Sentry?.captureException` se presente (nessuna dipendenza npm forzata). Prometheus resta aperto (non richiesto qui).

---

## Medium — stato (sintesi)

Validi e invariati salvo dove indicato:

- **MED-01 ✅ FATTO** endpoint `reset` senza throttle scope: nuovo `ResetRateThrottle` (`reset=5/minute`) applicato a `expenses` e `portfolio`, con test 429. **MED-02 ✅ VERIFICATO** `DataAccessGrant.permission` ha già `choices=PERMISSION_CHOICES`. **MED-03 ✅ FATTO** export `Content-Disposition` include `filename*` UTF-8. **MED-04 ✅ FATTO** ZIP export con hard cap `_ZIP_MAX_BYTES` e 413 controllato. **MED-05 ✅ VERIFICATO** `SECRET_KEY` fallback dev rifiutato in produzione (`DEBUG=False`) con `ImproperlyConfigured`. **MED-06 ⚠️** CORS≠CSRF in dev.
- **MED-07 ⚠️** FX semanticamente misto (`current_value_eur` live, `invested_capital_eur` storico) — scelta finanziaria da discutere. **MED-08 ⚠️** backfill migration 0029. **MED-09 ✅ FATTO** `_yf_history_with_retry` usa backoff esponenziale leggero + jitter. **MED-10 ✅ FATTO** `_tx_amount`/feed allineati a `_q2` ROUND_HALF_UP. **MED-11 ✅ FATTO** cleanup + upsert della shadow tx ora in un solo `transaction.atomic()` nel signal; `ExpenseViewSet.perform_create/update` avvolti in `transaction.atomic()` (non c'è `ATOMIC_REQUESTS`), così un fallimento del sync fa rollback anche della spesa. +test di rollback.
- **MED-12 ✅ FATTO** `_serializer_user` consolidato in `fininzen/utils.py::serializer_user`. **MED-13 ✅ FATTO** `_parse_optional_bool` consolidato in `fininzen/utils.py::parse_optional_bool` con alias per import cashflow. **MED-14 ✅ VERIFICATO** `MAX_FILTERED_SELECTION`/`PORTFOLIO_TX_MAX_FILTERED_BULK` sono già costanti modulo documentate (non più magic). **MED-15 ✅ FATTO** `_is_database_locked_error` ora matcha anche `"database table is locked"` (SQLITE_LOCKED), non solo `"database is locked"` (SQLITE_BUSY). +test. **MED-16 ⚠️** type hint mancanti. **MED-17 ⚠️** `seed_demo_for_user` monolitico. **MED-18 ✅ FATTO** `_sanitize_cell` ora protegge anche control-char iniziali (`chr(0)..chr(31)`).
- **MED-19 ✅ VERIFICATO** `trends` aggrega lato DB; nessun loop per-riga di aggregazione. **MED-20 ✅ VERIFICATO** `monthly` usa `TruncMonth` quando `start_day=1`; il loop residuo è zero-fill/accounting-month custom ed è accettabile. **MED-21 ⚠️** `_PROVIDER_EXECUTOR` globale. **MED-22 ✅ VERIFICATO** `_update_expense_categories` già documenta perché le spese linkate devono passare da `save()` (sync shadow) e usa `bulk update()` per le non-linkate: loop minimo e motivato. **MED-23 ⚠️** FX history non cachato per range.
- **MED-24..30** Frontend: privacy timer ✅ VERIFICATO (cleanup `clearTimeout` su unmount, `AppContext.jsx`); bootstrap ✅ VERIFICATO (guardia `cancelled` in `.then`/`.finally` + cleanup); MED-26 ✅ parser corretto; console.* in prod ✅ sostituiti con logger dev-only; `formatDate` ✅ locale-aware; **MED-29 CSV parser interno ✅ FATTO** (`parseCSV` ora quote-aware RFC-4180: separatore dentro campi quotati, escape `""`, CRLF; +test); `FIELD_ERROR_MAP` ✅ fallback già coperto da test.
- **MED-31 ✅ FATTO** Pie chart usa chiavi stabili (`category__id`/`id`/nome) invece di `key={i}` nei segmenti principali. **MED-32 ✅ VERIFICATO/RICALIBRATO** `--fg-soft` (`rgba(11,22,40,.62)` light, `rgba(255,255,255,.62)` dark) blendato sui surface reali dà ~4.97:1 su `--bg-2`, ~5.07:1 su bianco, ~5.65:1 su `--card` dark → **supera WCAG AA 4.5:1** per testo normale; la stima v1 era pessimistica. **MED-33 ⚠️** empty/loading state chart — rinviato a una pass dedicata di design.
- **MED-34 🔀 PARZIALE** Sentry è opt-in e `send_default_pii=False`; resta aperto un filtro PII generalizzato sui logger applicativi. **MED-35 ✅ VERIFICATO** build frontend prod atomico via `dist.next` + swap `index.html`. **MED-36 🔀 PARZIALE** checklist operativa per gunicorn `--max-requests` in `wiki/OPS_HARDENING.md`; richiede modifica systemd/prod. **MED-37 ✅ FATTO** smoke test controlla anche auth guard (`/api/auth/profile/` → 401 senza token).

*(MED-26 ✅ Risolto: `parseAmount("1.234", ",") → 1234` nel nuovo `_normalizeDecimalString`.)*

---

## Low — stato (sintesi)

Tutti **⚠️ validi** salvo nota, riferimenti v1 sostanzialmente invariati:
LOW-01 ✅ HSTS preload attivo in prod (`SECURE_HSTS_PRELOAD=True`), **LOW-02 ✅ FATTO** `HealthView` ora gestisce il fallimento della probe DB e ritorna **503** (non 500) + test, **LOW-03 ✅ VERIFICATO** liste errori già cappate (`errors[:20]`/`[:50]` in import CSV/portfolio), LOW-04 DEBUG via argv, LOW-05 export warn, **LOW-06 ✅ VERIFICATO** nessun `assert` runtime in `portfolio/` (rimosso), LOW-07 `amount__gt=0` no refund (**⚠️ scelta di prodotto**: constraint DB volontario — i refund/negativi richiederebbero migration + decisione), LOW-08 `_clamp` Infinity (**🔀** ora `_q` gestisce `InvalidOperation`), **LOW-09 ✅ VERIFICATO** nessun pattern `.count()>0` (si usa `.exists()`), LOW-10 `ExpenseAdmin.list_editable`, LOW-11 DRF default pagination assente (**⚠️ scelta architetturale**: aggiungere paginazione globale cambierebbe la shape di tutte le list-response → regressione frontend; gli endpoint hanno cap/bound propri), LOW-12 Playwright timeout, LOW-13 ✅ theme cross-tab sync via `storage` event, LOW-14 = HIGH-30, LOW-15 bundle analysis, LOW-16 `React.memo` (⚠️ micro-opt opzionale, rischio props stale > beneficio), LOW-17 Caddyfile commenti, LOW-18 ✅ coverage gate full-suite (`--cov-fail-under=75`) in `just test-backend` e CI.

---

## Nuovi finding (codice post-redesign)

### Auth / WebAuthn (nuovo dominio)

**NEW-HIGH-01 ✅ FATTO — Endpoint WebAuthn `auth/*` senza rate-limit**
- `fininzen/webauthn_views.py:180` (`WebAuthnAuthChallengeView`, `AllowAny`) e `:224` (`WebAuthnAuthVerifyView`, `AllowAny`).
- `DEFAULT_THROTTLE_CLASSES = [ScopedRateThrottle]` (`fininzen/settings.py:185`) agisce **solo** su view con `throttle_scope`; queste non lo definiscono → **nessun throttle**, a differenza del login password (`LoginRateThrottle`, 20/min). `auth/challenge` inoltre fa una **scrittura DB non autenticata** (`WebAuthnChallenge.objects.create`) per ogni richiesta.
- *Impatto*: brute-force/abuso non limitato sul path di autenticazione; amplificazione DoS di scritture DB per email esistenti.
- *Raccomandazione*: aggiungere `throttle_classes=[LoginRateThrottle]` (o uno scope dedicato) a tutte le view WebAuthn `AllowAny`.
- **Fix**: nuovo `WebAuthnRateThrottle` (scope dedicato `webauthn`, `20/minute`, keyed by IP) in `throttles.py`, applicato a `WebAuthnAuthChallengeView`/`WebAuthnAuthVerifyView`. Test `test_webauthn_auth_endpoints_are_throttled`.

**NEW-MED-01 ✅ FATTO — WebAuthn auth non verifica `user.is_active`**
- `fininzen/webauthn_views.py:297` `RefreshToken.for_user(user)` emesso senza controllare `user.is_active` (il `TokenObtainPairView` standard lo fa).
- *Impatto*: un utente disattivato con passkey registrata può comunque ottenere JWT.
- *Raccomandazione*: `if not user.is_active: return 401` prima di emettere i token.
- **Fix**: guardia `is_active` aggiunta sia in `WebAuthnAuthVerifyView` (401, prima di emettere i token) sia in `WebAuthnAuthChallengeView` (ritorna opzioni vuote, non-enumeration). Test `test_webauthn_auth_verify_blocks_inactive_user`, `test_webauthn_auth_challenge_inactive_user_returns_empty`.

**NEW-MED-02 ✅ FATTO — `except (..., Exception)` catch-all negli endpoint WebAuthn**
- `fininzen/webauthn_views.py:148-154`, `:260`, `:280-286`. Il blocco a `:260` (`except (WebAuthnCredential.DoesNotExist, Exception)`) rende `DoesNotExist` ridondante e **non logga** → un errore di programmazione nella lookup diventa un 401 silenzioso.
- *Raccomandazione*: catturare le eccezioni WebAuthn specifiche; loggare il ramo `:260`; evitare `Exception` nudo.
- **Fix**: i due blocchi verify ora catturano `_WEBAUTHN_INPUT_ERRORS = (WebAuthnException, ValueError, TypeError, AttributeError)` (copre input malformato — `parse_raw`→AttributeError, base64→ValueError — senza ingoiare errori infra come 500). Il blocco lookup è splittato: `rawId` malformato → log+401; `WebAuthnCredential.DoesNotExist` → 401 (fallimento atteso, no warning). Nessun `Exception` nudo residuo.

**NEW-LOW-01 ✅ FATTO — Registrazione WebAuthn non bloccata per l'utente demo**
- `WebAuthnRegisterChallengeView`/`VerifyView`/`CredentialsView` usano `[IsAuthenticated]`, che **sovrascrive** e rimuove `IsNotDemoUser` dai default. Il demo (condiviso) può registrare/cancellare passkey sul proprio account. Impatto basso (dato condiviso, non distruttivo), ma incoerente con il sandbox demo.
- **Fix**: `IsNotDemoUser` ripristinato sulle tre view (blocca POST register/verify e DELETE credential per il demo; GET resta consentito). Test `test_webauthn_register_challenge_blocked_for_demo`.

### Correttezza finanziaria

**NEW-MED-03 ✅ FATTO — Correzione opening-balance non applicata nella history (test rosso)**
- `portfolio/prices.py:570 rebuild_manual_history` + `split_manual_opening_balance`. Test `portfolio/tests/test_recompute.py::test_rebuild_manual_history_applies_opening_balance_correction` **fallisce su `main`**: la entry `AssetPriceHistory` attesa alla `opening_balance_date` non viene creata.
- *Impatto*: il grafico patrimoniale di un conto MANUAL con saldo d'apertura può non riflettere il baseline alla data d'apertura.
- *Raccomandazione*: riconciliare `recompute_from_transactions` ↔ `rebuild_manual_history` sulla creazione della entry baseline; rendere verde il test.
- **Fix**: causa radice in `recompute_from_transactions` (`models.py:266`): `split_manual_opening_balance` azzerava `opening_balance`/`opening_balance_date` quando il saldo d'apertura vive solo sul campo modello (nessuna adjustment-tx baseline). Aggiunto fallback ai campi modello quando non c'è adjustment-tx → `rebuild_manual_history` (che legge i campi) ricrea il baseline alla data d'apertura. Test 10/10; suite portfolio 269/269.

**NEW-MED-04 ✅ FATTO — Bulk: selezione vuota/tutta-filtrata + patch valido → 400 invece di no-op**
- `expenses/bulk.py:527` (`if selection.total > 0 and kind is None`) e `_validate_patch_fields` (`:374-384`): con selezione risolta a 0 righe, `kind=None` e `is_verified` viene respinto come `fields_not_applicable` (400). Test `test_cannot_touch_other_user_rows` e `test_filtered_empty_result_returns_ok` **falliscono su `main`** (atteso 200 con no-op).
- *Impatto*: edit bulk su una selezione che dopo il filtro ownership risulta vuota restituisce errore invece di completare a vuoto; UX e ownership-isolation incoerenti.
- *Raccomandazione*: gestire `total == 0` come no-op (200) **prima** della validazione di applicabilità campi.
- **Fix**: in `_validate_and_resolve` il blocco di validazione campi è ora gated da `selection.total > 0`; selezione vuota → report `ok=True`, no-op 200. `test_cashflow_bulk.py` 38/38 verdi.

### Frontend

**NEW-MED-05 ✅ FATTO — `buildExportOptions` non include "assets" (test rosso)**
- `frontend/src/utils/exportOptions.js`. Test `exportOptions.test.js` **fallisce** (2 casi): atteso `["transactions","assets","cashflow"]`, ottenuto `["transactions","cashflow"]` — l'opzione `assets` non compare quando attesa per `investments`.
- *Raccomandazione*: allineare la mappa feature→opzioni; rendere verdi i test.
- **Fix**: aggiunta l'opzione `{type:"assets", label:T("export_assets")}` quando `investments` è attivo (backend `type=assets` già supportato in `_CSV_KINDS`/`_ROW_PRODUCERS`). `exportOptions.test.js` 2/2; suite frontend 224/224.

### Qualità / DevOps / a11y

**NEW-HIGH-02 🔀 PARZIALE — Test suite rossa su `main` (nessuna CI a intercettarla)**
- Backend **3 fail** (i due bulk sopra + opening-balance), frontend **2 fail** (export). Presenti **già su `main`**, non regressioni del rebase. Con HIGH-32 (no CI) restano invisibili fino a un run manuale.
- *Raccomandazione*: prioritizzare la CI (HIGH-32) e mantenere la suite verde come gate di merge.
- **Fix (test rossi)**: i 5 fallimenti sono risolti (NEW-MED-03/04/05). Suite ora verde. **Resta aperto** il punto CI/CD (HIGH-32) come gate di merge.

**NEW-LOW-02 — Duplicazione `_recompute_and_rebuild_asset`**
- `expenses/signals.py:18` replica `portfolio/services.py:182 _refresh_manual_asset` (recompute *locked* + `refresh_from_db` + `rebuild_manual_history` + try/except). Funzionalmente corretto ma duplicato. *Raccomandazione*: delegare a `_refresh_manual_asset`.

**NEW-LOW-03 ✅ FATTO — `logs/.rotate.lock` committato nel repo**
- File lock runtime a 0 byte tracciato in git (introdotto in `cb05b76`). *Raccomandazione*: rimuoverlo dall'indice e `.gitignore` su `logs/`.
- **Fix**: `git rm --cached logs/.rotate.lock` + `.gitignore` su `logs/` (la dir è ricreata a startup da `LOGS_DIR.mkdir(exist_ok=True)`, nessun `.gitkeep` necessario). Rimossa anche la stale `/log`.

**NEW-LOW-04 ✅ FATTO — BottomSheet: focus-trap / restore / Escape**
- `frontend/src/components/ui/BottomSheet.jsx` ha `createPortal(document.body)`, `aria-modal`, `aria-label`, `scrollLock`. Da verificare focus-trap, restore-focus all'unmount e chiusura con Escape (non evidenti). *Raccomandazione*: focus trap + `Esc` come negli altri Modal.
- **Fix**: `BottomSheet` ora salva il focus precedente, porta il focus sul primo elemento interattivo all'apertura, intrappola `Tab`/`Shift+Tab`, ripristina il focus all'unmount e mantiene Escape-to-close. Test `components.test.jsx` per portal, closed state, Escape, trap e restore focus.

**NEW-LOW-05 ✅ FATTO — `WEBAUTHN_RP_ID`/`ORIGIN` default su localhost**
- `fininzen/settings.py:207-209` default dev (`localhost`/`:5173`), override via env. Non una vuln, ma se l'env non è settato in prod WebAuthn fallisce silenziosamente (fail-safe).
- **Fix/verifica**: `.env.example:13-18` documenta già `WEBAUTHN_RP_ID`/`RP_NAME`/`ORIGIN` con i valori prod (`fininzen.nacci.eu`) e una nota esplicita ("Without these the localhost defaults break biometrics on the real domain"). Requisito soddisfatto.

---

## Indice per dominio (aggiornato)

- **Auth/WebAuthn (nuovo)**: NEW-HIGH-01, NEW-MED-01, NEW-MED-02, NEW-LOW-01, NEW-LOW-05.
- **Backend Security**: HIGH-01/02/03/04, MED-01..06, LOW-01/02/04/05.
- **Backend Correttezza**: CRIT-01/02/03/05, HIGH-05/06/07/09/10/11/12, HIGH-08(rical.), MED-07..11, NEW-MED-03, NEW-MED-04.
- **Backend Performance**: CRIT-06/07, HIGH-15/16/17/18/19/20, MED-19..23, LOW-11.
- **Frontend**: CRIT-04, HIGH-21..31, MED-24..33, NEW-MED-05, NEW-LOW-04.
- **DevOps / Test**: CRIT-08, HIGH-32..35, MED-34..37, LOW-17/18, NEW-HIGH-02, NEW-LOW-03.
- **Qualità**: HIGH-13/14, MED-12..18, NEW-LOW-02.

## Punti di forza (aggiornati)

Oltre a quelli v1 (IDOR via `ViewAsMixin`, JWT rotation+blacklist, no `fields="__all__"`, CSP/HSTS, WAL+busy_timeout, deploy con backup/rollback):
- **Atomicità**: `_recompute_asset_locked` + contratto `skip_recompute` documentato sono un buon pattern centralizzato.
- **WebAuthn**: challenge server-side monouso, `expected_origin`/`rp_id`, `require_user_verification`, sign-count, credential legata allo user, no enumeration su `auth/challenge`.
- **Demo sandbox**: `IsNotDemoUser` nei default + le 3 view che lo rimuovono sono tutte GET-only; `ExportView` blocca esplicitamente il demo (403) → il demo è di fatto read-only.
- Nuovi test mirati (`test_webauthn.py`, `test_demo_seed.py`) e componenti iOS con `aria-modal`/scrollLock.

---

*v2 prodotta dopo rebase su `main` (HEAD `cb05b76`). I numeri di linea citati con `file:linea` sono stati verificati sul codice rebasato; i finding marcati ⚠️ in forma sintetica si riferiscono a codice non modificato dai 56 commit e mantengono i riferimenti v1 dove la linea non è stata ri-verificata puntualmente.*
