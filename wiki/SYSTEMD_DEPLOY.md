# Guida Deploy bare-metal — VPS Ubuntu 24.04 (systemd, SQLite, senza Docker)

Stack: **Django 6 + Gunicorn** · **Next.js SSR** (`next start`) · **Caddy** (systemd host) · **systemd** · **SQLite3**

> Questo è il runbook del deploy pubblico attuale. Su una VPS piccola
> (1 vCPU / 1 GB RAM / 10 GB disco) evita il costo di PostgreSQL, Redis e dei
> container, usando SQLite e servizi systemd. Lo stack Docker/PostgreSQL rimane
> un'alternativa supportata e testata in sviluppo; usa la sua
> [guida dedicata](DOCKER_DEPLOY.md) senza mescolare i due percorsi.

## 1. Swap file (fondamentale con 1 GB RAM)

Lo swap evita che gunicorn venga killato durante il refresh prezzi yfinance:

```bash
fallocate -l 1G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
free -h   # deve mostrare 1G alla riga Swap
```

## 2. Sistema e dipendenze

```bash
apt update && apt upgrade -y
apt install -y git python3-venv python3-pip curl sqlite3 ufw

# Node.js 24 LTS (il repo Ubuntu ha Node 18, non supportato)
curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
apt install -y nodejs

# just (task runner usato dalle recipe *-prod)
curl --proto '=https' --tlsv1.2 -sSf https://just.systems/install.sh | bash -s -- --to /usr/local/bin

# Caddy (se non già presente sull'host)
apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
  | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
  | tee /etc/apt/sources.list.d/caddy-stable.list
apt update && apt install -y caddy
```

## 3. Utente dedicato

```bash
useradd -m -s /bin/bash fininzen
```

## 4. Codice sul VPS

Clona il repo in `/opt/fininzen` (usa una Deploy Key SSH read-only per il repo
privato — vedi la vecchia procedura in git history se serve):

```bash
mkdir -p /opt/fininzen && chown fininzen:fininzen /opt/fininzen
su - fininzen -c "git clone git@gitlab.com:fininzengroup/fininzen.git /opt/fininzen"
```

## 5. Variabili d'ambiente

```bash
cp /opt/fininzen/.env.example /etc/fininzen.env
python3 -c "import secrets; print(secrets.token_urlsafe(50))"   # → DJANGO_SECRET_KEY
python3 -c "import os,base64; print(base64.b64encode(os.urandom(32)).decode())"  # → FIELD_ENCRYPTION_KEYS
vi /etc/fininzen.env
chmod 600 /etc/fininzen.env && chown fininzen:fininzen /etc/fininzen.env
```

Valori chiave per il deploy SQLite bare-metal (in `/etc/fininzen.env`):

```ini
DJANGO_DEBUG=0
DJANGO_SECRET_KEY=<generata sopra>
DJANGO_ALLOWED_HOSTS=fininzen.nacci.eu
FIELD_ENCRYPTION_KEYS=<generata sopra>
# SQLite in produzione — opt-in esplicito, altrimenti l'app rifiuta il boot:
ALLOW_SQLITE_IN_PRODUCTION=1
DB_PATH=/opt/fininzen/db.sqlite3
# Necessario per il silent refresh dietro Caddy col path prefissato:
REFRESH_COOKIE_PATH=/fininzen/api/auth/
# Pubblico: apre il client email dell'utente da Impostazioni → About; non invia
# email dal VPS. Sostituisci con il tuo indirizzo reale.
NEXT_PUBLIC_CONTACT_EMAIL=assistenza@example.com
```

> Redis è **opzionale** (serve solo per il throttle condiviso fra worker). Su 1 GB
> conviene ometterlo: senza `REDIS_URL` la cache usa `LocMemCache` in-process.

## 6. Build backend + frontend + database

```bash
su - fininzen
cd /opt/fininzen
just install                 # venv Python + npm install
just migrate-prod            # applica le migrazioni su SQLite
just collectstatic-prod      # → /opt/fininzen/staticfiles
# Le NEXT_PUBLIC_* devono essere presenti durante la build: vengono inlined nel
# bundle del browser (incluso NEXT_PUBLIC_CONTACT_EMAIL).
set -a; . /etc/fininzen.env; set +a; just build-frontend-prod
mkdir -p logs backups
exit
```

Se hai già dati nel `db.sqlite3` locale (Mac), copialo prima delle migrazioni:

```bash
rsync -avz /path/locale/db.sqlite3 root@<VPS_IP>:/opt/fininzen/db.sqlite3
ssh root@<VPS_IP> "chown fininzen:fininzen /opt/fininzen/db.sqlite3 && chmod 640 /opt/fininzen/db.sqlite3"
```

## 7. Servizi systemd

Le unit sono versionate in `deploy/systemd/`. Installa e avvia (come root):

```bash
install -m 0644 /opt/fininzen/deploy/systemd/fininzen.service              /etc/systemd/system/
install -m 0644 /opt/fininzen/deploy/systemd/fininzen-web.service          /etc/systemd/system/
install -m 0644 /opt/fininzen/deploy/systemd/fininzen-refresh-prices.service /etc/systemd/system/
install -m 0644 /opt/fininzen/deploy/systemd/fininzen-refresh-prices.timer   /etc/systemd/system/
install -m 0644 /opt/fininzen/deploy/systemd/fininzen-backup.service        /etc/systemd/system/
install -m 0644 /opt/fininzen/deploy/systemd/fininzen-backup.timer          /etc/systemd/system/
install -m 0644 /opt/fininzen/deploy/systemd/fininzen-generate-recurring.service /etc/systemd/system/
install -m 0644 /opt/fininzen/deploy/systemd/fininzen-generate-recurring.timer   /etc/systemd/system/
install -m 0644 /opt/fininzen/deploy/systemd/fininzen-generate-split-recurring.service /etc/systemd/system/
install -m 0644 /opt/fininzen/deploy/systemd/fininzen-generate-split-recurring.timer   /etc/systemd/system/

systemctl daemon-reload
systemctl enable --now fininzen              # gunicorn su 127.0.0.1:8001
systemctl enable --now fininzen-web          # next start su 127.0.0.1:3000
systemctl enable --now fininzen-refresh-prices.timer   # refresh prezzi orario
systemctl enable --now fininzen-backup.timer           # backup SQLite giornaliero
systemctl enable --now fininzen-generate-recurring.timer   # genera spese ricorrenti giornaliero
systemctl enable --now fininzen-generate-split-recurring.timer   # genera spese Split ricorrenti giornaliero

systemctl status fininzen fininzen-web --no-pager
```

