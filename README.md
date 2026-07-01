# Fininzen — Tracking App

App personale per tracciare spese quotidiane e portafoglio investimenti (ETF, azioni, asset illiquidi).

**Stack:**

- Backend: Django + Django REST Framework su PostgreSQL (SQLite per i test locali rapidi)
- Frontend: Next.js 15 (App Router, SSR) + React 19 + TypeScript
- Mobile: app iOS nativa via Capacitor (stesso build Next.js in static export dentro un WKWebView) — vedi [App iOS](#-app-ios-capacitor)
- Prezzi: yfinance (Yahoo Finance non ufficiale) + Borsa Italiana/FIDA, con fonte selezionabile Auto/Yahoo/Borsa per asset

## Installazione

### Prerequisiti

- `just`
- Python 3.13+
- Node.js 22+

```bash
just doctor
just install
```

L'ambiente di sviluppo usa un `venv/` Python locale (gestito da `just install`) — niente Nix/devenv.

### Database locale (opzionale: parità con la produzione)

Di default lo sviluppo gira su SQLite. Per replicare la produzione (PostgreSQL + Redis)
avvia solo l'infrastruttura con Docker e punta Django a essa via `DATABASE_URL`:

```bash
docker compose -f deploy/docker/local/compose.yml up -d postgres redis
export DATABASE_URL=postgres://fininzen:change-me@localhost:5432/fininzen
```

Il materiale Docker del repo vive sotto `deploy/docker/`:
- `deploy/docker/local/` per la dev infra (Postgres + Redis)
- `deploy/docker/production/` per il deploy di produzione completo in container

In produzione il deploy è containerizzato (Caddy + Next.js + Django + Postgres +
Redis via `docker compose`): vedi la guida [wiki/DOCKER_DEPLOY.md](/wiki/DOCKER_DEPLOY.md).

## Avvio

Il progetto si avvia con `just start`. `Ctrl+C` ferma Django e Next.js.

```bash
just start
```

In alternativa, due terminali separati:

```bash
# Terminale 1 — Backend
just backend

# Terminale 2 — Web (Next.js)
just web
```

L'applicazione sarà raggiungibile su:

```text
Backend: http://localhost:8000
Web: http://localhost:3000
```

## 📱 App iOS (Capacitor)

L'app iOS è lo **stesso** frontend Next.js buildato in *static export* e impacchettato
in un WKWebView nativo con [Capacitor](https://capacitorjs.com/). Nessun secondo
codebase: web e mobile differiscono solo per configurazione di build. Il flusso mobile
vive negli **npm script di `web/`** (non nel `justfile`).

> Per il **deploy su un iPhone reale** (via cavo gratis o TestFlight) segui il manuale
> dedicato: [wiki/IOS_DEPLOY.md](/wiki/IOS_DEPLOY.md).

### Prerequisiti

- Xcode + toolchain attiva (`sudo xcode-select -s /Applications/Xcode.app/Contents/Developer`,
  poi `xcodebuild -runFirstLaunch`).
- Node.js 22+, Docker Desktop (o Colima) per il backend.

### 1. Avvia il backend Docker

L'app mobile non usa `localhost`: parla con il tuo stack Docker via IP LAN. Avvia lo
stack (Caddy espone la **:80**):

```bash
just production-up
# oppure, esplicito:
docker compose --env-file deploy/docker/production/.env \
  -f deploy/docker/production/compose.yml up -d --build
```

Il device (Simulatore o iPhone) deve stare sulla **stessa LAN** del Docker host.
Se non vedi i container in Docker Desktop, controlla il contesto: `docker context show`
deve essere `desktop-linux` (non `colima`); nella tab *Containers* sono raggruppati sotto
il progetto compose **`production`**.

### 2. Configura l'IP LAN

Il build mobile punta di default a `http://192.168.1.7/fininzen/api` (hardcoded come
fallback nello script `build:mobile`). Se il tuo IP è diverso, ricavalo con
`ipconfig getifaddr en0` e prima del build esporta:

```bash
export NEXT_PUBLIC_API_BASE=http://<TUO-IP>/fininzen/api
```

Aggiungi lo stesso IP a `DJANGO_ALLOWED_HOSTS` e `CSRF_TRUSTED_ORIGINS` in
`deploy/docker/production/.env`, poi riavvia il backend (`just production-up`).

### 3. Esegui sul Simulatore (gratis, senza account Apple)

```bash
cd web
npm run ios:run          # build:mobile + cap sync ios + cap run ios
```

Elenca i simulatori disponibili con `xcrun simctl list devices available`. L'app ha
bundle id `eu.nacci.fininzen`; per provare usa il login demo `demo@demo.com`.

### 4. Su un iPhone reale

Due strade (via cavo con Apple ID gratuito, oppure TestFlight con Apple Developer
Program): il procedimento completo è in **[wiki/IOS_DEPLOY.md](/wiki/IOS_DEPLOY.md)**.

### Lettura offline

I dati sono persistiti in cache (TanStack Query persister, chiave `fn_query_cache`).
Con Caddy fermo (`docker stop production-caddy-1`) riaprendo l'app gli ultimi dati
restano visibili.

### Note di sicurezza

- L'eccezione ATS `NSAllowsLocalNetworking` in `web/ios/App/App/Info.plist` è
  **solo per lo sviluppo** (permette HTTP sulla LAN): va rimossa prima della release,
  quando il backend passa a HTTPS.
- Il refresh token è custodito nel **Keychain** iOS (mai in `localStorage`);
  l'access token vive solo in memoria; il DB resta interno a Docker.

## Comandi Just

```sh
just doctor              # controlla venv, Node, npm, just e prettier
just install             # installa dipendenze Python e Node
just update              # riallinea env a requirements/package-lock
just start               # avvia backend + web insieme
just backend             # solo Django (porta 8000)
just web                 # solo Next.js (porta 3000)
just makemigrations      # crea nuove migrations dopo modifiche ai modelli
just migrate             # applica migrations pendenti
just superuser           # crea un utente admin (createsuperuser)
just reset-db            # ⚠️ cancella tutto e riparte da zero
just clear               # ⚠️ git clean dei file non tracciati (preserva db/venv/node_modules/.claude)
just shell               # shell interattiva Django
just showmigrations      # controlla stato migrations
just docker-local-up     # dev infra: avvia solo Postgres + Redis (deploy/docker/local)
just docker-local-down   # ferma la dev infra
just docker-local-logs   # log in tail di Postgres + Redis
just search-ticker TICKER # ricerca uno strumento via API (richiede backend su :8000)
just test                # esegue backend ed e2e
just test-backend        # solo pytest
just test-e2e            # solo Playwright (web)
just lint                # ruff + lint web (prettier + eslint + tsc)
just format              # ruff format + prettier write (web)
just schema              # rigenera lo schema OpenAPI (openapi.json)
just hooks               # installa i git pre-commit hook
just hooks-run           # esegue tutti i pre-commit hook sull'intero albero
just release             # bump SemVer + CHANGELOG + tag dai Conventional Commits
```

La dev infra locale può essere avviata con `just docker-local-up` invece del `docker
compose` grezzo mostrato in [Database locale](#database-locale-opzionale-parità-con-la-produzione).

### Stack Docker (deploy in produzione)

Da eseguire sul server, dalla root del repo (richiedono `deploy/docker/production/.env`).
Guida completa: [wiki/DOCKER_DEPLOY.md](/wiki/DOCKER_DEPLOY.md).

```sh
just production-up             # build + avvio dello stack completo
just production-down           # ferma lo stack (i volumi restano)
just production-ps             # stato dei servizi
just production-logs           # log in tail di tutti i servizi
just production-superuser      # crea l'utente admin
just production-refresh-prices # aggiorna i prezzi degli asset (one-shot)
just production-backup         # dump del database (scripts/backup_db.sh)
```

> I comandi con ⚠️ sono distruttivi e non chiedono conferma.

## Versionamento

L'app usa una **versione unica SemVer** (`Major.Minor.Patch`) condivisa da
backend e frontend, con `VERSION` in root come unica fonte di verità. Il
rilascio è automatizzato da `just release`. Metodologia e flusso completo:
[wiki/VERSIONING.md](/wiki/VERSIONING.md).

## Deploy

Per il deploy containerizzato su un server Linux (da VM vuota a stack online),
seguire la guida: [wiki/DOCKER_DEPLOY.md](/wiki/DOCKER_DEPLOY.md)

## API Endpoints

### Spese

| Metodo | URL                              | Descrizione                                |
| ------ | -------------------------------- | ------------------------------------------ |
| GET    | `/api/expenses/`                 | Lista spese (filtri: `?month=4&year=2026`) |
| POST   | `/api/expenses/`                 | Crea spesa                                 |
| PATCH  | `/api/expenses/{id}/`            | Modifica spesa                             |
| DELETE | `/api/expenses/{id}/`            | Elimina spesa                              |
| GET    | `/api/expenses/summary/`         | Totali per categoria                       |
| GET    | `/api/expenses/monthly/`         | Totali per mese                            |
| POST   | `/api/expenses/reset/`           | Elimina tutte le spese                     |
| POST   | `/api/expenses/seed-demo/`       | Genera dati demo (6 mesi)                  |
| POST   | `/api/expenses/import-csv/`      | Importa spese da CSV                       |
| GET    | `/api/expenses/categories/`      | Lista categorie                            |
| POST   | `/api/expenses/categories/`      | Crea categoria                             |
| PATCH  | `/api/expenses/categories/{id}/` | Modifica categoria                         |
| DELETE | `/api/expenses/categories/{id}/` | Elimina categoria                          |
| GET    | `/api/expenses/budgets/`         | Lista budget mensili per categoria         |
| GET    | `/api/expenses/recurring/`       | Lista spese ricorrenti                     |

### Portafoglio — asset

| Metodo | URL                                             | Descrizione                                       |
| ------ | ----------------------------------------------- | ------------------------------------------------- |
| GET    | `/api/portfolio/`                               | Lista asset                                       |
| POST   | `/api/portfolio/`                               | Crea asset (accetta `initial_balance` per MANUAL) |
| PATCH  | `/api/portfolio/{id}/`                          | Modifica metadati asset                           |
| DELETE | `/api/portfolio/{id}/`                          | Elimina asset                                     |
| GET    | `/api/portfolio/history/?start_date=&end_date=` | Curva patrimonio                                  |
| GET    | `/api/portfolio/allocation-targets/`            | Target allocazione per tipo                       |
| POST   | `/api/portfolio/allocation-targets/`            | Imposta target allocazione                        |
| POST   | `/api/portfolio/refresh-prices/`                | Aggiorna tutti i prezzi automatici                |
| GET    | `/api/portfolio/search-ticker/?q=IWDA&name=`    | Ricerca strumenti Yahoo Finance e Borsa Italiana; `name` è un fallback opzionale |
| GET    | `/api/portfolio/investment-types/`              | Lista tipi investimento                           |
| POST   | `/api/portfolio/investment-types/`              | Crea tipo investimento                            |
| PATCH  | `/api/portfolio/investment-types/{id}/`         | Modifica tipo investimento                        |
| DELETE | `/api/portfolio/investment-types/{id}/`         | Elimina tipo investimento                         |
| POST   | `/api/portfolio/reset/`                         | Elimina tutti gli asset                           |

### Portafoglio — transazioni

| Metodo | URL                                           | Descrizione                                                                   |
| ------ | --------------------------------------------- | ----------------------------------------------------------------------------- |
| GET    | `/api/portfolio/{id}/transactions/`           | Lista transazioni asset                                                       |
| POST   | `/api/portfolio/{id}/transactions/`           | Crea transazione (BUY/SELL accettano `source_account_id` / `dest_account_id`) |
| PATCH  | `/api/portfolio/{id}/transactions/{tx_id}/`   | Modifica transazione                                                          |
| DELETE | `/api/portfolio/{id}/transactions/{tx_id}/`   | Elimina transazione                                                           |
| POST   | `/api/portfolio/transfer/`                    | Trasferimento tra conti `{from_account_id, to_account_id, amount, date}`      |
| POST   | `/api/portfolio/{id}/adjust-balance/`         | Aggiusta saldo MANUAL `{new_balance}`                                         |
| GET    | `/api/portfolio/{id}/historical-price/?date=` | Prezzo storico per autofill form                                              |

---

## Ticker Yahoo Finance — Guida

Per gli ETF europei il ticker include il suffisso della borsa:

| Borsa                   | Suffisso | Esempio   |
| ----------------------- | -------- | --------- |
| Amsterdam (Euronext)    | `.AS`    | `IWDA.AS` |
| Milano (Borsa Italiana) | `.MI`    | `SWDA.MI` |
| Londra (LSE)            | `.L`     | `VUSA.L`  |
| Francoforte             | `.DE`    | `EXS1.DE` |
| Parigi                  | `.PA`    | `CW8.PA`  |

I ticker LSE (`.L`) quotano in pence (GBX) — l'app li converte automaticamente in GBP.

Crypto: `BTC-USD`, `ETH-USD`, `SOL-USD`

L'ISIN identifica lo strumento, ma Yahoo Finance e Borsa Italiana richiedono un
simbolo provider per recuperare prezzo e storico. Nel form asset la ricerca per
ISIN propone i simboli disponibili e richiede una selezione esplicita.

Per confrontare e riparare manualmente la cache storica di un asset tracciato:

```bash
venv/bin/python manage.py repair_asset_price_history --asset-id ID --from YYYY-MM-DD
venv/bin/python manage.py repair_asset_price_history --asset-id ID --from YYYY-MM-DD --apply
```

Il primo comando è un dry-run. `--apply` aggiorna le date esistenti e inserisce
quelle mancanti senza cancellare righe non restituite dal provider.
