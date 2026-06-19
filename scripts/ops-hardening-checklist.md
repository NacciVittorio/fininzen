# Finnet Ops Hardening Checklist

Use this as the deploy-side checklist for the review items that cannot be fully
enabled from repository code alone.

## Rate Limits

- Set `REDIS_URL` in the production environment and install the `redis` Python
  package on the host so DRF throttle buckets are shared across gunicorn workers.
- Enable one edge guard:
  - build Caddy with `github.com/mholt/caddy-ratelimit` and uncomment the
    `rate_limit` block in `Caddyfile`, or
  - install the fail2ban jail described in `scripts/finnet-fail2ban.md`.

## Backups

- Schedule `scripts/backup_offsite.sh` after the local SQLite backup completes.
- Run a restore test periodically against a disposable path, not the live DB.

## Gunicorn

- Configure worker recycling, for example `--max-requests 1000
  --max-requests-jitter 100`, in the systemd unit or process manager.
- Keep the existing log rotation hook enabled before server start.

## Smoke Test

- Keep `scripts/smoke_test.sh` in the deploy path. It checks the SPA shell,
  hashed assets, backend health, and the unauthenticated auth guard.
