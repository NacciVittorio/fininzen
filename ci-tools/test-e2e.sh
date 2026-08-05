#!/usr/bin/env bash
# Boots a throwaway Django dev server (SQLite, ephemeral), then runs the
# Playwright suite against it. Playwright boots Next itself as its own
# webServer (web/playwright.config.ts) — in CI that means a production build
# (next build && next start) rather than `next dev`, to avoid the HMR traffic
# that keeps page.waitForLoadState("networkidle") from ever settling.
#
# Any arguments given to this script are forwarded to `npm run test:e2e`
# (i.e. to `playwright test`) after `--`, e.g.:
#   bash ci-tools/test-e2e.sh --project=mobile-viewport
set -euo pipefail

export DJANGO_DEBUG=1
export REFRESH_COOKIE_PATH=/fininzen/api/auth/
export E2E_RELAX_THROTTLES=1
export E2E_AUTO_APPROVE_REGISTRATION=1

echo "==> migrate (SQLite, ephemeral)"
bash ci-tools/migrate.sh

echo "==> install Playwright browsers (chromium only — the only engine any project uses)"
(cd web && npx playwright install --with-deps chromium)

echo "==> start Django (background)"
python manage.py runserver 127.0.0.1:8000 --noreload > django-e2e.log 2>&1 &
DJANGO_PID=$!

cleanup() {
    if kill -0 "$DJANGO_PID" 2>/dev/null; then
        kill "$DJANGO_PID" 2>/dev/null || true
        wait "$DJANGO_PID" 2>/dev/null || true
    fi
}
trap cleanup EXIT

echo "==> waiting for Django on :8000"
for i in $(seq 1 30); do
    if ! kill -0 "$DJANGO_PID" 2>/dev/null; then
        echo "Django exited before becoming ready — log follows:" >&2
        cat django-e2e.log >&2
        exit 1
    fi
    if curl --silent --fail http://127.0.0.1:8000/api/health/ > /dev/null 2>&1; then
        echo "Django is up."
        break
    fi
    if [ "$i" -eq 30 ]; then
        echo "Django did not become ready within 30s — log follows:" >&2
        cat django-e2e.log >&2
        exit 1
    fi
    sleep 1
done

echo "==> playwright test"
set +e
npm run test:e2e --prefix web -- "$@"
PW_STATUS=$?
set -e

if ! kill -0 "$DJANGO_PID" 2>/dev/null; then
    echo "::warning::Django exited during the Playwright run (not just at startup) — log follows:"
    cat django-e2e.log >&2
fi

exit "$PW_STATUS"
