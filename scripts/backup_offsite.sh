#!/usr/bin/env bash
#
# backup_offsite.sh — Replica off-site dei dump Postgres prodotti da backup_db.sh.
#
# Il backup locale alla VM è single-point-of-failure (ransomware, corruzione FS,
# perdita del provider). Questo script spinge i dump verso una destinazione
# remota via rsync.
#
# Configurazione (via deploy/docker/production/.env oppure environment):
#   BACKUP_DIR              — sorgente locale (default <repo>/backups)
#   OFFSITE_RSYNC_TARGET    — destinazione rsync (es. user@host:/srv/fininzen-backups/)
#   OFFSITE_RSYNC_OPTS      — opzioni aggiuntive (default "--archive --compress
#                              --delete-after --bwlimit=2M")
#   OFFSITE_ALERT_EMAIL     — opzionale; se settato, manda mail su failure
#                              tramite `mail` (richiede mailutils/postfix).
#
# Uscita 0 se tutto OK, ≠ 0 se la replica fallisce.
#
# Esempio cron (utente dockerapp), dopo backup_db.sh:
#   45 3 * * * /opt/fininzen/scripts/backup_offsite.sh >> /home/dockerapp/offsite.log 2>&1
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${ENV_FILE:-${REPO_ROOT}/deploy/docker/production/.env}"
if [[ -f "$ENV_FILE" ]]; then
    # shellcheck disable=SC1090
    set -a; source "$ENV_FILE"; set +a
fi

BACKUP_DIR="${BACKUP_DIR:-${REPO_ROOT}/backups}"
OFFSITE_RSYNC_TARGET="${OFFSITE_RSYNC_TARGET:-}"
OFFSITE_RSYNC_OPTS="${OFFSITE_RSYNC_OPTS:---archive --compress --delete-after --bwlimit=2M}"
OFFSITE_ALERT_EMAIL="${OFFSITE_ALERT_EMAIL:-}"

log() { printf '[%s] %s\n' "$(date -u +%FT%TZ)" "$*"; }

fail() {
    log "ERROR: $*"
    if [[ -n "$OFFSITE_ALERT_EMAIL" ]] && command -v mail >/dev/null 2>&1; then
        printf '%s\n' "$*" | mail -s "[Fininzen] off-site backup failed" \
            "$OFFSITE_ALERT_EMAIL" || true
    fi
    exit 1
}

if [[ -z "$OFFSITE_RSYNC_TARGET" ]]; then
    fail "OFFSITE_RSYNC_TARGET non impostato — configurare in $ENV_FILE"
fi

if [[ ! -d "$BACKUP_DIR" ]]; then
    fail "BACKUP_DIR '$BACKUP_DIR' non esiste o non è una directory"
fi

# Cerca i dump Postgres (custom-format, eventualmente cifrati .enc) prodotti da
# backup_db.sh.
mapfile -t BACKUPS < <(find "$BACKUP_DIR" -maxdepth 1 -type f \
    \( -name '*.dump' -o -name '*.dump.enc' \) -print)
if [[ ${#BACKUPS[@]} -eq 0 ]]; then
    fail "Nessun backup Postgres (*.dump/*.dump.enc) in $BACKUP_DIR — backup_db.sh ha già girato?"
fi

log "Off-site sync: ${#BACKUPS[@]} file da $BACKUP_DIR → $OFFSITE_RSYNC_TARGET"

# shellcheck disable=SC2086
if ! rsync $OFFSITE_RSYNC_OPTS "$BACKUP_DIR/" "$OFFSITE_RSYNC_TARGET"; then
    fail "rsync exit code $? — destinazione $OFFSITE_RSYNC_TARGET"
fi

log "OK: replica off-site completata"
