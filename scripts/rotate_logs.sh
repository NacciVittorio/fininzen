#!/bin/bash
set -euo pipefail
# Rotazione log prima dell'avvio del server (ExecStartPre in systemd).

LOGS_DIR="$(cd "$(dirname "$0")/.." && pwd)/logs"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

mkdir -p "$LOGS_DIR"
exec 9>"$LOGS_DIR/.rotate.lock"
flock -n 9 || exit 0

for log_file in gunicorn_access.log gunicorn_error.log django.log; do
    src="$LOGS_DIR/$log_file"
    if [ -f "$src" ]; then
        base="${log_file%.log}"
        mv "$src" "$LOGS_DIR/${base}_${TIMESTAMP}.log"
    fi
done

# Elimina log gunicorn più vecchi di 7 giorni (non-fatale se find fallisce)
find "$LOGS_DIR" -name "*_*.log" -mtime +7 -delete \
    || echo "rotate_logs: warning — cleanup di log vecchi fallito (permessi?)"
