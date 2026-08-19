#!/usr/bin/env bash
#
# Backup PostgreSQL dello stack Docker: pg_dump custom-format, verifica con
# pg_restore --list, rotazione e cifratura at-rest opzionale.
#
# Variabili lette da deploy/docker/production/.env oppure dall'ambiente:
#   BACKUP_DIR              directory di destinazione (default <repo>/backups)
#   BACKUP_RETENTION_DAYS   retention in giorni (default 7)
#   BACKUP_ENC_PASSPHRASE   se impostata, cifra il dump con AES-256
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${ENV_FILE:-${REPO_ROOT}/deploy/docker/production/.env}"
COMPOSE_FILE="${COMPOSE_FILE:-${REPO_ROOT}/deploy/docker/production/compose.yml}"

COMPOSE=(docker compose)
if [[ -f "$ENV_FILE" ]]; then
    # shellcheck disable=SC1090
    set -a; source "$ENV_FILE"; set +a
    COMPOSE+=(--env-file "$ENV_FILE")
fi
COMPOSE+=(-f "$COMPOSE_FILE")
BACKUP_DIR="${BACKUP_DIR:-${REPO_ROOT}/backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-7}"
TS="$(date -u +%Y-%m-%d_%H%M%S)"
OUT="${BACKUP_DIR}/fininzen_${TS}.dump"
TMP="${OUT}.tmp"

mkdir -p "$BACKUP_DIR"
trap 'rm -f "$TMP"' EXIT

"${COMPOSE[@]}" exec -T postgres \
    sh -c 'pg_dump -U "$POSTGRES_USER" -Fc "$POSTGRES_DB"' > "$TMP"

if [[ ! -s "$TMP" ]]; then
    echo "backup_postgres: pg_dump ha prodotto un file vuoto" >&2
    exit 1
fi

"${COMPOSE[@]}" exec -T postgres pg_restore --list < "$TMP" >/dev/null
mv "$TMP" "$OUT"

if [[ -n "${BACKUP_ENC_PASSPHRASE:-}" ]]; then
    openssl enc -aes-256-cbc -pbkdf2 -salt -pass env:BACKUP_ENC_PASSPHRASE \
        -in "$OUT" -out "${OUT}.enc"
    rm -f "$OUT"
    OUT="${OUT}.enc"
fi

echo "backup_postgres: scritto $OUT (dump verificato)"

find "$BACKUP_DIR" -maxdepth 1 -type f \
    \( -name 'fininzen_*.dump' -o -name 'fininzen_*.dump.enc' \) \
    -mtime "+${RETENTION_DAYS}" -delete 2>/dev/null \
    || echo "backup_postgres: warning — pulizia backup vecchi fallita"
