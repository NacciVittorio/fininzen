#!/usr/bin/env bash
set -euo pipefail

BRANCH="${1:-main}"
APP_ROOT="/opt/finnet"
CADDYFILE="/etc/caddy/Caddyfile"
SYSTEMD_DIR="/etc/systemd/system"
FAIL2BAN_FILTER_DIR="/etc/fail2ban/filter.d"
FAIL2BAN_JAIL_DIR="/etc/fail2ban/jail.d"
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

# Postgres connection: prefer DATABASE_URL, else libpq PG* env from POSTGRES_*.
PG_CONN="${DATABASE_URL:-}"
if [[ -z "$PG_CONN" ]]; then
    export PGHOST="${POSTGRES_HOST:-localhost}"
    export PGPORT="${POSTGRES_PORT:-5432}"
    export PGUSER="${POSTGRES_USER:-finnet}"
    export PGPASSWORD="${POSTGRES_PASSWORD:-}"
    export PGDATABASE="${POSTGRES_DB:-finnet}"
fi
PG_TARGET=(-d "${PG_CONN:-${PGDATABASE:-finnet}}")
DB_BACKUP="${BACKUP_DIR}/db_${TIMESTAMP}.dump"

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
        echo "deploy: restoring Postgres from ${DB_BACKUP}" >&2
        restore_src="$DB_BACKUP"
        if [[ "$DB_BACKUP" == *.enc ]]; then
            restore_src="${DB_BACKUP%.enc}.restore"
            openssl enc -d -aes-256-cbc -pbkdf2 -in "$DB_BACKUP" \
                -out "$restore_src" -pass env:BACKUP_ENC_PASSPHRASE || true
        fi
        pg_restore --clean --if-exists --no-owner "${PG_TARGET[@]}" "$restore_src" || true
        [[ "$restore_src" == *.restore ]] && rm -f "$restore_src"
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
# Custom-format dump (restorable with pg_restore). Encrypt at rest when a
# passphrase is configured — defense in depth, since the dump still holds
# plaintext amounts/dates even though sensitive text fields are app-encrypted.
pg_dump --format=custom --no-owner "${PG_TARGET[@]}" --file="$DB_BACKUP"
if [[ -n "${BACKUP_ENC_PASSPHRASE:-}" ]]; then
    openssl enc -aes-256-cbc -pbkdf2 -salt -in "$DB_BACKUP" \
        -out "${DB_BACKUP}.enc" -pass env:BACKUP_ENC_PASSPHRASE
    rm -f "$DB_BACKUP"
    DB_BACKUP="${DB_BACKUP}.enc"
fi
# Run migrations before integrity audits so schema-dependent checks do not hit
# fields that were introduced in the same release.
su - finnet -c "cd ${APP_ROOT} && just install-backend && just migrate-prod && just audit-integrity-prod && just audit-integrity-check-prod && just collectstatic-prod && just build-frontend-prod"
install -m 0644 "${APP_ROOT}/Caddyfile" "$CADDYFILE"
install -m 0644 "${APP_ROOT}/deploy/systemd/finnet.service" "${SYSTEMD_DIR}/finnet.service"
install -m 0644 "${APP_ROOT}/deploy/systemd/finnet-refresh-prices.service" "${SYSTEMD_DIR}/finnet-refresh-prices.service"
install -m 0644 "${APP_ROOT}/deploy/systemd/finnet-refresh-prices.timer" "${SYSTEMD_DIR}/finnet-refresh-prices.timer"
if [[ -d "$FAIL2BAN_FILTER_DIR" && -d "$FAIL2BAN_JAIL_DIR" ]]; then
    install -m 0644 "${APP_ROOT}/deploy/fail2ban/filter.d/finnet-auth.conf" "${FAIL2BAN_FILTER_DIR}/finnet-auth.conf"
    install -m 0644 "${APP_ROOT}/deploy/fail2ban/jail.d/finnet-auth.conf" "${FAIL2BAN_JAIL_DIR}/finnet-auth.conf"
fi
caddy validate --config "$CADDYFILE" --adapter caddyfile
systemctl daemon-reload
systemctl enable --now caddy
systemctl enable finnet
systemctl enable --now finnet-refresh-prices.timer
systemctl reload caddy
systemctl restart finnet
systemctl restart fail2ban || true
"${APP_ROOT}/scripts/smoke_test.sh" "$PUBLIC_URL" "$SMOKE_ATTEMPTS"
trap - ERR
echo "deploy: completed successfully"
