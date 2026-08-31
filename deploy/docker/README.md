# Struttura Docker

Questa cartella contiene le definizioni Docker; il runbook operativo completo è
in [wiki/DOCKER_DEPLOY.md](../../wiki/DOCKER_DEPLOY.md).

| Cartella | Scopo |
|---|---|
| `local/` | PostgreSQL e Redis per lo sviluppo con applicazione sull'host. |
| `production/` | Stack Next.js + Django + PostgreSQL + Redis dietro un reverse proxy esterno. |
| `backend/` | Dockerfile ed entrypoint Django. |
| `web/` | Dockerfile Next.js. |

Comandi rapidi:

```bash
just docker-local-up
just docker-local-down

cp deploy/docker/production/.env.example deploy/docker/production/.env
just production-up
just production-ps
just production-logs
```

Il nome della cartella `production/` indica lo stack completo. Il deploy
automatico dello stack è in [`scripts/deploy.sh`](../../scripts/deploy.sh); il
percorso bare-metal separato usa [`scripts/deploy-bare-metal.sh`](../../scripts/deploy-bare-metal.sh)
ed è documentato in [wiki/SYSTEMD_DEPLOY.md](../../wiki/SYSTEMD_DEPLOY.md).

Per un deploy Docker usa unicamente `production/.env`, creato da `.env.example`.
