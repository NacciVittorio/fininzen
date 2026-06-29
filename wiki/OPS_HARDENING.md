# Fininzen Ops Hardening Checklist

Use this as the deploy-side checklist for the review items that cannot be fully
enabled from repository code alone.

## Rate Limits

- Set `REDIS_URL` in the production environment and install the `redis` Python
  package on the host so DRF throttle buckets are shared across gunicorn workers.
- On the 1 GB VPS, keep Redis bounded, for example:
  `maxmemory 64mb` and `maxmemory-policy volatile-lru` (already set in the stack
  compose `redis` service).
- Edge rate-limiting is a future hardening item for the internet-facing/HTTPS
  deploy (e.g. Caddy built with `github.com/mholt/caddy-ratelimit`, or fail2ban
  reading the Caddy container's access log). The in-app DRF `ScopedRateThrottle`
  backed by Redis is the baseline.

## Backups

- Back up PostgreSQL with `scripts/backup_db.sh` (pg_dump `--format=custom` from
  the container, with rotation and optional at-rest encryption), then schedule
  `scripts/backup_offsite.sh` after it for off-site replication. See
  `wiki/DOCKER_DEPLOY.md` §8.
- Run a restore test periodically against a disposable path, not the live DB.

## Gunicorn

- Keep workers at `2` or lower on the current 1 vCPU / 1 GB VPS.
- Configure worker recycling, for example `--max-requests 1000
  --max-requests-jitter 100`. In the Docker stack this is set in the gunicorn
  command of `deploy/docker/prod/Dockerfile`.

## Price Refresh

- Do not refresh prices from Django startup hooks.
- Schedule `manage.py refresh_asset_prices` out of band. Run it outside peak
  request windows.
- In the Docker stack, schedule it via host cron calling the backend container
  (`docker compose ... exec -T backend python manage.py refresh_asset_prices`) —
  see `wiki/DOCKER_DEPLOY.md` §7.

## Docker Reference

- `deploy/docker/stack/compose.yml` is the production topology: Caddy + Next.js +
  Django/Gunicorn (two workers) + PostgreSQL 18 + Redis 7. See
  `wiki/DOCKER_DEPLOY.md`.
- `deploy/docker/prod/` is a backend-only reference; `deploy/docker/local/` is
  dev infra (Postgres + Redis only).
- Keep `DATABASE_URL`/`POSTGRES_*` mandatory in production. SQLite is a local
  development fallback only.

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
rate-limiting — deferred to the HTTPS deploy, see Rate Limits), **MED-36**
(gunicorn worker recycling — see Gunicorn).
