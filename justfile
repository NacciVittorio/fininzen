# Justfile — Fininzen
# Usage: just <command>

set shell := ["bash", "-eu", "-o", "pipefail", "-c"]

venv_python := "venv/bin/python"
web_dir := "web"
web_bin := "web/node_modules/.bin"
deploy_root := "/opt/fininzen"
env_file := "/etc/fininzen.env"

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

migrate-prod:
    cd {{deploy_root}} && set -a && source {{env_file}} && set +a && {{venv_python}} manage.py migrate

audit-integrity-prod:
    cd {{deploy_root}} && set -a && source {{env_file}} && set +a && {{venv_python}} manage.py audit_domain_integrity --apply

audit-integrity-check-prod:
    cd {{deploy_root}} && set -a && source {{env_file}} && set +a && {{venv_python}} manage.py audit_domain_integrity

collectstatic-prod:
    cd {{deploy_root}} && set -a && source {{env_file}} && set +a && {{venv_python}} manage.py collectstatic --noinput

superuser:
    {{venv_python}} manage.py createsuperuser

reset-db:
    rm -f db.sqlite3
    just migrate

clear:
    git clean -fdX -e '!db.sqlite3' -e '!venv/' -e '!venv/**' -e '!**/node_modules/' -e '!**/node_modules/**' -e '!.claude/' -e '!.claude/**'

# ── Start ────────────────────────────────────────────────────────────────────

backend:
    DJANGO_DEBUG=1 {{venv_python}} manage.py runserver

web:
    npm run dev --prefix {{web_dir}}

# Build the Next.js SSR app served by fininzen-web.service. NEXT_PUBLIC_API_BASE
# is inlined here (defaults to /fininzen/api), so the browser bundle targets the
# Caddy-prefixed API; DJANGO_ORIGIN is a runtime-only var set by the unit.
build-web-prod:
    cd {{deploy_root}}/{{web_dir}} && npm ci --quiet && npm run build

start:
    DJANGO_PID="" WEB_PID=""; cleanup() { kill "$DJANGO_PID" "$WEB_PID" 2>/dev/null || true; exit 0; }; trap cleanup INT TERM; DJANGO_DEBUG=1 {{venv_python}} manage.py runserver 127.0.0.1:8000 & DJANGO_PID=$!; npm run dev --prefix {{web_dir}} & WEB_PID=$!; wait "$DJANGO_PID" "$WEB_PID"

docker-local-up:
    docker compose -f deploy/docker/local/compose.yml up -d postgres redis

docker-local-down:
    docker compose -f deploy/docker/local/compose.yml down

docker-local-logs:
    docker compose -f deploy/docker/local/compose.yml logs -f postgres redis

docker-prod-config:
    docker compose --env-file deploy/docker/prod/.env -f deploy/docker/prod/compose.yml config

docker-prod-build:
    docker compose --env-file deploy/docker/prod/.env -f deploy/docker/prod/compose.yml build web

docker-prod-up:
    docker compose --env-file deploy/docker/prod/.env -f deploy/docker/prod/compose.yml up -d

docker-prod-down:
    docker compose --env-file deploy/docker/prod/.env -f deploy/docker/prod/compose.yml down

deploy-prod BRANCH="main":
    sudo {{deploy_root}}/scripts/deploy.sh {{quote(BRANCH)}}

# ── Code quality ─────────────────────────────────────────────────────────────

test-backend:
    {{venv_python}} -m pytest -c pytest.ini --cov-fail-under=75

test-e2e:
    if curl -s --connect-timeout 1 http://localhost:8000/ > /dev/null 2>&1; then npm run test:e2e --prefix {{web_dir}}; else echo "Django not running on :8000 — skipping E2E."; fi

test: test-backend test-e2e

lint:
    {{venv_python}} -m ruff check .
    npm run lint --prefix {{web_dir}}

# Regenerate the committed OpenAPI schema from the DRF views. The web typed
# client (npm run generate:api) is derived from this file, so run it after
# changing serializers/views. CI fails if the committed schema is stale.
schema:
    DJANGO_DEBUG=1 {{venv_python}} manage.py spectacular --format openapi-json --file openapi.json

format:
    {{venv_python}} -m ruff format .
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
# commit + tag, and the release.yml GitHub Action then publishes the Release.
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