- `fininzen.service` — gunicorn (WSGI), 2 worker, `ReadWritePaths=/opt/fininzen`
  (SQLite WAL crea `db.sqlite3-wal`/`-shm` accanto al DB).
- `fininzen-web.service` — Next.js SSR, heap capato a 384 MB (`NODE_OPTIONS`),
  `DJANGO_ORIGIN=http://127.0.0.1:8001` per le fetch server-side.
- `fininzen-refresh-prices.{service,timer}` — `manage.py refresh_asset_prices`
  ogni ora (`Nice=10`, `IOSchedulingClass=idle`).
- `fininzen-backup.{service,timer}` — backup SQLite consistente ogni giorno,
  con recupero dell'esecuzione mancata e jitter di 15 minuti.
- `fininzen-generate-recurring.{service,timer}` — `manage.py generate_recurring_expenses`
  una volta al giorno (`Persistent=true`, recupera l'esecuzione mancata se il VPS
  era spento); genera le `Expense` mancanti per tutte le `RecurringExpense` attive.
- `fininzen-generate-split-recurring.{service,timer}` — `manage.py generate_split_recurring_expenses`,
  stesso schema del timer sopra ma per le `SplitRecurringExpense` (Split/SplitWise);
  prima di questo timer l'unico modo di generarle era `POST /api/split/recurring/generate/`
  quando un utente apriva la tab Split.

## 8. Caddy (site-block sull'host)

Il VPS usa un unico Caddy gestito da systemd. Aggiungi il site-block di fininzen
al Caddyfile host — **senza sovrascrivere** gli altri domini:

```bash
# Copia il contenuto di deploy/caddy/fininzen.Caddyfile nel Caddyfile host,
# accanto agli altri site-block:
cat /opt/fininzen/deploy/caddy/fininzen.Caddyfile   # copialo dentro /etc/caddy/Caddyfile

# L'utente caddy deve poter leggere gli static:
chmod 755 /opt/fininzen && chmod -R a+rX /opt/fininzen/staticfiles

caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
systemctl reload caddy
```

Caddy ottiene automaticamente il certificato Let's Encrypt per `fininzen.nacci.eu`
e instrada: `/fininzen/api/*` → `127.0.0.1:8001` (Django), `/static/*` dal
filesystem, tutto il resto → `127.0.0.1:3000` (Next.js).

## 9. Test finale

```bash
scripts/smoke_test.sh https://fininzen.nacci.eu 20
journalctl -u fininzen -f
journalctl -u fininzen-web -f
systemctl list-timers 'fininzen-*'
```

Verifica inoltre il login e che backend, frontend e timer non risultino in
stato `failed`.

## 10. Aggiornamenti futuri

Dopo un `git push` dal Mac, sul VPS (come root):

```bash
/opt/fininzen/scripts/deploy.sh main
```

Fa: backup SQLite → pull → migrate/collectstatic/build → reinstalla le unit →
riavvia i servizi → reload Caddy → smoke test. Rollback automatico del codice al
commit precedente in caso di errore. In alternativa, come utente `fininzen`:
`just deploy-prod main` (senza reinstallo unit/Caddy).

Entrambi i comandi riallineano il checkout alla branch remota con
`git reset --hard`: il working tree sul server deve essere pulito e non deve
contenere modifiche da conservare.

Serve il sudoers per il restart dei servizi da parte di `fininzen`:

```
fininzen ALL=(ALL) NOPASSWD: /bin/systemctl restart fininzen fininzen-web
fininzen ALL=(ALL) NOPASSWD: /bin/systemctl reload caddy
```

## 11. Backup del database

`scripts/backup_db.sh` usa `sqlite3 .backup` (copia consistente anche in WAL) +
`PRAGMA integrity_check`, con rotazione a 7 giorni. Il timer
`fininzen-backup.timer`, installato al passo 7 e dal normale script di deploy,
lo esegue ogni giorno alle 03:00 con jitter e recupero delle esecuzioni mancate.

```bash
systemctl status fininzen-backup.timer --no-pager
systemctl list-timers fininzen-backup.timer
```

Per la replica off-site configura `OFFSITE_RSYNC_TARGET` in
`/etc/fininzen.env` ed esegui `scripts/backup_offsite.sh` dopo il timer locale.
Prova periodicamente il ripristino su una copia temporanea: la sola presenza del
file di backup non garantisce che sia recuperabile.

## Rate limiting (opzionale)

Il throttling DRF (`ScopedRateThrottle`) usa la cache Django. Con `LocMemCache`
ogni worker ha il proprio bucket (con 2 worker il limite raddoppia). Per un limite
condiviso installa Redis e imposta `REDIS_URL=redis://127.0.0.1:6379/0` in
`/etc/fininzen.env` (`settings.py` passa la cache a Redis automaticamente). Su 1 GB
di RAM valuta se ne vale la pena.
