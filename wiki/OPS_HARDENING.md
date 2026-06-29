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
  - install the fail2ban filter and jail shipped under `deploy/fail2ban/`
    (see `deploy/fail2ban/README.md`).

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

- `deploy/docker/prod/compose.yml` is the reference topology for future
  Proxmox/Docker: PostgreSQL 16, Redis 7, Django/Gunicorn with two workers.
- Keep `DATABASE_URL` mandatory in production. SQLite is a local development
  fallback only.

## Edge Protection

- The repo ships a fail2ban filter and jail under `deploy/fail2ban/` for the
  Caddy access log.

## Smoke Test

- Keep `scripts/smoke_test.sh` in the deploy path. It checks the Next.js app
  shell, hashed assets, backend health, and the unauthenticated auth guard.

## Accepted Findings (won't-fix / by-design)

These review findings were evaluated and deliberately accepted rather than
changed. They are recorded here so the rationale isn't lost now that the backlog
is closed and the full review log (`wiki/CODE_REVIEW.md`) has been removed.

- **HIGH-01 — Email enumeration on register.** The register endpoint returns an
  explicit "user already exists" message (`fininzen/views.py`). Kept for UX and
  already rate-limited via `RegisterRateThrottle`; eliminating enumeration fully
  would require email-verification signup (a product decision). OWASP-acceptable
  as-is.
- **MED-06 — CORS ≠ CSRF in development.** The permissive dev CORS origins
  (`localhost:5173`, LAN regex in `fininzen/settings.py`) are dev-only;
  production sets `CORS_ALLOWED_ORIGINS` explicitly with
  `CORS_ALLOW_ALL_ORIGINS=False`. No change.
- **MED-34 — PII in application logs.** Sentry is opt-in and ships with
  `send_default_pii=False`; a generalized PII-scrubbing filter on the app loggers
  is intentionally deferred (logs hold financial data and host access is
  restricted).

Operational items already covered by the checklist above: **HIGH-20** (shared
throttle buckets via `REDIS_URL` — see Rate Limits), **HIGH-34** (edge
rate-limit / fail2ban — see Edge Protection), **MED-36** (gunicorn worker
recycling — see Gunicorn).
