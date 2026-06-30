# Docker layout

Quattro aree, per scopi diversi:

| Cartella | Scopo |
|---|---|
| `local/` | Infrastruttura di sviluppo: solo Postgres + Redis in Docker, Django gira sul venv host. |
| `production/` | **Deploy di produzione completo**: Caddy + Next.js + Django + Postgres + Redis, tutto in container. |
| `backend/` | Immagine del backend Django (`Dockerfile` + `entrypoint.sh`), buildata dal servizio `backend` dello stack. |
| `web/` | Dockerfile del frontend Next.js (usato dallo stack). |

## Local (sviluppo)

Postgres e Redis in Docker, Django sul venv host:

```bash
docker compose -f deploy/docker/local/compose.yml up -d postgres redis
```

Poi esporta `DATABASE_URL` e `FIELD_ENCRYPTION_KEYS` nella shell, oppure caricali
da un `.env.local` con `source`.

## Stack (produzione)

Lo stack "tutto in Docker". Avvio rapido:

```bash
cp deploy/docker/production/.env.example deploy/docker/production/.env   # poi compila
docker compose --env-file deploy/docker/production/.env \
  -f deploy/docker/production/compose.yml up -d --build
```

Guida completa da VM vuota (utente, permessi, SSH, .env, cron prezzi, backup):
**[wiki/DOCKER_DEPLOY.md](../../wiki/DOCKER_DEPLOY.md)**. Riferimento rapido dei
comandi: [production/README.md](production/README.md).
