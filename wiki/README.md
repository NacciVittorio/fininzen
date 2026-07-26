# Wiki — Fininzen

Mappa della documentazione di progetto. Il [README](../README.md) alla root copre
installazione, avvio e comandi `just`; questa cartella raccoglie le guide
approfondite.

## Deploy & operatività

- [DEPLOY.md](DEPLOY.md) — runbook canonico: deploy bare-metal su VPS Ubuntu
  (systemd, SQLite, senza Docker), da VM vuota a stack online.
- [OPS_HARDENING.md](OPS_HARDENING.md) — checklist di hardening lato deploy (rate limit,
  backup, gunicorn, price refresh) + log dei finding accettati.

## Architettura

- [HEAVY_DEPS.md](HEAVY_DEPS.md) — perché le dipendenze pesanti del backend (yfinance,
  pandas, numpy, …) restano e come il loro raggio d'azione è confinato da un test guardia.

## Processo

- [VERSIONING.md](VERSIONING.md) — schema SemVer unico backend/frontend, fonte di verità
  (`VERSION`) e come si taglia una release con `just release`.
- [CI_GITHUB_MIRROR.md](CI_GITHUB_MIRROR.md) — la CI gira su GitHub Actions via
  push mirror da GitLab, che è a quota zero: come funziona il mirror, perché i
  job GitLab (gate di merge compreso) sono dormienti e quali token servono.
- [ISSUES.md](ISSUES.md) — convenzioni per aprire le issue (titoli, template, label).

## Archivio

Documenti storici, conservati per riferimento ma non più parte del flusso operativo.

- [archive/POSTGRES_MIGRATION.md](archive/POSTGRES_MIGRATION.md) — migrazione una-tantum
  SQLite → PostgreSQL (cutover completato).
- [archive/DOCKER_DEPLOY.md](archive/DOCKER_DEPLOY.md) — guida Docker storica (Caddy +
  Next.js + Django + Postgres + Redis in container); tenuta come riferimento ma non è il
  deploy in uso.
- [archive/VPS_DEPLOY_CHECKLIST.md](archive/VPS_DEPLOY_CHECKLIST.md) — checklist per la
  migrazione a stack Docker su VPS; non eseguita, il deploy attivo resta bare-metal
  ([DEPLOY.md](DEPLOY.md)).
