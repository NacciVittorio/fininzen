# Justfile — Fininzen
# Usage: just <command>

set shell := ["bash", "-eu", "-o", "pipefail", "-c"]

venv_python := "venv/bin/python"
web_dir := "web"
web_bin := "web/node_modules/.bin"
production := "--env-file deploy/docker/production/.env -f deploy/docker/production/compose.yml"

default: doctor lint test

# ── Setup ────────────────────────────────────────────────────────────────────

doctor:
    test -x {{venv_python}}
    {{venv_python}} --version
    node --version
    npm --version
    just --version
    test -x {{web_bin}}/prettier

install-backend:
    if [ ! -x {{venv_python}} ]; then python3 -m venv venv; fi
    {{venv_python}} -m pip install --upgrade pip
    {{venv_python}} -m pip install -r requirements.txt

install-web:
    cd {{web_dir}} && npm install

install: install-backend install-web

update: install

# ── Database ─────────────────────────────────────────────────────────────────

makemigrations:
    {{venv_python}} manage.py makemigrations fininzen expenses portfolio

migrate:
    {{venv_python}} manage.py migrate

superuser:
    {{venv_python}} manage.py createsuperuser

promote-admin EMAIL:
    {{venv_python}} manage.py promote_admin {{EMAIL}}

reset-db:
    rm -f db.sqlite3
    just migrate

clear:
    git clean -fdX -e '!db.sqlite3' -e '!**/node_modules/' -e '!**/node_modules/**' -e '!.claude/' -e '!.claude/**'

# ── Start ────────────────────────────────────────────────────────────────────

backend:
    DJANGO_DEBUG=1 REFRESH_COOKIE_PATH=/fininzen/api/auth/ {{venv_python}} manage.py runserver

# E2E-only server: identico a `backend`, ma con E2E_RELAX_THROTTLES=1 (rate
# limit login/register alzati a 100000/minute) e E2E_AUTO_APPROVE_REGISTRATION=1
# (salta il gate di approvazione admin per i nuovi signup). Usalo SOLO per far
# girare `just test-e2e` in un altro terminale senza rimigrare/reinstallare a
# ogni run. Non è sicuro: MAI per demo, staging o produzione, dove sia i rate
# limit sia il gate di approvazione devono restare attivi.
backend-e2e:
    DJANGO_DEBUG=1 REFRESH_COOKIE_PATH=/fininzen/api/auth/ E2E_RELAX_THROTTLES=1 E2E_AUTO_APPROVE_REGISTRATION=1 {{venv_python}} manage.py runserver

web:
    npm run dev --prefix {{web_dir}}

start:
    DJANGO_PID="" WEB_PID=""; cleanup() { kill "$DJANGO_PID" "$WEB_PID" 2>/dev/null || true; exit 0; }; trap cleanup INT TERM; DJANGO_DEBUG=1 REFRESH_COOKIE_PATH=/fininzen/api/auth/ {{venv_python}} manage.py runserver 127.0.0.1:8000 & DJANGO_PID=$!; npm run dev --prefix {{web_dir}} & WEB_PID=$!; wait "$DJANGO_PID" "$WEB_PID"

# ── Bare-metal production (systemd, no Docker) ───────────────────────────────
# Da eseguire sul VPS come utente fininzen dentro /opt/fininzen. La produzione
# usa SQLite (ALLOW_SQLITE_IN_PRODUCTION=1 in /etc/fininzen.env). Guida completa:
# wiki/SYSTEMD_DEPLOY.md. I comandi manage.py sono management command → non attivano il
# guard di boot, quindi non servono le env di sicurezza per migrate/collectstatic.

migrate-prod:
    DJANGO_DEBUG=0 {{venv_python}} manage.py migrate --noinput

collectstatic-prod:
    DJANGO_DEBUG=0 {{venv_python}} manage.py collectstatic --noinput

build-frontend-prod:
    cd {{web_dir}} && npm ci && npm run build

# Aggiorna il codice e riavvia i servizi systemd. Uso: just deploy-prod [branch]
deploy-prod BRANCH="main":
    git fetch origin '{{BRANCH}}' && git reset --hard && git checkout -B '{{BRANCH}}' FETCH_HEAD
    bash scripts/backup_db.sh
    just install-backend
    just migrate-prod
    just collectstatic-prod
    just build-frontend-prod
    sudo systemctl restart fininzen fininzen-web
    scripts/smoke_test.sh "${FININZEN_PUBLIC_URL:-https://fininzen.nacci.eu}" 20

docker-local-up:
    docker compose -f deploy/docker/local/compose.yml up -d postgres redis

docker-local-down:
    docker compose -f deploy/docker/local/compose.yml down

docker-local-logs:
    docker compose -f deploy/docker/local/compose.yml logs -f postgres redis

# ── Full Docker stack (Caddy + Next.js + Django + PG + Redis) ────────────────
# Supported full-stack target, currently exercised in development/testing.
# Requires deploy/docker/production/.env. Guide: wiki/DOCKER_DEPLOY.md.

