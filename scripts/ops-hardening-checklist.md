# Fininzen Ops Hardening Checklist

Use this as the deploy-side checklist for the review items that cannot be fully
enabled from repository code alone.

## Rate Limits

- Set `REDIS_URL` in the production environment and install the `redis` Python
  package on the host so DRF throttle buckets are shared across gunicorn workers.
- On the 1 GB VPS, keep Redis bounded, for example:
  `maxmemory 64mb` and `maxmemory-policy volatile-lru`.
- Enable one edge guard:
  - build Caddy with `github.com/mholt/caddy-ratelimit` and uncomment the
    `rate_limit` block in `Caddyfile`, or
  - install the fail2ban jail described in `scripts/fininzen-fail2ban.md`.

## Backups

- Back up PostgreSQL with `pg_dump --format=custom` and schedule
  `scripts/backup_offsite.sh` after the local database dump completes.
- Run a restore test periodically against a disposable path, not the live DB.

## Gunicorn

- Keep workers at `2` or lower on the current 1 vCPU / 1 GB VPS.
- Configure worker recycling, for example `--max-requests 1000
  --max-requests-jitter 100`, in the systemd unit or process manager.
- Keep the existing log rotation hook enabled before server start.
- The repo ships a reference unit in `deploy/systemd/fininzen.service`.

## Price Refresh

- Do not refresh prices from Django startup hooks.
- Schedule `venv/bin/python manage.py refresh_asset_prices` from cron or a
  systemd timer. Run it outside peak request windows.
- The repo ships a reference timer in `deploy/systemd/fininzen-refresh-prices.timer`.

## Docker Reference

- `docker-compose.yml` is the reference topology for future Proxmox/Docker:
  PostgreSQL 16, Redis 7, Django/Gunicorn with two workers.
- Keep `DATABASE_URL` mandatory in production. SQLite is a local development
  fallback only.

## Edge Protection

- The repo ships a fail2ban filter and jail under `deploy/fail2ban/` for the
  Caddy access log.

## Smoke Test

- Keep `scripts/smoke_test.sh` in the deploy path. It checks the SPA shell,
  hashed assets, backend health, and the unauthenticated auth guard.
