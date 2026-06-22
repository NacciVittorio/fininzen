# Docker layout

Questo ramo separa Docker in due aree:

- `local/` per l'infrastruttura di sviluppo in locale.
- `prod/` per il riferimento futuro di produzione.

## Local

Usa Postgres e Redis in Docker, mentre Django continua a girare sul venv host.

```bash
docker compose -f deploy/docker/local/compose.yml up -d postgres redis
```

Poi esporta `DATABASE_URL` e `FIELD_ENCRYPTION_KEYS` nella shell corrente, oppure
caricali da un file `.env.local` con `source`.

## Prod reference

La configurazione sotto `prod/` è un riferimento di packaging per un eventuale
deploy containerizzato futuro. Non sostituisce il deploy bare-metal esistente,
ma ne copia la topologia applicativa in modo esplicito.

```bash
cp deploy/docker/prod/.env.example deploy/docker/prod/.env
docker compose \
  --env-file deploy/docker/prod/.env \
  -f deploy/docker/prod/compose.yml \
  up -d --build
```

Il container applicativo espone `/api/health/` e il compose usa PostgreSQL 16
come baseline del repository.
