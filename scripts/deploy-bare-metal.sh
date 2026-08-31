#!/usr/bin/env bash
set -euo pipefail

# Deploy bare-metal (systemd, SQLite, senza Docker).
# Uso (come root sul VPS): /opt/fininzen/scripts/deploy-bare-metal.sh [branch]
#
# Aggiorna il codice, applica migrazioni, ricostruisce il frontend, reinstalla le
# unit systemd e riavvia i servizi. In caso di errore fa rollback del codice al
# commit precedente. Il DB SQLite viene backuppato prima; per un rollback dati
# completo ripristina manualmente l'ultimo backup.
#
# Caddy NON viene toccato: il site-block di fininzen.nacci.eu si installa una
# volta sola nel Caddyfile host (vedi deploy/caddy/fininzen.Caddyfile e
# wiki/SYSTEMD_DEPLOY.md). Qui facciamo solo un reload non distruttivo.

BRANCH="${1:-main}"
APP_ROOT="/opt/fininzen"
SYSTEMD_DIR="/etc/systemd/system"
ENV_FILE="/etc/fininzen.env"
PUBLIC_URL="${FININZEN_PUBLIC_URL:-https://fininzen.nacci.eu}"
SMOKE_ATTEMPTS="${FININZEN_SMOKE_ATTEMPTS:-20}"

if [[ -z "$BRANCH" || "$BRANCH" == -* || "$BRANCH" == *".."* || "$BRANCH" == *"@{"* ]]; then
    echo "deploy-bare-metal: nome branch non valido: ${BRANCH}" >&2
    exit 64
fi
if [[ "$BRANCH" =~ [^A-Za-z0-9._/-] ]] || ! git check-ref-format --branch "$BRANCH" >/dev/null 2>&1; then
    echo "deploy-bare-metal: nome branch non valido: ${BRANCH}" >&2
    exit 64
fi

if [[ -f "$ENV_FILE" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "$ENV_FILE"
    set +a
fi

if [[ "${REFRESH_COOKIE_PATH:-}" != "/fininzen/api/auth/" ]]; then
    echo "deploy-bare-metal: REFRESH_COOKIE_PATH deve essere '/fininzen/api/auth/' in ${ENV_FILE} (trovato '${REFRESH_COOKIE_PATH:-unset}')" >&2
    exit 78
fi

PREV_REV="$(su - fininzen -c "cd ${APP_ROOT} && git rev-parse HEAD")"
echo "deploy-bare-metal: revisione precedente = ${PREV_REV}"

rollback() {
    local exit_code=$?
    trap - ERR
    echo "deploy-bare-metal: errore rilevato, rollback del codice a ${PREV_REV}" >&2
    systemctl stop fininzen-web || true
    systemctl stop fininzen || true
    su - fininzen -c "cd ${APP_ROOT} && git reset --hard && git checkout --detach ${PREV_REV}" || true
    su - fininzen -c "cd ${APP_ROOT} && just install-backend && just migrate-prod && just collectstatic-prod && just build-frontend-prod" || true
    systemctl restart fininzen || true
    systemctl restart fininzen-web || true
    echo "deploy-bare-metal: rollback del codice completato. Il DB SQLite non è stato ripristinato automaticamente." >&2
    exit "$exit_code"
}
trap rollback ERR

su - fininzen -c "cd ${APP_ROOT} && bash scripts/backup_db.sh"
su - fininzen -c "cd ${APP_ROOT} && git fetch origin '${BRANCH}' && git reset --hard && git checkout -B '${BRANCH}' FETCH_HEAD"
su - fininzen -c "cd ${APP_ROOT} && just install-backend && just migrate-prod && just collectstatic-prod && just build-frontend-prod"

install -m 0644 "${APP_ROOT}/deploy/systemd/fininzen.service" "${SYSTEMD_DIR}/fininzen.service"
install -m 0644 "${APP_ROOT}/deploy/systemd/fininzen-web.service" "${SYSTEMD_DIR}/fininzen-web.service"
install -m 0644 "${APP_ROOT}/deploy/systemd/fininzen-refresh-prices.service" "${SYSTEMD_DIR}/fininzen-refresh-prices.service"
install -m 0644 "${APP_ROOT}/deploy/systemd/fininzen-refresh-prices.timer" "${SYSTEMD_DIR}/fininzen-refresh-prices.timer"
install -m 0644 "${APP_ROOT}/deploy/systemd/fininzen-backup.service" "${SYSTEMD_DIR}/fininzen-backup.service"
install -m 0644 "${APP_ROOT}/deploy/systemd/fininzen-backup.timer" "${SYSTEMD_DIR}/fininzen-backup.timer"
install -m 0644 "${APP_ROOT}/deploy/systemd/fininzen-generate-recurring.service" "${SYSTEMD_DIR}/fininzen-generate-recurring.service"
install -m 0644 "${APP_ROOT}/deploy/systemd/fininzen-generate-recurring.timer" "${SYSTEMD_DIR}/fininzen-generate-recurring.timer"
install -m 0644 "${APP_ROOT}/deploy/systemd/fininzen-generate-split-recurring.service" "${SYSTEMD_DIR}/fininzen-generate-split-recurring.service"
install -m 0644 "${APP_ROOT}/deploy/systemd/fininzen-generate-split-recurring.timer" "${SYSTEMD_DIR}/fininzen-generate-split-recurring.timer"
systemctl daemon-reload
systemctl enable fininzen fininzen-web
systemctl enable --now fininzen-refresh-prices.timer
systemctl enable --now fininzen-backup.timer
systemctl enable --now fininzen-generate-recurring.timer
systemctl enable --now fininzen-generate-split-recurring.timer
systemctl restart fininzen
systemctl restart fininzen-web

if command -v caddy >/dev/null 2>&1 && [[ -f /etc/caddy/Caddyfile ]]; then
    caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
    systemctl reload caddy || true
fi

"${APP_ROOT}/scripts/smoke_test.sh" "$PUBLIC_URL" "$SMOKE_ATTEMPTS"
trap - ERR
echo "deploy-bare-metal: completato con successo"
