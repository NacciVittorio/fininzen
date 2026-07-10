#!/usr/bin/env bash
#
# backup_db.sh — Backup consistente del database SQLite (deploy bare-metal,
# systemd). Usa `sqlite3 .backup` (copia coerente anche in modalità WAL, senza
# fermare l'app) seguito da `PRAGMA integrity_check`, con compressione,
# rotazione e cifratura at-rest opzionale.
#
# Variabili (lette da /etc/fininzen.env se presente, oppure dall'ambiente):
#   DB_PATH                 percorso del file SQLite (default <repo>/db.sqlite3)
#   BACKUP_DIR              dove scrivere i backup (default <repo>/backups)
#   BACKUP_RETENTION_DAYS   giorni di retention (default 7)
#   BACKUP_ENC_PASSPHRASE   se impostata, cifra il backup con AES-256 (openssl)
#
# Esempio cron (utente fininzen):
#   0 3 * * * /opt/fininzen/scripts/backup_db.sh >> /opt/fininzen/logs/backup.log 2>&1
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# Carica l'ambiente di produzione se presente (per DB_PATH ecc.). Nel cron
# l'EnvironmentFile di systemd non è disponibile, quindi lo sorgiamo qui.
ENV_FILE="${ENV_FILE:-/etc/fininzen.env}"
if [[ -f "$ENV_FILE" ]]; then
    # shellcheck disable=SC1090
    set -a; source "$ENV_FILE"; set +a
fi

DB_PATH="${DB_PATH:-${REPO_ROOT}/db.sqlite3}"
BACKUP_DIR="${BACKUP_DIR:-${REPO_ROOT}/backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-7}"
TS="$(date -u +%Y%m%d_%H%M%S)"

if [[ ! -f "$DB_PATH" ]]; then
    echo "backup_db: database non trovato: $DB_PATH" >&2
    exit 1
fi

mkdir -p "$BACKUP_DIR"
OUT="${BACKUP_DIR}/fininzen_${TS}.sqlite3"

# Copia consistente: `.backup` gestisce correttamente WAL/-shm mentre l'app scrive.
sqlite3 "$DB_PATH" ".backup '${OUT}'"

# Verifica d'integrità sul backup appena creato (non sull'originale in uso).
CHECK="$(sqlite3 "$OUT" 'PRAGMA integrity_check;')"
if [[ "$CHECK" != "ok" ]]; then
    echo "backup_db: integrity_check FALLITO su $OUT: $CHECK" >&2
    exit 1
fi

# Compressione.
gzip -f "$OUT"
OUT="${OUT}.gz"

# Cifratura at-rest opzionale.
if [[ -n "${BACKUP_ENC_PASSPHRASE:-}" ]]; then
    openssl enc -aes-256-cbc -pbkdf2 -salt -pass env:BACKUP_ENC_PASSPHRASE \
        -in "$OUT" -out "${OUT}.enc"
    rm -f "$OUT"
    OUT="${OUT}.enc"
fi

echo "backup_db: scritto $OUT (integrity_check: ok)"

# Rotazione: elimina i backup più vecchi della retention (non-fatale).
find "$BACKUP_DIR" -maxdepth 1 -type f \
    \( -name 'fininzen_*.sqlite3.gz' -o -name 'fininzen_*.sqlite3.gz.enc' \) \
    -mtime "+${RETENTION_DAYS}" -delete 2>/dev/null \
    || echo "backup_db: warning — pulizia backup vecchi fallita"
