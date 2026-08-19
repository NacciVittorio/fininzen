# Fininzen — Tracking App

Applicazione personale per tracciare spese, conti, investimenti e spese
condivise.

## Stack

- Backend: Django + Django REST Framework.
- Frontend: Next.js 15 (App Router, SSR) + React 19 + TypeScript.
- Database: SQLite oppure PostgreSQL, in base alla modalità di esecuzione.
- Cache/throttling condiviso: Redis opzionale in bare-metal, incluso nello stack Docker.
- Prezzi: Yahoo Finance (`yfinance`) e Borsa Italiana/FIDA.

## Ambienti supportati

| Ambiente | Database | Processi | Stato e guida |
|---|---|---|---|
| Sviluppo standard | SQLite | Django e Next.js sull'host | Percorso predefinito per lo sviluppo locale. |
| Sviluppo con infrastruttura Docker | PostgreSQL + Redis | Database/cache in container, applicazione sull'host | Utile per verificare la compatibilità con PostgreSQL. |
| Produzione bare-metal | SQLite | systemd + Gunicorn + Next.js + Caddy | Deploy pubblico attuale; vedi [wiki/SYSTEMD_DEPLOY.md](wiki/SYSTEMD_DEPLOY.md). |
| Docker full-stack | PostgreSQL + Redis | Tutto in container, incluso Caddy | Alternativa supportata e testata in sviluppo; vedi [wiki/DOCKER_DEPLOY.md](wiki/DOCKER_DEPLOY.md). |

Il nome `deploy/docker/production/` identifica lo stack Docker completo; non
significa che sia il deploy attualmente attivo sul VPS.

## Installazione locale

Prerequisiti:

- Python 3.13+
- Node.js 24+
- `just`

```bash
just install
just doctor
```

`just install` crea il virtualenv Python locale `venv/` e installa anche le
dipendenze Node. `just doctor` verifica l'ambiente risultante.

Per usare PostgreSQL e Redis durante lo sviluppo:

```bash
just docker-local-up
export DATABASE_URL=postgres://fininzen:change-me@localhost:5432/fininzen
```

La configurazione e gli altri comandi Docker sono descritti in
[wiki/DOCKER_DEPLOY.md](wiki/DOCKER_DEPLOY.md).

## Avvio

```bash
just start
```

L'applicazione risponde su:

```text
Backend: http://localhost:8000
Web:     http://localhost:3000
```

In alternativa usa `just backend` e `just web` in due terminali separati. Per
riutilizzare un backend durante i test E2E avvialo con `just backend-e2e`.

## Comandi principali

```text
just install / update       installa o riallinea le dipendenze
just start                  avvia backend e frontend
just migrate                applica le migrazioni
just makemigrations         crea nuove migrazioni
just superuser              crea un amministratore locale
just test-backend           esegue pytest con copertura
just test-e2e               esegue Playwright e avvia Django se necessario
just test                   esegue backend ed E2E
just lint / format          verifica o formatta Python e frontend
just schema                 rigenera openapi.json
just hooks / hooks-run      installa o esegue i pre-commit hook
just release               crea versione, changelog e tag dai Conventional Commits
```

Comandi distruttivi:

- `just reset-db` elimina il database SQLite locale.
- `just clear` elimina i file ignorati da Git, con le esclusioni definite nel
  `justfile`.

Entrambi operano senza conferma interattiva.

## API

`openapi.json` è il contratto completo e versionato delle API. Dopo modifiche a
view o serializer:

```bash
just schema
npm run generate:api --prefix web
```

Non modificare manualmente `openapi.json` o `web/src/api/schema.d.ts`.

## Prezzi e ticker

I ticker Yahoo Finance degli strumenti europei includono in genere il suffisso
della borsa, per esempio `SWDA.MI`, `IWDA.AS`, `VUSA.L`, `EXS1.DE` o `CW8.PA`.
Le quotazioni LSE in GBX vengono convertite automaticamente in GBP; per le
criptovalute sono supportati simboli come `BTC-USD`.

Per verificare o riparare la cache storica di un asset:

```bash
venv/bin/python manage.py repair_asset_price_history --asset-id ID --from YYYY-MM-DD
venv/bin/python manage.py repair_asset_price_history --asset-id ID --from YYYY-MM-DD --apply
```

Il primo comando è un dry-run.

## Versionamento

Backend e frontend condividono una sola versione SemVer, letta dal file
`VERSION`. Il flusso di rilascio è descritto in
[wiki/VERSIONING.md](wiki/VERSIONING.md).