production-up:
    docker compose {{production}} up -d --build

production-down:
    docker compose {{production}} down

production-ps:
    docker compose {{production}} ps

production-logs:
    docker compose {{production}} logs -f

production-superuser:
    docker compose {{production}} exec backend python manage.py createsuperuser

production-promote-admin EMAIL:
    docker compose {{production}} exec backend python manage.py promote_admin {{EMAIL}}

production-refresh-prices:
    docker compose {{production}} exec -T backend python manage.py refresh_asset_prices

production-backup:
    bash scripts/backup_postgres.sh

# ── Code quality ─────────────────────────────────────────────────────────────

test-backend:
    {{venv_python}} -m pytest -c pytest.ini --cov-fail-under=75

# Runs the Playwright e2e suite (~130 tests across the two playwright.config.ts
# projects). With nothing listening on :8000, boots a throwaway Django server
# via ci-tools/test-e2e.sh — the same script CI uses, with
# E2E_RELAX_THROTTLES/E2E_AUTO_APPROVE_REGISTRATION set — and tears it down
# afterwards. If something is already listening on :8000 (e.g. `just
# backend-e2e` running in another terminal for fast iteration), reuses it
# as-is instead. Extra args are forwarded to Playwright, e.g.:
#   just test-e2e -- --project=mobile-viewport
test-e2e *ARGS:
    if curl -s --connect-timeout 1 http://localhost:8000/ > /dev/null 2>&1; then \
    echo "⚠️  Reusing the server already listening on :8000 for e2e tests."; \
    echo "    If it was NOT started with 'just backend-e2e', E2E_RELAX_THROTTLES /"; \
    echo "    E2E_AUTO_APPROVE_REGISTRATION are unset and most specs will fail with"; \
    echo "    429 (throttled) / 403 (account_pending). Either stop it and run"; \
    echo "    'just backend-e2e' in another terminal, or free :8000 so this target"; \
    echo "    can boot its own throwaway server via ci-tools/test-e2e.sh."; \
    npm run test:e2e --prefix {{web_dir}} -- {{ARGS}}; \
    else \
    PATH="venv/bin:$PATH" bash ci-tools/test-e2e.sh {{ARGS}}; \
    fi

test: test-backend test-e2e

lint:
    ruff check .
    npm run lint --prefix {{web_dir}}

# Regenerate the committed OpenAPI schema from the DRF views. The web typed
# client (npm run generate:api) is derived from this file, so run it after
# changing serializers/views. CI fails if the committed schema is stale.
schema:
    DJANGO_DEBUG=1 {{venv_python}} manage.py spectacular --format openapi-json --file openapi.json

# Give the pending `UNRELEASED` release-notes entry the version being cut. Run by
# `just release` via a commitizen pre_bump_hook — you don't call this by hand.
stamp-release-notes:
    {{venv_python}} scripts/stamp_release_notes.py

format:
    ruff format .
    npm run format --prefix {{web_dir}}

# HIGH-33: install the git pre-commit hooks (ruff + prettier) from
# .pre-commit-config.yaml. Run once after `just install`.
hooks:
    {{venv_python}} -m pre_commit install

# Run all pre-commit hooks against the whole tree (what CI's lint stage mirrors).
hooks-run:
    {{venv_python}} -m pre_commit run --all-files

# ── Release ──────────────────────────────────────────────────────────────────

# Cut a release. On the very FIRST run (no tags yet) this just tags the current
# VERSION as the baseline — commitizen needs an existing tag to compute the next
# version and an incremental changelog. On every later run it bumps the unified
# version (SemVer) from the Conventional Commits: update VERSION +
# web/package.json + CHANGELOG.md and create the vX.Y.Z tag. Either way it pushes
# commit + tag; the GitHub mirror workflow then publishes the GitHub and GitLab
# Releases while GitLab CI is dormant.
# Usage:
#   just release            → increment inferred automatically from the commits
#   just release patch      → force a patch increment (likewise minor / major)
# Run from `main` with a clean working tree. See wiki/VERSIONING.md.
release BUMP="":
    if [ -z "$(git tag)" ]; then \
        v="v$(tr -d '[:space:]' < VERSION)"; \
        echo "No tags yet — tagging current VERSION as baseline $v (no bump)."; \
        git tag -a "$v" -m "$v — baseline release"; \
    else \
        INC="{{uppercase(BUMP)}}"; \
        if [ -z "$INC" ]; then {{venv_python}} -m commitizen bump --yes; \
        else {{venv_python}} -m commitizen bump --yes --increment "$INC"; fi; \
    fi
    git push --follow-tags

# ── Utilities ────────────────────────────────────────────────────────────────

shell:
    {{venv_python}} manage.py shell

showmigrations:
    {{venv_python}} manage.py showmigrations

search-ticker TICKER:
    curl -s "http://localhost:8000/api/portfolio/search-ticker/?q={{TICKER}}" | {{venv_python}} -m json.tool
