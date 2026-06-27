#!/usr/bin/env bash
set -euo pipefail

BRANCH="${1:-main}"
APP_ROOT="/opt/fininzen"
CADDYFILE="/etc/caddy/Caddyfile"
SYSTEMD_DIR="/etc/systemd/system"
FAIL2BAN_FILTER_DIR="/etc/fail2ban/filter.d"
FAIL2BAN_JAIL_DIR="/etc/fail2ban/jail.d"
ENV_FILE="/etc/fininzen.env"
PUBLIC_URL="${FININZEN_PUBLIC_URL:-https://fininzen.nacci.eu}"
SMOKE_ATTEMPTS="${FININZEN_SMOKE_ATTEMPTS:-20}"
BACKUP_DIR="${FININZEN_BACKUP_DIR:-/var/backups/fininzen}"
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

# Next.js cutover: Caddy serves the browser the prefixed /fininzen/api/auth/*
# path, so Django must scope fn_refresh to that exact path or silent refresh
# breaks (the browser never re-sends the cookie). Fail closed before touching the
# live service rather than ship a site that cannot stay logged in.
if [[ "${REFRESH_COOKIE_PATH:-}" != "/fininzen/api/auth/" ]]; then
    echo "deploy: REFRESH_COOKIE_PATH must be '/fininzen/api/auth/' in ${ENV_FILE} for the Next.js cutover (got '${REFRESH_COOKIE_PATH:-unset}')" >&2
    exit 78
fi

# Postgres connection: prefer DATABASE_URL, else libpq PG* env from POSTGRES_*.
PG_CONN="${DATABASE_URL:-}"
if [[ -z "$PG_CONN" ]]; then
    export PGHOST="${POSTGRES_HOST:-localhost}"
    export PGPORT="${POSTGRES_PORT:-5432}"
    export PGUSER="${POSTGRES_USER:-fininzen}"
    export PGPASSWORD="${POSTGRES_PASSWORD:-}"
    export PGDATABASE="${POSTGRES_DB:-fininzen}"
fi
PG_TARGET=(-d "${PG_CONN:-${PGDATABASE:-fininzen}}")
DB_BACKUP="${BACKUP_DIR}/db_${TIMESTAMP}.dump"

# Capture current commit for rollback before pulling.
PREV_REV="$(su - fininzen -c "cd ${APP_ROOT} && git rev-parse HEAD")"
echo "deploy: previous revision = ${PREV_REV}"

rollback() {
    local exit_code=$?
    trap - ERR
    echo "deploy: failure detected, rolling back to ${PREV_REV}" >&2
    systemctl stop fininzen || true
    systemctl stop fininzen-web || true
    su - fininzen -c "cd ${APP_ROOT} && git reset --hard && git checkout --detach ${PREV_REV}" || true
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
    su - fininzen -c "cd ${APP_ROOT} && just install-backend && just collectstatic-prod && just build-web-prod" || true
    systemctl restart fininzen || true
    exit "$exit_code"
}
trap rollback ERR

su - fininzen -c "cd ${APP_ROOT} && git fetch origin '${BRANCH}' && git reset --hard && git checkout -B '${BRANCH}' FETCH_HEAD"
caddy validate --config "${APP_ROOT}/Caddyfile" --adapter caddyfile
if [[ -f "$CADDYFILE" ]]; then
    cp -a "$CADDYFILE" "${CADDYFILE}.bak"
fi
mkdir -p "$BACKUP_DIR"
systemctl stop fininzen || true
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
# build-web-prod builds the Next.js SSR app: the Caddyfile routes the browser to
# Next on :3000. The legacy Vite frontend has been removed, so both the forward
# and rollback paths build the same web app.
su - fininzen -c "cd ${APP_ROOT} && just install-backend && just migrate-prod && just audit-integrity-prod && just audit-integrity-check-prod && just collectstatic-prod && just build-web-prod"
install -m 0644 "${APP_ROOT}/Caddyfile" "$CADDYFILE"
install -m 0644 "${APP_ROOT}/deploy/systemd/fininzen.service" "${SYSTEMD_DIR}/fininzen.service"
install -m 0644 "${APP_ROOT}/deploy/systemd/fininzen-web.service" "${SYSTEMD_DIR}/fininzen-web.service"
install -m 0644 "${APP_ROOT}/deploy/systemd/fininzen-refresh-prices.service" "${SYSTEMD_DIR}/fininzen-refresh-prices.service"
install -m 0644 "${APP_ROOT}/deploy/systemd/fininzen-refresh-prices.timer" "${SYSTEMD_DIR}/fininzen-refresh-prices.timer"
if [[ -d "$FAIL2BAN_FILTER_DIR" && -d "$FAIL2BAN_JAIL_DIR" ]]; then
    install -m 0644 "${APP_ROOT}/deploy/fail2ban/filter.d/fininzen-auth.conf" "${FAIL2BAN_FILTER_DIR}/fininzen-auth.conf"
    install -m 0644 "${APP_ROOT}/deploy/fail2ban/jail.d/fininzen-auth.conf" "${FAIL2BAN_JAIL_DIR}/fininzen-auth.conf"
fi
caddy validate --config "$CADDYFILE" --adapter caddyfile
systemctl daemon-reload
systemctl enable --now caddy
systemctl enable fininzen
systemctl enable fininzen-web
systemctl enable --now fininzen-refresh-prices.timer
systemctl reload caddy
systemctl restart fininzen
# fininzen-web (After=fininzen.service) starts after Django is back up.
systemctl restart fininzen-web
systemctl restart fail2ban || true
"${APP_ROOT}/scripts/smoke_test.sh" "$PUBLIC_URL" "$SMOKE_ATTEMPTS"
trap - ERR
echo "deploy: completed successfully"
