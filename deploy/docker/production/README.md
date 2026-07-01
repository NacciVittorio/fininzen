# Full Docker stack (Caddy + Next.js + Django + Postgres + Redis)

"Tutto in Docker": un solo `docker compose up` mette online l'intera app dietro
Caddy sulla porta 80. Pensato per un deploy su LAN affidabile in HTTP puro (es.
una VM Debian su Proxmox). Per il dominio reale + HTTPS vedi l'ultima sezione.

```
browser ──http://<VM-IP>──▶ caddy:80
                             ├─ /static/*        → volume staticfiles
                             ├─ /fininzen/api/*  → backend:8000  (Django, gunicorn)
                             ├─ /api/*           → backend:8000
                             └─ /*               → frontend:3000 (Next.js)
backend ◀── SSR (DJANGO_ORIGIN=http://backend:8000) ── frontend
postgres ◀─ backend ─▶ redis
```

## Prerequisiti sulla VM

- Debian con Docker Engine + plugin Compose (`docker compose version` deve funzionare).
- Le porte 80 libere sulla VM. Annotati l'IP LAN della VM: `ip -4 addr` o `hostname -I`.

## Deploy

```bash
# 1. Clona il repo sulla VM
git clone <URL-del-repo> fininzen && cd fininzen

# 2. Configura l'ambiente
cp deploy/docker/production/.env.example deploy/docker/production/.env
#    Genera i segreti:
python3 -c "import secrets; print(secrets.token_urlsafe(64))"                 # DJANGO_SECRET_KEY
python3 -c "import os,base64; print(base64.b64encode(os.urandom(32)).decode())"  # FIELD_ENCRYPTION_KEYS
#    Poi modifica deploy/docker/production/.env: incolla i segreti, imposta
#    POSTGRES_PASSWORD, e sostituisci OGNI "CHANGE_ME_VM_IP" con l'IP della VM
#    (in DJANGO_ALLOWED_HOSTS, CSRF_TRUSTED_ORIGINS, WEBAUTHN_*).
nano deploy/docker/production/.env

# 3. Build + avvio
docker compose --env-file deploy/docker/production/.env \
  -f deploy/docker/production/compose.yml up -d --build

# 4. Crea il primo utente (admin)
docker compose --env-file deploy/docker/production/.env \
  -f deploy/docker/production/compose.yml exec backend python manage.py createsuperuser
```

Apri `http://<VM-IP>` dal browser. `migrate` e `collectstatic` vengono eseguiti
automaticamente dall'entrypoint del backend a ogni avvio.

## Comandi utili

```bash
# Alias comodo (eseguilo nella shell per non ripetere i flag):
alias dc='docker compose --env-file deploy/docker/production/.env -f deploy/docker/production/compose.yml'

dc ps                      # stato dei servizi
dc logs -f backend         # log del backend
dc logs -f caddy           # log del reverse proxy
dc exec backend python manage.py shell
dc down                    # ferma (i dati restano nei volume)
dc up -d --build           # ricostruisci dopo un git pull
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

## Note di sicurezza (HTTP-only)

- `DJANGO_SECURE_COOKIES=0` e `DJANGO_SECURE_SSL_REDIRECT=0` permettono il
  funzionamento su HTTP: senza, il browser scarta i cookie di auth `Secure` e
  login/refresh si rompono in silenzio. Vanno bene **solo** su LAN fidata.
- **WebAuthn/passkey** richiede HTTPS o `localhost`: da un altro PC via
  `http://<VM-IP>` non funziona. Login con username+password sì.
- Nessuna porta DB/Redis è esposta sull'host: solo Caddy pubblica la :80.

## Passare a dominio reale + HTTPS

1. Punta un record DNS (o `/etc/hosts`) all'IP della VM e apri 80+443.
2. In `deploy/docker/production/Caddyfile` sostituisci `:80 {` con `tuo.dominio {`
   (Caddy ottiene il certificato Let's Encrypt da solo) e aggiungi
   `- "443:443"` ai `ports` di caddy nel compose.
3. Nel `.env`: `DJANGO_SECURE_SSL_REDIRECT=1`, `DJANGO_SECURE_COOKIES=1`,
   aggiorna `CSRF_TRUSTED_ORIGINS=https://tuo.dominio` e `WEBAUTHN_*` con il
   dominio, poi `dc up -d`.
