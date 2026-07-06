# Full Docker stack (Caddy + Next.js + Django + Postgres + Redis)

"Tutto in Docker": un solo `docker compose up` mette online l'intera app dietro
un Caddy proprio dello stack. **Su questa VPS** il host esegue già un secondo
Caddy (systemd, non Docker) per un altro dominio (`finnet.nacci.eu`) sulle
porte 80/443: il Caddy di questo stack non può fare il bind delle stesse
porte, quindi è temporaneamente pubblicato su una porta alternativa
(`HTTP_PORT`, es. `8080`) e quello di sistema fa da relay verso di lui. Guida
completa: [wiki/VPS_DEPLOY_CHECKLIST.md](/wiki/VPS_DEPLOY_CHECKLIST.md).

```
browser ──https://fininzen.nacci.eu──▶ caddy di sistema (systemd, :80/:443, TLS)
                                          │ reverse_proxy 127.0.0.1:8080
                                          ▼
                                        caddy (questo stack, container)
                             ├─ /static/*        → volume staticfiles
                             ├─ /fininzen/api/*  → backend:8000  (Django, gunicorn)
                             ├─ /api/*           → backend:8000
                             └─ /*               → frontend:3000 (Next.js)
backend ◀── SSR (DJANGO_ORIGIN=http://backend:8000) ── frontend
postgres ◀─ backend ─▶ redis
```

Quando il Caddy di sistema verrà eliminato, questo stack tornerà a pubblicare
80/443 direttamente (vedi ultima sezione) — nessun'altra modifica.

## Prerequisiti sulla VM

- Docker Engine + plugin Compose (`docker compose version` deve funzionare).
- Una porta libera per `HTTP_PORT` (es. `8080`) non in conflitto con altri
  servizi già in ascolto sull'host: verifica con `ss -ltnp`.

## Deploy

```bash
# 1. Clona il repo sulla VM
git clone <URL-del-repo> /opt/fininzen && cd /opt/fininzen

# 2. Configura l'ambiente
cp deploy/docker/production/.env.example deploy/docker/production/.env
#    Genera i segreti:
python3 -c "import secrets; print(secrets.token_urlsafe(64))"                 # DJANGO_SECRET_KEY
python3 -c "import os,base64; print(base64.b64encode(os.urandom(32)).decode())"  # FIELD_ENCRYPTION_KEYS
#    Poi modifica deploy/docker/production/.env: incolla i segreti, imposta
#    POSTGRES_PASSWORD, DJANGO_ALLOWED_HOSTS/CSRF_TRUSTED_ORIGINS/WEBAUTHN_*
#    con fininzen.nacci.eu, DJANGO_SECURE_COOKIES/SSL_REDIRECT=1, e HTTP_PORT
#    sulla porta libera scelta (es. 8080).
nano deploy/docker/production/.env

# 3. Build + avvio
docker compose --env-file deploy/docker/production/.env \
  -f deploy/docker/production/compose.yml up -d --build

# 4. Crea il primo utente (admin)
docker compose --env-file deploy/docker/production/.env \
  -f deploy/docker/production/compose.yml exec backend python manage.py createsuperuser

# 5. Aggiungi il relay sul Caddy di sistema (es. /etc/caddy/Caddyfile):
#      fininzen.nacci.eu {
#          reverse_proxy 127.0.0.1:8080
#      }
#    poi: systemctl reload caddy
```

Apri `https://fininzen.nacci.eu` dal browser. `migrate` e `collectstatic`
vengono eseguiti automaticamente dall'entrypoint del backend a ogni avvio.

## Comandi utili

```bash
# Alias comodo (eseguilo nella shell per non ripetere i flag):
alias dc='docker compose --env-file deploy/docker/production/.env -f deploy/docker/production/compose.yml'

dc ps                      # stato dei servizi
dc logs -f backend         # log del backend
dc logs -f caddy           # log del reverse proxy (di questo stack)
dc exec backend python manage.py shell
dc down                    # ferma (i dati restano nei volume)
dc up -d --build           # ricostruisci dopo un git pull

journalctl -u caddy -f     # log del Caddy di sistema (il relay pubblico)
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
  garantito dal Caddy di sistema (che termina il TLS) davanti al relay.
- Nessuna porta DB/Redis è esposta sull'host. Il Caddy di questo stack è
  raggiungibile solo su `127.0.0.1:HTTP_PORT` (via `${HTTP_PORT:-80}:80` nel
  compose) — non direttamente da internet, solo tramite il relay del Caddy di
  sistema.

## Quando il Caddy di sistema verrà eliminato

1. In `deploy/docker/production/Caddyfile` sostituisci `:80 {` con
   `fininzen.nacci.eu {` (Caddy ottiene il certificato Let's Encrypt da solo).
2. Nel `.env`: `HTTP_PORT=80` (o rimuovilo, è il default) e aggiungi
   `- "443:443"` ai `ports` del servizio `caddy` in `compose.yml`.
3. Rimuovi il blocco relay `fininzen.nacci.eu { reverse_proxy ... }` dal
   Caddyfile di sistema (o l'intero servizio, se va dismesso insieme a
   `finnet.nacci.eu`).
4. `dc up -d` per applicare.
