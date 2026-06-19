# Justfile — Fininzen
# Usa: just <comando>

set shell := ["bash", "-eu", "-o", "pipefail", "-c"]

venv_python := "venv/bin/python"
frontend_dir := "frontend"
frontend_bin := "frontend/node_modules/.bin"
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
    test -x {{frontend_bin}}/prettier

install-backend:
    if [ ! -x {{venv_python}} ]; then python3 -m venv venv; fi
    {{venv_python}} -m pip install --upgrade pip
    {{venv_python}} -m pip install -r requirements.txt

install-frontend:
    cd {{frontend_dir}} && npm install

install: install-backend install-frontend

update: install

# ── Database ─────────────────────────────────────────────────────────────────

makemigrations:
    {{venv_python}} manage.py makemigrations fininzen expenses portfolio

migrate:
    {{venv_python}} manage.py rename_finanza_to_fininzen
    {{venv_python}} manage.py migrate

migrate-prod:
    cd {{deploy_root}} && set -a && source {{env_file}} && set +a && {{venv_python}} manage.py rename_finanza_to_fininzen && {{venv_python}} manage.py migrate

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

# ── Avvio ────────────────────────────────────────────────────────────────────

backend:
    DJANGO_DEBUG=1 {{venv_python}} manage.py runserver

frontend:
    npm run dev --prefix {{frontend_dir}}

build-frontend-prod:
    cd {{deploy_root}}/frontend && npm ci --quiet && rm -rf dist.next && npm run build -- --outDir dist.next && mkdir -p dist/assets && cp -R dist.next/assets/. dist/assets/ && find dist.next -maxdepth 1 -type f ! -name index.html -exec cp {} dist/ \; && cp dist.next/index.html dist/index.html.next && mv -f dist/index.html.next dist/index.html && rm -rf dist.next && find dist/assets -type f -mtime +7 -delete

start:
    DJANGO_PID="" VITE_PID=""; cleanup() { kill "$DJANGO_PID" "$VITE_PID" 2>/dev/null || true; exit 0; }; trap cleanup INT TERM; DJANGO_DEBUG=1 {{venv_python}} manage.py runserver 127.0.0.1:8000 & DJANGO_PID=$!; npm run dev --prefix {{frontend_dir}} -- --host 127.0.0.1 & VITE_PID=$!; wait "$DJANGO_PID" "$VITE_PID"

deploy-prod BRANCH="main":
    sudo {{deploy_root}}/scripts/deploy.sh {{quote(BRANCH)}}

# ── Qualità del codice ───────────────────────────────────────────────────────

test-backend:
    {{venv_python}} -m pytest -c pytest.ini --cov-fail-under=75

test-frontend:
    npm run test --prefix {{frontend_dir}} -- --silent

test-e2e:
    if curl -s --connect-timeout 1 http://localhost:8000/ > /dev/null 2>&1; then npm run test:e2e --prefix {{frontend_dir}}; else echo "Django non attivo su :8000 — E2E saltati."; fi

test: test-backend test-frontend test-e2e

lint:
    {{venv_python}} -m ruff check .
    npm run lint --prefix {{frontend_dir}}

# Regenerate the committed OpenAPI schema from the DRF views. The frontend
# typed client (npm run generate:api) is derived from this file, so run it
# after changing serializers/views. CI fails if the committed schema is stale.
schema:
    DJANGO_DEBUG=1 {{venv_python}} manage.py spectacular --format openapi-json --file {{frontend_dir}}/openapi.json

format:
    {{venv_python}} -m ruff format .
    npm run format --prefix {{frontend_dir}}

# HIGH-33: install the git pre-commit hooks (ruff + prettier) from
# .pre-commit-config.yaml. Run once after `just install`.
hooks:
    {{venv_python}} -m pre_commit install

# Run all pre-commit hooks against the whole tree (what CI's lint stage mirrors).
hooks-run:
    {{venv_python}} -m pre_commit run --all-files

# ── Utilità ──────────────────────────────────────────────────────────────────

shell:
    {{venv_python}} manage.py shell

showmigrations:
    {{venv_python}} manage.py showmigrations

search-ticker TICKER:
    curl -s "http://localhost:8000/api/portfolio/search-ticker/?q={{TICKER}}" | {{venv_python}} -m json.tool
