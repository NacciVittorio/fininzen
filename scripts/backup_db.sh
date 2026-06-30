#!/usr/bin/env bash
#
# backup_db.sh — Dump del database Postgres dal container (formato custom), con
# rotazione e cifratura at-rest opzionale. Pensato per il cron dell'host nello
# stack Docker (vedi wiki/DOCKER_DEPLOY.md §8).
#
# Variabili (lette da deploy/docker/production/.env oppure dall'ambiente):
#   BACKUP_DIR              dove scrivere i dump (default <repo>/backups)
#   BACKUP_RETENTION_DAYS   giorni di retention (default 14)
#   BACKUP_ENC_PASSPHRASE   se impostata, cifra il dump con AES-256 (openssl)
#
# Esempio cron (utente dockerapp):
#   30 3 * * * /opt/fininzen/scripts/backup_db.sh >> /home/dockerapp/backup_db.log 2>&1
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${ENV_FILE:-${REPO_ROOT}/deploy/docker/production/.env}"
COMPOSE=(docker compose --env-file "$ENV_FILE" -f "${REPO_ROOT}/deploy/docker/production/compose.yml")

if [[ -f "$ENV_FILE" ]]; then
    # shellcheck disable=SC1090
    set -a; source "$ENV_FILE"; set +a
fi

BACKUP_DIR="${BACKUP_DIR:-${REPO_ROOT}/backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
TS="$(date -u +%Y%m%d_%H%M%S)"

mkdir -p "$BACKUP_DIR"
OUT="${BACKUP_DIR}/fininzen_${TS}.dump"

# pg_dump custom-format, usando le credenziali interne al container postgres
# (POSTGRES_USER/POSTGRES_DB sono già nel suo ambiente).
"${COMPOSE[@]}" exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -Fc "$POSTGRES_DB"' > "$OUT"

# Cifratura at-rest opzionale.
if [[ -n "${BACKUP_ENC_PASSPHRASE:-}" ]]; then
    openssl enc -aes-256-cbc -pbkdf2 -salt -pass env:BACKUP_ENC_PASSPHRASE \
        -in "$OUT" -out "${OUT}.enc"
    rm -f "$OUT"
    OUT="${OUT}.enc"
fi

echo "backup_db: scritto $OUT"

# Rotazione: elimina i dump più vecchi della retention (non-fatale).
find "$BACKUP_DIR" -maxdepth 1 -type f \( -name '*.dump' -o -name '*.dump.enc' \) \
    -mtime "+${RETENTION_DAYS}" -delete 2>/dev/null \
    || echo "backup_db: warning — pulizia dump vecchi fallita"
