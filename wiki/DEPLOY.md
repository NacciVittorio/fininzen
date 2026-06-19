# Guida Deploy — VPS Ubuntu 24.04

Stack: Django 6.0 + Gunicorn · React 19 (build statica) · Caddy · systemd · PostgreSQL

> **⚠️ Database: la produzione ora richiede PostgreSQL.** L'app si rifiuta di
> avviarsi con `DEBUG=0` su SQLite o senza `FIELD_ENCRYPTION_KEYS`. Le sezioni
> SQLite qui sotto restano valide solo per lo **sviluppo locale**. Per la
> migrazione dei dati esistenti e la nuova procedura di backup/restore vedi
> **[POSTGRES_MIGRATION.md](POSTGRES_MIGRATION.md)**.

## 1. Primo accesso SSH

```bash
ssh root@<VPS_IP>
```

## 2. Swap file (fondamentale con 1 GB RAM)

Con 1 GB di RAM, lo swap evita che gunicorn venga killato durante il refresh prezzi yfinance:

```bash
fallocate -l 1G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

Verifica:

```bash
# Deve mostrare 1G nella riga Swap
free -h
```

## 3. Aggiornamento sistema e dipendenze

```bash
apt update && apt upgrade -y

# Strumenti base
apt install -y git python3-venv python3-pip curl sqlite3 ufw

# Node.js 22 LTS (il repo Ubuntu ha Node 18 che non è supportato dal progetto)
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs

# Caddy (reverse proxy — già configurato nel progetto)
apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
  | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
  | tee /etc/apt/sources.list.d/caddy-stable.list
apt update && apt install -y caddy
```

## 4. Utente dedicato per l'app

Non eseguire l'app come root. Creiamo un utente `finnet`:

```bash
useradd -m -s /bin/bash finnet
usermod -aG finnet finnet
```

## 5. Upload del codice sul VPS

Il codice viene clonato direttamente da GitHub sul VPS. Per un repo privato servono le credenziali — il modo più sicuro è una **Deploy Key** (una chiave SSH read-only dedicata al VPS).

### 5a. Crea una Deploy Key sul VPS

```bash
# Genera una chiave SSH dedicata (come root)
mkdir -p /home/finnet/.ssh
ssh-keygen -t ed25519 -C "finnet-vps" -f /home/finnet/.ssh/deploy_key -N ""
chown -R finnet:finnet /home/finnet/.ssh
chmod 700 /home/finnet/.ssh

# Mostra la chiave pubblica — copiala
cat /home/finnet/.ssh/deploy_key.pub
```

### 5b. Aggiungi la Deploy Key su GitHub

1. Vai su `https://github.com/<tuo-utente>/<tuo-repo>/settings/keys`
2. Clicca **Add deploy key**
3. Incolla la chiave pubblica copiata sopra
4. Lascia **Allow write access** deselezionato (read-only è sufficiente)

### 5c. Configura SSH per usare la deploy key

```bash
su - finnet
cat > ~/.ssh/config << 'EOF'
Host github.com
  IdentityFile ~/.ssh/deploy_key
  IdentitiesOnly yes
EOF
```

### 5d. Clona il repository

```bash
mkdir -p /opt/finnet
chown finnet:finnet /opt/finnet

# Ancora come utente finnet
su - finnet
git clone git@github.com:NacciVittorio/finnet.git /opt/finnet
exit  # torna a root
```

## 6. Variabili d'ambiente

Copia il template versionato e modifica i valori specifici del server:

```bash
cp /opt/finnet/.env.example /etc/finnet.env
vi /etc/finnet.env
less /etc/finnet.env
```

Imposta `DJANGO_SECRET_KEY`. Se usi un dominio diverso da `finnet.nacci.eu`,
aggiorna anche `DJANGO_ALLOWED_HOSTS`, `CORS_ALLOWED_ORIGINS`,
`CSRF_TRUSTED_ORIGINS` e `Caddyfile`.

