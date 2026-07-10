#!/usr/bin/env bash
set -euo pipefail

# Deploy bare-metal (systemd, SQLite, senza Docker).
# Uso (come root sul VPS):  /opt/fininzen/scripts/deploy.sh [branch]
#
# Aggiorna il codice, applica migrazioni, ricostruisce il frontend, reinstalla le
# unit systemd e riavvia i servizi. In caso di errore fa rollback del codice al
# commit precedente. Il DB SQLite viene backuppato prima (scripts/backup_db.sh);
# per un rollback dati completo ripristina manualmente l'ultimo backup.
#
# Caddy NON viene toccato: il site-block di fininzen.nacci.eu si installa una
# volta sola nel Caddyfile host (vedi deploy/caddy/fininzen.Caddyfile e
# wiki/DEPLOY.md). Qui facciamo solo un reload non distruttivo.

BRANCH="${1:-main}"
APP_ROOT="/opt/fininzen"
SYSTEMD_DIR="/etc/systemd/system"
ENV_FILE="/etc/fininzen.env"
PUBLIC_URL="${FININZEN_PUBLIC_URL:-https://fininzen.nacci.eu}"
SMOKE_ATTEMPTS="${FININZEN_SMOKE_ATTEMPTS:-20}"

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
    # shellcheck disable=SC1090
    source "$ENV_FILE"
    set +a
fi

# Next.js cutover: Caddy serve al browser il path prefissato /fininzen/api/auth/*,
# quindi Django deve scopare il cookie di refresh su quell'esatto path o il
# silent refresh si rompe. Fail closed prima di toccare il servizio live.
if [[ "${REFRESH_COOKIE_PATH:-}" != "/fininzen/api/auth/" ]]; then
    echo "deploy: REFRESH_COOKIE_PATH deve essere '/fininzen/api/auth/' in ${ENV_FILE} (trovato '${REFRESH_COOKIE_PATH:-unset}')" >&2
    exit 78
fi

# Commit corrente per il rollback, prima del pull.
PREV_REV="$(su - fininzen -c "cd ${APP_ROOT} && git rev-parse HEAD")"
echo "deploy: revisione precedente = ${PREV_REV}"

rollback() {
    local exit_code=$?
    trap - ERR
    echo "deploy: errore rilevato, rollback del codice a ${PREV_REV}" >&2
    systemctl stop fininzen-web || true
    systemctl stop fininzen || true
    su - fininzen -c "cd ${APP_ROOT} && git reset --hard && git checkout --detach ${PREV_REV}" || true
    su - fininzen -c "cd ${APP_ROOT} && just install-backend && just migrate-prod && just collectstatic-prod && just build-frontend-prod" || true
    systemctl restart fininzen || true
    systemctl restart fininzen-web || true
    echo "deploy: rollback del codice completato. NB: il DB SQLite NON è stato ripristinato automaticamente; se serve, ripristina l'ultimo backup da /opt/fininzen/backups." >&2
    exit "$exit_code"
}
trap rollback ERR

# Backup SQLite consistente (sqlite3 .backup + integrity_check).
su - fininzen -c "cd ${APP_ROOT} && bash scripts/backup_db.sh"

# Aggiorna il codice.
su - fininzen -c "cd ${APP_ROOT} && git fetch origin '${BRANCH}' && git reset --hard && git checkout -B '${BRANCH}' FETCH_HEAD"

# Build backend + frontend. migrate/collectstatic sono management command → non
# attivano il guard di boot.
su - fininzen -c "cd ${APP_ROOT} && just install-backend && just migrate-prod && just collectstatic-prod && just build-frontend-prod"

# (Re)installa le unit systemd dal repo e ricarica systemd.
install -m 0644 "${APP_ROOT}/deploy/systemd/fininzen.service" "${SYSTEMD_DIR}/fininzen.service"
install -m 0644 "${APP_ROOT}/deploy/systemd/fininzen-web.service" "${SYSTEMD_DIR}/fininzen-web.service"
install -m 0644 "${APP_ROOT}/deploy/systemd/fininzen-refresh-prices.service" "${SYSTEMD_DIR}/fininzen-refresh-prices.service"
install -m 0644 "${APP_ROOT}/deploy/systemd/fininzen-refresh-prices.timer" "${SYSTEMD_DIR}/fininzen-refresh-prices.timer"
systemctl daemon-reload
systemctl enable fininzen fininzen-web
systemctl enable --now fininzen-refresh-prices.timer

# Riavvia i servizi (fininzen-web ha After=fininzen.service).
systemctl restart fininzen
systemctl restart fininzen-web

# Reload non distruttivo del Caddy host (il site-block deve essere già installato).
if command -v caddy >/dev/null 2>&1 && [[ -f /etc/caddy/Caddyfile ]]; then
    caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
    systemctl reload caddy || true
fi

"${APP_ROOT}/scripts/smoke_test.sh" "$PUBLIC_URL" "$SMOKE_ATTEMPTS"
trap - ERR
echo "deploy: completato con successo"
