#!/usr/bin/env bash
#
# backup_offsite.sh — Replica off-site dei backup Postgres di Finnet.
#
# CRIT-08 (CODE_REVIEW.md): il backup locale al VPS è single-point-of-failure
# in scenari di ransomware, FS corruption o perdita del provider. Questo script
# spinge l'ultimo backup verso una destinazione remota.
#
# Configurazione (via /etc/finnet.env oppure environment):
#   BACKUP_DIR              — sorgente locale (default /opt/finnet/backups)
#   OFFSITE_RSYNC_TARGET    — destinazione rsync (es. user@host:/srv/finnet-backups/
#                              o rclone:my-s3:finnet-backups/)
#   OFFSITE_RSYNC_OPTS      — opzioni aggiuntive (default "--archive --compress
#                              --delete-after --bwlimit=2M")
#   OFFSITE_ALERT_EMAIL     — opzionale; se settato, manda mail su failure
#                              tramite `mail` (richiede mailutils/postfix).
#
# Uscita 0 se tutto OK, ≠ 0 se la replica fallisce.
#
# Esempio cron (utente finnet):
#   15 3 * * * /opt/finnet/scripts/backup_offsite.sh >> /opt/finnet/logs/offsite.log 2>&1

set -euo pipefail

ENV_FILE="${ENV_FILE:-/etc/finnet.env}"
if [[ -f "$ENV_FILE" ]]; then
    # shellcheck disable=SC1090
    set -a; source "$ENV_FILE"; set +a
fi

BACKUP_DIR="${BACKUP_DIR:-/opt/finnet/backups}"
OFFSITE_RSYNC_TARGET="${OFFSITE_RSYNC_TARGET:-}"
OFFSITE_RSYNC_OPTS="${OFFSITE_RSYNC_OPTS:---archive --compress --delete-after --bwlimit=2M}"
OFFSITE_ALERT_EMAIL="${OFFSITE_ALERT_EMAIL:-}"

log() { printf '[%s] %s\n' "$(date -u +%FT%TZ)" "$*"; }

fail() {
    log "ERROR: $*"
    if [[ -n "$OFFSITE_ALERT_EMAIL" ]] && command -v mail >/dev/null 2>&1; then
        printf '%s\n' "$*" | mail -s "[Finnet] off-site backup failed" \
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

# Conta i backup presenti — se 0, lo script di backup locale non è ancora girato.
# Cerca i dump Postgres (custom-format, eventualmente cifrati .enc) prodotti da
# deploy.sh / pg_dump, non più i vecchi file .sqlite3.
mapfile -t BACKUPS < <(find "$BACKUP_DIR" -maxdepth 1 -type f \
    \( -name '*.dump' -o -name '*.dump.enc' \) -print)
if [[ ${#BACKUPS[@]} -eq 0 ]]; then
    fail "Nessun backup Postgres (*.dump/*.dump.enc) in $BACKUP_DIR — il job locale ha fallito?"
fi

log "Off-site sync: ${#BACKUPS[@]} file da $BACKUP_DIR → $OFFSITE_RSYNC_TARGET"

# shellcheck disable=SC2086
if ! rsync $OFFSITE_RSYNC_OPTS "$BACKUP_DIR/" "$OFFSITE_RSYNC_TARGET"; then
    fail "rsync exit code $? — destinazione $OFFSITE_RSYNC_TARGET"
fi

log "OK: replica off-site completata"