**Generare una SECRET_KEY sicura** — esegui questo sul VPS (prima di salvare il file):

```bash
python3 -c "import secrets; print(secrets.token_urlsafe(50))"
```

Copia l'output e incollalo come valore di `DJANGO_SECRET_KEY`.

Proteggi il file:

```bash
chmod 600 /etc/finnet.env
chown finnet:finnet /etc/finnet.env
```

## 7. Setup Backend e Frontend (virtualenv + dipendenze)

```bash
su - finnet
cd /opt/finnet

just install
```

## 8. Migrazione database, statici e build frontend

```bash
su - finnet
cd /opt/finnet
just migrate-prod
just collectstatic-prod
just build-frontend-prod
```

---

## 9. Trasferire il database esistente dal Mac

Se hai già dati nel tuo `db.sqlite3` locale, copialo sul VPS dal **Mac**:

```bash
rsync -avz \
  /path/locale/finnet/db.sqlite3 \
  root@<VPS_IP>:/opt/finnet/db.sqlite3

# Correggi i permessi
ssh root@<VPS_IP> "chown finnet:finnet /opt/finnet/db.sqlite3 && chmod 640 /opt/finnet/db.sqlite3"
```

> Se preferisci partire da zero con il database vuoto, salta questo passaggio.

## 11. Servizio systemd per Gunicorn

Assicurati di essere root (se sei ancora come `finnet`, esegui `exit` prima).

Crea il file di servizio:

```bash
vi /etc/systemd/system/finnet.service
```

Contenuto:

```ini
[Unit]
Description=finnet — Django via Gunicorn
After=network.target

[Service]
User=finnet
Group=finnet
WorkingDirectory=/opt/finnet
EnvironmentFile=/etc/finnet.env
Environment="STATIC_ROOT=/opt/finnet/staticfiles"
ExecStartPre=/opt/finnet/scripts/rotate_logs.sh
ExecStart=/opt/finnet/venv/bin/gunicorn finnet.wsgi \
    --bind 127.0.0.1:8000 \
    --workers 2 \
    --timeout 120 \
    --access-logfile /opt/finnet/logs/gunicorn_access.log \
    --error-logfile /opt/finnet/logs/gunicorn_error.log
Restart=always
RestartSec=5s

# Hardening — defense in depth
ProtectSystem=strict
ProtectHome=yes
NoNewPrivileges=yes
PrivateTmp=yes
ProtectClock=yes
ProtectKernelTunables=yes
ProtectKernelModules=yes
ProtectControlGroups=yes
RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX
RestrictNamespaces=yes
LockPersonality=yes
MemoryDenyWriteExecute=yes
RestrictRealtime=yes
RestrictSUIDSGID=yes
# SQLite WAL crea db.sqlite3-wal e db.sqlite3-shm accanto al database.
ReadWritePaths=/opt/finnet

[Install]
WantedBy=multi-user.target
```

Verifica il file di servizio:
```bash
less /etc/systemd/system/finnet.service
```

Crea le cartelle richieste da Gunicorn, `collectstatic` e backup:

```bash
mkdir -p /opt/finnet/backups
mkdir -p /opt/finnet/logs
mkdir -p /opt/finnet/staticfiles

chown -R finnet:finnet /opt/finnet/backups
chown -R finnet:finnet /opt/finnet/logs
chown -R finnet:finnet /opt/finnet/staticfiles

systemctl daemon-reload
systemctl enable finnet
systemctl start finnet

# Verifica che parta
systemctl status finnet
```

## 13. Configurare Caddy

