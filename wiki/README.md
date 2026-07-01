# Wiki — Fininzen

Mappa della documentazione di progetto. Il [README](../README.md) alla root copre
installazione, avvio, comandi `just` e l'app iOS; questa cartella raccoglie le guide
approfondite.

## Deploy & operatività

- [DOCKER_DEPLOY.md](DOCKER_DEPLOY.md) — runbook canonico: da VM vuota a stack online
  (Caddy + Next.js + Django + Postgres + Redis), price cron, backup/restore, HTTPS.
- [IOS_DEPLOY.md](IOS_DEPLOY.md) — deploy dell'app iOS su un iPhone reale (via cavo con
  Apple ID gratuito, oppure Apple Developer + TestFlight / App Store).
- [OPS_HARDENING.md](OPS_HARDENING.md) — checklist di hardening lato deploy (rate limit,
  backup, gunicorn, price refresh) + log dei finding accettati.

## Architettura

- [HEAVY_DEPS.md](HEAVY_DEPS.md) — perché le dipendenze pesanti del backend (yfinance,
  pandas, numpy, …) restano e come il loro raggio d'azione è confinato da un test guardia.

## Processo

- [VERSIONING.md](VERSIONING.md) — schema SemVer unico backend/frontend, fonte di verità
  (`VERSION`) e come si taglia una release con `just release`.
- [ISSUES.md](ISSUES.md) — convenzioni per aprire le issue (titoli, template, label).

## Archivio

Documenti storici, conservati per riferimento ma non più parte del flusso operativo.

- [archive/POSTGRES_MIGRATION.md](archive/POSTGRES_MIGRATION.md) — migrazione una-tantum
  SQLite → PostgreSQL (cutover completato).
