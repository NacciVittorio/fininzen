#!/usr/bin/env bash
set -euo pipefail

BRANCH="${1:-main}"
APP_ROOT="/opt/finnet"
CADDYFILE="/etc/caddy/Caddyfile"
ENV_FILE="/etc/finnet.env"
PUBLIC_URL="${FINNET_PUBLIC_URL:-https://finnet.nacci.eu}"
SMOKE_ATTEMPTS="${FINNET_SMOKE_ATTEMPTS:-20}"
BACKUP_DIR="${FINNET_BACKUP_DIR:-/var/backups/finnet}"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"

if [[ -z "$BRANCH" || "$BRANCH" == -* || "$BRANCH" == *".."* || "$BRANCH" == *"@{"* ]]; then
    echo "deploy: invalid branch name: ${BRANCH}" >&2
    exit 64
fi
if [[ "$BRANCH" =~ [^A-Za-z0-9._/-] ]] || ! git check-ref-format --branch "$BRANCH" >/dev/null 2>&1; then
    echo "deploy: invalid branch name: ${BRANCH}" >&2
    exit 64
fi

if [[ -f "$ENV_FILE" ]]; then
    set -a
    source "$ENV_FILE"
    set +a
fi
DB_PATH="${DB_PATH:-${APP_ROOT}/db.sqlite3}"
DB_BACKUP="${BACKUP_DIR}/db_${TIMESTAMP}.sqlite3"

# Capture current commit for rollback before pulling.
PREV_REV="$(su - finnet -c "cd ${APP_ROOT} && git rev-parse HEAD")"
echo "deploy: previous revision = ${PREV_REV}"

rollback() {
    local exit_code=$?
    trap - ERR
    echo "deploy: failure detected, rolling back to ${PREV_REV}" >&2
    systemctl stop finnet || true
    su - finnet -c "cd ${APP_ROOT} && git reset --hard && git checkout --detach ${PREV_REV}" || true
    if [[ -f "$DB_BACKUP" ]]; then
        cp -a "$DB_BACKUP" "$DB_PATH" || true
        chown finnet:finnet "$DB_PATH" || true
    fi
    if [[ -f "${CADDYFILE}.bak" ]]; then
        cp -a "${CADDYFILE}.bak" "$CADDYFILE" || true
        systemctl reload caddy || true
    fi
    su - finnet -c "cd ${APP_ROOT} && just install-backend && just collectstatic-prod && just build-frontend-prod" || true
    systemctl restart finnet || true
    exit "$exit_code"
}
trap rollback ERR

su - finnet -c "cd ${APP_ROOT} && git fetch origin '${BRANCH}' && git reset --hard && git checkout -B '${BRANCH}' FETCH_HEAD"
caddy validate --config "${APP_ROOT}/Caddyfile" --adapter caddyfile
if [[ -f "$CADDYFILE" ]]; then
    cp -a "$CADDYFILE" "${CADDYFILE}.bak"
fi
mkdir -p "$BACKUP_DIR"
systemctl stop finnet || true
sqlite3 "$DB_PATH" ".backup '${DB_BACKUP}'"
# Run migrations before integrity audits so schema-dependent checks do not hit
# fields that were introduced in the same release.
su - finnet -c "cd ${APP_ROOT} && just install-backend && just migrate-prod && just audit-integrity-prod && just audit-integrity-check-prod && just collectstatic-prod && just build-frontend-prod"
install -m 0644 "${APP_ROOT}/Caddyfile" "$CADDYFILE"
caddy validate --config "$CADDYFILE" --adapter caddyfile
systemctl enable --now caddy
systemctl reload caddy
systemctl start finnet
"${APP_ROOT}/scripts/smoke_test.sh" "$PUBLIC_URL" "$SMOKE_ATTEMPTS"
trap - ERR
echo "deploy: completed successfully"
