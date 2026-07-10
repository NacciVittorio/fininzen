# Guida Deploy bare-metal — VPS Ubuntu 24.04 (systemd, SQLite, senza Docker)

Stack: **Django 6 + Gunicorn** · **Next.js SSR** (`next start`) · **Caddy** (systemd host) · **systemd** · **SQLite3**

> **Perché bare-metal.** Su una VPS piccola (1 vCPU / 1 GB RAM / 10 GB disco) le
> immagini Docker (postgres, python, node, redis, caddy) saturano il disco e
> impediscono gli upgrade. Questo percorso fa girare tutto direttamente con
> systemd e usa **SQLite** come database: un solo file, nessun processo/RAM extra.
> Lo stack Docker/Postgres resta in `deploy/docker/` come riferimento ma **non
> viene usato**. Guida Docker (storica): [DOCKER_DEPLOY.md](DOCKER_DEPLOY.md).

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

# Node.js 22 LTS (il repo Ubuntu ha Node 18, non supportato)
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
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
su - fininzen -c "git clone git@github.com:NacciVittorio/fininzen.git /opt/fininzen"
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
just build-frontend-prod     # npm ci && npm run build (Next.js SSR)
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

systemctl daemon-reload
systemctl enable --now fininzen              # gunicorn su 127.0.0.1:8000
systemctl enable --now fininzen-web          # next start su 127.0.0.1:3000
systemctl enable --now fininzen-refresh-prices.timer   # refresh prezzi orario

systemctl status fininzen fininzen-web --no-pager
```

- `fininzen.service` — gunicorn (WSGI), 2 worker, `ReadWritePaths=/opt/fininzen`
  (SQLite WAL crea `db.sqlite3-wal`/`-shm` accanto al DB).
- `fininzen-web.service` — Next.js SSR, heap capato a 384 MB (`NODE_OPTIONS`),
  `DJANGO_ORIGIN=http://127.0.0.1:8000` per le fetch server-side.
- `fininzen-refresh-prices.{service,timer}` — `manage.py refresh_asset_prices`
  ogni ora (`Nice=10`, `IOSchedulingClass=idle`).

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
e instrada: `/fininzen/api/*` → `127.0.0.1:8000` (Django), `/static/*` dal
filesystem, tutto il resto → `127.0.0.1:3000` (Next.js).

## 9. Test finale

```bash
scripts/smoke_test.sh https://fininzen.nacci.eu 20
journalctl -u fininzen -f
journalctl -u fininzen-web -f
```

## 10. Aggiornamenti futuri

Dopo un `git push` dal Mac, sul VPS (come root):

```bash
/opt/fininzen/scripts/deploy.sh main
```

Fa: backup SQLite → pull → migrate/collectstatic/build → reinstalla le unit →
riavvia i servizi → reload Caddy → smoke test. Rollback automatico del codice al
commit precedente in caso di errore. In alternativa, come utente `fininzen`:
`just deploy-prod main` (senza reinstallo unit/Caddy).

Serve il sudoers per il restart dei servizi da parte di `fininzen`:

```
fininzen ALL=(ALL) NOPASSWD: /bin/systemctl restart fininzen fininzen-web
fininzen ALL=(ALL) NOPASSWD: /bin/systemctl reload caddy
```

## 11. Backup del database

`scripts/backup_db.sh` usa `sqlite3 .backup` (copia consistente anche in WAL) +
`PRAGMA integrity_check`, con rotazione a 7 giorni. Schedulalo via cron `fininzen`:

```cron
0 3 * * * /opt/fininzen/scripts/backup_db.sh >> /opt/fininzen/logs/backup.log 2>&1
```

Per la replica off-site vedi `scripts/backup_offsite.sh`.

## 12. Liberare spazio disco: dismettere Docker

Una volta che i servizi systemd sono su e l'app risponde, recupera lo spazio
occupato dallo stack Docker:

```bash
# Se lo stack gira ancora:
cd /opt/fininzen && just production-down    # oppure: docker compose -f deploy/docker/production/compose.yml down

# Rimuovi immagini, container e volumi inutilizzati:
docker system prune -a --volumes
```

> **Attenzione ai dati Postgres.** Se nel volume `postgres_data` c'erano dati di
> produzione da conservare, esportali PRIMA del prune (`docker compose ... exec
> postgres pg_dump ...`). Nel deploy SQLite la produzione torna a
> `/opt/fininzen/db.sqlite3`, quindi i volumi del container Postgres di norma non
> contengono nulla da salvare — **verifica comunque** prima di cancellare.

Volendo, dopo la migrazione puoi disinstallare del tutto Docker per liberare
ancora più spazio (`apt purge docker-ce docker-ce-cli containerd.io ...`).

## Rate limiting (opzionale)

Il throttling DRF (`ScopedRateThrottle`) usa la cache Django. Con `LocMemCache`
ogni worker ha il proprio bucket (con 2 worker il limite raddoppia). Per un limite
condiviso installa Redis e imposta `REDIS_URL=redis://127.0.0.1:6379/0` in
`/etc/fininzen.env` (`settings.py` passa la cache a Redis automaticamente). Su 1 GB
di RAM valuta se ne vale la pena.
