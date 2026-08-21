# Fininzen production test — homelab

This configuration runs the full production component set on `L-DOCKER-P` to
test a future migration. It is not the real VPS production instance: start from
a fresh database and use only synthetic/demo data.

All Docker configuration for this deployment is kept in
`deploy/docker/production/`.

## Start

```bash
cp deploy/docker/production/homelab.env.example \
  deploy/docker/production/homelab.env
# Replace every CHANGE_ME value and add the public age recipient.
docker compose \
  --env-file deploy/docker/production/homelab.env \
  -p fininzen-production-test \
  -f deploy/docker/production/compose.yml \
  config --quiet
docker compose \
  --env-file deploy/docker/production/homelab.env \
  -p fininzen-production-test \
  -f deploy/docker/production/compose.yml \
  up -d --build
```

The external `nacci_proxy` network and its Nginx Proxy Manager container must
already exist. PostgreSQL and Redis remain on the private project network and
no Fininzen service publishes a host port.

## Nginx Proxy Manager

Create these hosts, both pointing to the same services:

- `fininzen.preproduzione.homelab.nacci.eu` (private DNS only);
- `fininzen-preproduzione.nacci.eu` (the sole Cloudflare Tunnel hostname).

For each host use `/` → `http://fininzen-production-web:3000`, custom location
`/api/` → `http://fininzen-production-api:8000`, and custom location `/static/`
→ `http://fininzen-production-static:80`. Enable WebSocket, Force SSL, and
HTTP/2. The browser API contract is `/api`.

The environment file permits both HTTPS origins for Django. The current
WebAuthn implementation has one RP ID and origin, so use the public hostname
for passkeys.

## Bootstrap and backup

Register the initial account through the UI, then run:

```bash
docker compose \
  --env-file deploy/docker/production/homelab.env \
  -p fininzen-production-test \
  -f deploy/docker/production/compose.yml \
  exec backend python manage.py promote_admin vittorio.nacci@nacci.eu
```

Run `scripts/backup_homelab_production.sh` on the Linux Docker host. Only the
public `age1...` recipient is stored there; the private identity stays on the
Mac.
