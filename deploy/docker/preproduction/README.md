# Fininzen preproduction — homelab

This override deploys Fininzen on `L-DOCKER-P` behind the homelab's Nginx Proxy
Manager. It does not alter the VPS/bare-metal production topology.

## Start

```bash
cp deploy/docker/preproduction/.env.example deploy/docker/preproduction/.env
# Replace every CHANGE_ME and add the public age recipient.
docker compose \
  --env-file deploy/docker/preproduction/.env \
  -p fininzen-preproduzione \
  -f deploy/docker/production/compose.yml \
  -f deploy/docker/preproduction/compose.yml \
  config --quiet
docker compose \
  --env-file deploy/docker/preproduction/.env \
  -p fininzen-preproduzione \
  -f deploy/docker/production/compose.yml \
  -f deploy/docker/preproduction/compose.yml \
  up -d --build
```

The external `nacci_proxy` network must already exist, and the Nginx Proxy
Manager container must be attached to it. If it is not already connected, run
the following once, replacing the container name if necessary:

```bash
docker network connect nacci_proxy nginx-proxy-manager
```

Caddy remains inactive; it is available only with `--profile standalone`.
PostgreSQL and Redis remain on the private project network and publish no host
ports.

## Nginx Proxy Manager

Create `fininzen-preproduzione.nacci.eu` with:

- `/` → `http://fininzen-preprod-web:3000`;
- custom location `/api/` → `http://fininzen-preprod-api:8000`;
- WebSocket, Force SSL and the exact Let's Encrypt certificate enabled.

The browser API contract is `/api`; Django still receives its native `/api/*`
paths. The regular Docker/VPS configuration continues to use `/fininzen/api`.

After deployment, verify the complete public route through Nginx Proxy Manager:

```bash
API_PREFIX=/api scripts/smoke_test.sh \
  https://fininzen-preproduzione.nacci.eu 20
```

## Bootstrap and backup

Register the initial account through the UI, then run:

```bash
docker compose \
  --env-file deploy/docker/preproduction/.env \
  -p fininzen-preproduzione \
  -f deploy/docker/production/compose.yml \
  -f deploy/docker/preproduction/compose.yml \
  exec backend python manage.py promote_admin vittorio.nacci@nacci.eu
```

Run the backup on the Linux Docker host; only the public `age1...` recipient is
stored there. The private age identity stays on the Mac.

```bash
scripts/backup_preproduction.sh
```

The script creates a PostgreSQL custom dump, environment snapshot and Git
manifest, packages them, and atomically publishes an age-encrypted bundle. It
keeps the newest `BACKUP_RETENTION_COUNT` completed bundles.

## Restore test

Treat a restore as destructive for the target database. Test it on an isolated
stack first and keep the decrypted files in a temporary directory with mode
`0700`:

```bash
umask 077
RESTORE_DIR="$(mktemp -d)"
age --decrypt --identity ~/.config/age/keys.txt \
  --output "${RESTORE_DIR}/bundle.tar.gz" \
  /path/to/fininzen-preproduzione-YYYY-MM-DD_HHMMSS.tar.gz.age
tar -C "${RESTORE_DIR}" -xzf "${RESTORE_DIR}/bundle.tar.gz"
```

Inspect `manifest.txt` and `preproduction.env`, then restore the dump into the
intended stack. Stop application traffic before replacing an existing database:

```bash
docker compose \
  --env-file deploy/docker/preproduction/.env \
  -p fininzen-preproduzione \
  -f deploy/docker/production/compose.yml \
  -f deploy/docker/preproduction/compose.yml \
  stop backend frontend
docker compose \
  --env-file deploy/docker/preproduction/.env \
  -p fininzen-preproduzione \
  -f deploy/docker/production/compose.yml \
  -f deploy/docker/preproduction/compose.yml \
  exec -T postgres sh -c \
  'pg_restore -U "$POSTGRES_USER" --clean --if-exists --no-owner -d "$POSTGRES_DB"' \
  < "${RESTORE_DIR}/postgres.dump"
docker compose \
  --env-file deploy/docker/preproduction/.env \
  -p fininzen-preproduzione \
  -f deploy/docker/production/compose.yml \
  -f deploy/docker/preproduction/compose.yml \
  up -d backend frontend
```

Run the `/api` smoke test again after the restore, then securely remove the
temporary decrypted directory.