Usa un solo processo Caddy, gestito da systemd. Non usare `caddy start` insieme
al servizio: la [documentazione Caddy](https://caddyserver.com/docs/command-line#caddy-start)
indica esplicitamente che non è il flusso corretto quando Caddy gira come
servizio di sistema.

```bash
# Audit: deve restare un solo listener Caddy controllato da systemd.
systemctl status caddy --no-pager
systemctl cat caddy
pgrep -af caddy
ss -ltnp | grep -E ':(80|443|2019)\b'
```

Se l'audit mostra processi Caddy fuori da systemd, ferma il servizio e termina
gli orfani in modo graceful prima di reinstallare la configurazione:

```bash
cp -a /etc/caddy/Caddyfile /etc/caddy/Caddyfile.bak
systemctl stop caddy
pgrep -af caddy

# Arresto graceful dell'eventuale istanza avviata fuori da systemd.
caddy stop --config /opt/finnet/Caddyfile 2>/dev/null || true

# Fallback: esegui solo per gli eventuali PID rimasti.
kill -TERM <PID_ORFANO>

# Le porte devono essere libere prima del riavvio.
ss -ltnp | grep -E ':(80|443|2019)\b' || true
```

Installa il `Caddyfile` versionato e avvia esclusivamente il
[servizio systemd](https://caddyserver.com/docs/running#linux-service):

```bash
caddy validate --config /opt/finnet/Caddyfile --adapter caddyfile
install -m 0644 /opt/finnet/Caddyfile /etc/caddy/Caddyfile
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
systemctl enable --now caddy
systemctl reload caddy
```

## 15. Test finale

Dal browser del tuo **iPhone** (o Mac), apri:

```
http://<VPS_IP>
```

Dovresti vedere il login dell'app. Le API rispondono su `http://<VPS_IP>/api/`.

Per controllare i log in tempo reale:

```bash
journalctl -u finnet -f          # log gunicorn
tail -f /opt/finnet/logs/gunicorn_error.log
```

Verifica anche 20 risposte pubbliche consecutive per HTML, manifest e asset:

```bash
/opt/finnet/scripts/smoke_test.sh https://finnet.nacci.eu 20
```

## Backup automatico del database

`cp` su un file SQLite live non è atomico se il DB è in scrittura (specialmente
con journal WAL): può produrre un backup corrotto. Usa invece `sqlite3 .backup`
che esegue una copia consistente leggendo via il driver.

Crea lo script di backup:

```bash
cat > /opt/finnet/scripts/backup_db.sh << 'EOF'
#!/bin/bash
set -euo pipefail

DB="/opt/finnet/db.sqlite3"
BACKUP_DIR="/opt/finnet/backups"
STAMP="$(date +%Y%m%d_%H%M%S)"
DEST="$BACKUP_DIR/db.sqlite3.backup.$STAMP"

mkdir -p "$BACKUP_DIR"

sqlite3 "$DB" ".backup '$DEST'"

# Integrity check sul backup
if sqlite3 "$DEST" "PRAGMA integrity_check;" | head -1 | grep -q '^ok$'; then
    echo "backup_db: $DEST OK"
else
    echo "backup_db: $DEST FAILED integrity_check" >&2
    rm -f "$DEST"
    exit 1
fi

# Rotazione: tieni ultimi 7 giorni
find "$BACKUP_DIR" -name 'db.sqlite3.backup.*' -mtime +7 -delete \
    || echo "backup_db: cleanup older backups failed"
EOF
chmod +x /opt/finnet/scripts/backup_db.sh
chown finnet:finnet /opt/finnet/scripts/backup_db.sh
```

Aggiungi al crontab di `finnet`:

```bash
crontab -u finnet -e
```

```cron
0 3 * * * /opt/finnet/scripts/backup_db.sh >> /opt/finnet/logs/backup.log 2>&1
```

Questo fa un backup ogni notte alle 3:00 con `sqlite3 .backup` (consistente),
verifica l'integrità del file prodotto e mantiene gli ultimi 7 giorni.

### Replica off-site (consigliata)

> **CRIT-08 — single point of failure**: il backup sopra è solo locale al VPS.
> In caso di ransomware, FS corruption o perdita del provider, i backup vanno
> persi insieme al database. Per la produzione configura una replica off-site.

Lo script `scripts/backup_offsite.sh` spinge i backup su un secondo host (via
`rsync` SSH) o su uno storage S3-compatible (via `rclone`). Configura in
`/etc/finnet.env`:

```bash
OFFSITE_RSYNC_TARGET="finnet-backup@altro.vps.example:/srv/finnet-backups/"
# In alternativa, con rclone:
# OFFSITE_RSYNC_TARGET="rclone:my-s3-bucket:finnet-backups/"
OFFSITE_RSYNC_OPTS="--archive --compress --delete-after --bwlimit=2M"
OFFSITE_ALERT_EMAIL="ops@example.com"   # opzionale: alert su failure
```

Schedula 15 minuti dopo il backup locale:

```cron
15 3 * * * /opt/finnet/scripts/backup_offsite.sh >> /opt/finnet/logs/offsite.log 2>&1
```

Per `rsync` SSH genera una coppia di chiavi dedicata in `/var/lib/finnet/.ssh/`
con il flag `command=`/`restrict` nell'`authorized_keys` del lato remoto, in
modo che la chiave possa solo ricevere i file di backup.

**Restore test settimanale** (opzionale ma raccomandato): aggiungi un job che
prende l'ultimo backup off-site, lo ripristina in un file scratch e ne verifica
l'integrità con `sqlite3 .backup` + `PRAGMA integrity_check;`. Se fallisce,
manda mail.

---

## Aggiornare l'app in futuro

Ogni volta che fai un `git push` dal Mac, aggiorna il VPS così:

```bash
su - finnet
cd /opt/finnet
just deploy-prod main
exit
```

Se preferisci passare dal wrapper root:

```bash
/opt/finnet/scripts/deploy.sh main
```

Il wrapper valida e installa `/etc/caddy/Caddyfile`, ricarica Caddy tramite
systemd ed esegue automaticamente lo smoke test pubblico.

---

## Prossimi passi (opzionali)

- **Dominio + HTTPS**: compra un dominio, punta l'A record all'IP del VPS, modifica il `Caddyfile` mettendo il dominio al posto di `:80` — Caddy ottiene il certificato Let's Encrypt automaticamente.
- **Notifiche email**: configura `DJANGO_EMAIL_*` per ricevere alert sugli errori.

## Rate limiting in produzione

DRF `ScopedRateThrottle` (login, register, search_ticker, view_as_attempt, grant) usa la cache di Django. Con la cache di default (`LocMemCache`) ogni worker gunicorn mantiene il proprio bucket: con 2 worker il limite effettivo raddoppia.

Per applicare il limite in modo condiviso fra worker:

```bash
# 1. installa Redis sul VPS
apt install -y redis-server
systemctl enable --now redis-server

# 2. installa il client Python (non è in requirements.txt — opzionale)
sudo -u finnet /opt/finnet/venv/bin/pip install redis

# 3. esporta REDIS_URL nel service file di gunicorn
#    /etc/systemd/system/finnet.service → [Service] → Environment=
Environment=REDIS_URL=redis://127.0.0.1:6379/0

systemctl daemon-reload
systemctl restart finnet
```

`finnet/settings.py` configura automaticamente `CACHES["default"]` su Redis quando `REDIS_URL` è impostato (nessuna modifica al codice).

**Difesa in profondità**: il throttling DRF è applicativo. Per `/api/auth/*` è consigliabile affiancarlo a un rate-limit a livello di reverse proxy (Caddy `rate_limit`) o a `fail2ban` sui log nginx/caddy per bloccare temporaneamente gli IP che superano una soglia.



root@ubuntu:/opt/finnet/scripts# sudo cat /etc/sudoers | grep -A2 finnet
finnet ALL=(ALL) NOPASSWD: /bin/systemctl restart finnet
finnet ALL=(ALL) NOPASSWD: /bin/systemctl reload caddy
root@ubuntu:/opt/finnet/scripts# sudo visudo -c
/etc/sudoers: parsed OK
/etc/sudoers.d/90-cloud-init-users: parsed OK
/etc/sudoers.d/README: parsed OK
