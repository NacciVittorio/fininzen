# Docker stack (Next.js + Django + Postgres + Redis) — TLS dal Caddy di sistema

Questa cartella NON include più un servizio Caddy in Docker. TLS e la porta
pubblica 80/443 restano al Caddy di sistema (systemd) già presente sulla VPS,
che serve anche altri domini: aggiungere un secondo Caddy in Docker sulle
stesse porte fallirebbe (`address already in use`). Il compose qui pubblica
backend/frontend solo su `127.0.0.1`; il file `./Caddyfile` è uno snippet di
riferimento da incollare come nuovo blocco nel Caddyfile di sistema
(`/etc/caddy/Caddyfile`). Guida completa: `wiki/VPS_DEPLOY_CHECKLIST.md`.

```
browser ──https://fininzen.nacci.eu──▶ caddy (systemd, :80/:443)
                             ├─ /static/*        → /opt/fininzen/staticfiles (bind mount)
                             ├─ /fininzen/api/*  → 127.0.0.1:8010  (Django, gunicorn)
                             ├─ /api/*           → 127.0.0.1:8010
                             └─ /*               → 127.0.0.1:3010 (Next.js)
backend ◀── SSR (DJANGO_ORIGIN=http://backend:8000, rete compose interna) ── frontend
postgres ◀─ backend ─▶ redis
```

## Prerequisiti sulla VM

- Docker Engine + plugin Compose (`docker compose version` deve funzionare).
- Caddy di sistema già attivo e raggiungibile su 80/443, con `fininzen.nacci.eu`
  aggiunto come nuovo site block (vedi `./Caddyfile`).

## Deploy

```bash
# 1. Clona il repo sulla VM (in /opt/fininzen, così i path relativi combaciano)
git clone <URL-del-repo> /opt/fininzen && cd /opt/fininzen

# 2. Configura l'ambiente
cp deploy/docker/production/.env.example deploy/docker/production/.env
#    Genera i segreti:
python3 -c "import secrets; print(secrets.token_urlsafe(64))"                 # DJANGO_SECRET_KEY
python3 -c "import os,base64; print(base64.b64encode(os.urandom(32)).decode())"  # FIELD_ENCRYPTION_KEYS
#    Poi modifica deploy/docker/production/.env: incolla i segreti, imposta
#    POSTGRES_PASSWORD, DJANGO_ALLOWED_HOSTS/CSRF_TRUSTED_ORIGINS/WEBAUTHN_*
#    con fininzen.nacci.eu, e (se differiscono dal default) BACKEND_PORT/FRONTEND_PORT.
nano deploy/docker/production/.env

# 3. Aggiungi il site block di ./Caddyfile al Caddy di sistema
#    (es. /etc/caddy/Caddyfile), poi ricarica:
systemctl reload caddy

# 4. Build + avvio dello stack Docker (senza Caddy)
docker compose --env-file deploy/docker/production/.env \
  -f deploy/docker/production/compose.yml up -d --build

# 5. Crea il primo utente (admin)
docker compose --env-file deploy/docker/production/.env \
  -f deploy/docker/production/compose.yml exec backend python manage.py createsuperuser
```

Apri `https://fininzen.nacci.eu` dal browser. `migrate` e `collectstatic` vengono
eseguiti automaticamente dall'entrypoint del backend a ogni avvio.

## Comandi utili

```bash
# Alias comodo (eseguilo nella shell per non ripetere i flag):
alias dc='docker compose --env-file deploy/docker/production/.env -f deploy/docker/production/compose.yml'

dc ps                      # stato dei servizi
dc logs -f backend         # log del backend
dc exec backend python manage.py shell
dc down                    # ferma (i dati restano nei volume)
dc up -d --build           # ricostruisci dopo un git pull

# Il reverse proxy è il Caddy di sistema, non un container:
journalctl -u caddy -f               # log del servizio
tail -f /var/log/caddy_fininzen_access.log   # log accessi del site fininzen
```

## Aggiornamenti

```bash
git pull
dc up -d --build           # rebuild immagini; migrate/collectstatic automatici
```

## Backup del database

Metodo **ufficiale**: `just production-backup` (→ `scripts/backup_db.sh`), che fa un
`pg_dump --format=custom` dal container con rotazione e cifratura at-rest opzionale.
Vedi [wiki/DOCKER_DEPLOY.md](/wiki/DOCKER_DEPLOY.md) §8 per schedulazione e restore.

Dump **rapido ad-hoc** (SQL semplice, senza rotazione/cifratura):

```bash
dc exec postgres pg_dump -U fininzen fininzen > backup_$(date +%F).sql
```

## Note di sicurezza

- `DJANGO_SECURE_COOKIES=1` e `DJANGO_SECURE_SSL_REDIRECT=1`: richiedono HTTPS,
  già garantito dal Caddy di sistema su `fininzen.nacci.eu`.
- Nessuna porta DB/Redis è esposta sull'host. `backend`/`frontend` sono
  pubblicati solo su `127.0.0.1` (non raggiungibili da internet): solo il
  Caddy di sistema pubblica `:80`/`:443`.
