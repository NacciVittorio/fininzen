# Finnet — Tracking App

App personale per tracciare spese quotidiane e portafoglio investimenti (ETF, azioni, asset illiquidi).

**Stack:**

- Backend: Django + Django REST Framework su PostgreSQL (SQLite per i test locali rapidi)
- Frontend: React + TypeScript (Vite)
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
docker compose up -d postgres redis
export DATABASE_URL=postgres://finnet:change-me@localhost:5432/finnet
```

In produzione il deploy è bare-metal (gunicorn sotto systemd dietro Caddy): vedi
[wiki/DEPLOY.md](/wiki/DEPLOY.md). Docker serve **solo** come infrastruttura locale.

## Avvio

Il progetto si avvia con `just start`. `Ctrl+C` ferma Django e Vite.

```bash
just start
```

In alternativa, due terminali separati:

```bash
# Terminale 1 — Backend
just backend

# Terminale 2 — Frontend
just frontend
```

L'applicazione sarà raggiungibile su:

```text
Backend: http://localhost:8000
Frontend: http://localhost:5173
```

## Comandi Just

```sh
just doctor              # controlla venv, Node, npm, just e prettier
just install             # installa dipendenze Python e Node
just update              # riallinea env a requirements/package-lock
just start               # avvia backend + frontend insieme
just backend             # solo Django (porta 8000)
just frontend            # solo Vite (porta 5173)
just makemigrations      # crea nuove migrations dopo modifiche ai modelli
just migrate             # applica migrations pendenti
just migrate-prod        # applica migrations in produzione caricando /etc/finnet.env
just collectstatic-prod  # raccoglie file statici Django in produzione
just build-frontend-prod # build frontend production con npm ci
just deploy-prod main    # aggiorna /opt/finnet, migra, raccoglie statici e builda frontend
just reset-db            # ⚠️ cancella tutto e riparte da zero
just shell               # shell interattiva Django
just showmigrations      # controlla stato migrations
just test                # esegue backend, frontend ed e2e
just test-backend        # solo pytest
just test-frontend       # solo vitest
just test-e2e            # solo Playwright
just lint                # ruff + prettier
just format              # ruff format + prettier write
just schema              # rigenera lo schema OpenAPI (frontend/openapi.json)
just hooks               # installa i git pre-commit hook
just hooks-run           # esegue tutti i pre-commit hook sull'intero albero
```

> I comandi con ⚠️ sono distruttivi e non chiedono conferma.

## Deploy su VPS

Per eseguire il deploy dell'applicazione su un server Linux, seguire la guida:
[DEPLOY.md](/wiki/DEPLOY.md)

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
