# Deploy Docker dietro Nginx

Questo deploy esegue Next.js, Django/Gunicorn, PostgreSQL e Redis in Docker su
`L-DOCKER-P`.
**Non** include un reverse proxy pubblico: Nginx o Nginx Proxy Manager (NPM)
gestisce TLS e le porte 80/443, ed è connesso alla stessa rete Docker esterna.

```
browser ──HTTPS──▶ Nginx / NPM
                       ├─ /          → fininzen-web:3000
                       ├─ /api/      → fininzen-api:8000
                       └─ /static/   → fininzen-static:80
                                      ├─ frontend ──▶ backend:8000
                                      └─ backend ──▶ postgres, redis
```

PostgreSQL e Redis restano sulla rete privata del progetto. Nessun servizio
Fininzen pubblica porte sull'host.

## 1. Prerequisiti

- Docker Engine e plugin Compose;
- un container Nginx/NPM già collegato alla rete esterna che userà Fininzen;
- hostname HTTPS pubblico o interno, con il certificato gestito da Nginx;
- utente `dockerapp` nel gruppo `docker` e proprietario di `/opt/fininzen`.

Individua la rete del reverse proxy:

```bash
docker network ls
docker network inspect nacci_proxy
```

L'output di `inspect` deve elencare il container Nginx/NPM. Per creare una
rete nuova, una sola volta:

```bash
docker network create nginx_proxy
```

## 2. Configurare l'ambiente

Come `dockerapp`:

```bash
cd /opt/fininzen
cp deploy/docker/production/.env.example deploy/docker/production/.env
chmod 600 deploy/docker/production/.env
```

Genera i segreti e inseriscili nel file:

```bash
python3 -c "import secrets; print(secrets.token_urlsafe(64))"
python3 -c "import os,base64; print(base64.b64encode(os.urandom(32)).decode())"
```

Imposta almeno:

| Variabile | Valore |
| --- | --- |
| `DJANGO_SECRET_KEY` | primo segreto generato |
| `FIELD_ENCRYPTION_KEYS` | secondo segreto generato |
| `POSTGRES_PASSWORD` | password robusta |
| `DJANGO_ALLOWED_HOSTS` | hostname già predisposti; aggiornarli solo se cambiano domini |
| `CSRF_TRUSTED_ORIGINS`, `CORS_ALLOWED_ORIGINS` | hostname HTTPS già predisposti |
| `WEBAUTHN_RP_ID`, `WEBAUTHN_ORIGIN` | hostname pubblico per le passkey |
| `PROXY_NETWORK` | `nacci_proxy` |

Lascia `REFRESH_COOKIE_PATH=/api/auth/` e `NEXT_PUBLIC_API_BASE=/api`:
Nginx inoltra il prefisso `/api` senza riscriverlo. Mantieni
`DJANGO_SECURE_COOKIES=1` e `DJANGO_SECURE_SSL_REDIRECT=1` per HTTPS.

## 3. Avvio e Nginx Proxy Manager

Verifica prima la configurazione, poi avvia:

```bash
docker compose --env-file deploy/docker/production/.env \
  -f deploy/docker/production/compose.yml config --quiet
docker compose --env-file deploy/docker/production/.env \
  -f deploy/docker/production/compose.yml up -d --build
```

In NPM crea un Proxy Host per l'hostname. Usa `/` →
`http://fininzen-production-web:3000`, attiva WebSocket, Force SSL e HTTP/2, quindi crea
due Custom Locations:

| Location | Forward hostname | Porta |
| --- | --- | --- |
| `/api/` | `fininzen-production-api` | `8000` |
| `/static/` | `fininzen-production-static` | `80` |

I nomi sono configurabili tramite `PROXY_WEB_UPSTREAM`,
`PROXY_API_UPSTREAM` e `PROXY_STATIC_UPSTREAM`. Servono quando più stack
condividono la stessa rete Docker.

Il servizio `static` usa Nginx solo per pubblicare in modo read-only gli asset
generati da `collectstatic`; non espone alcuna porta e non sostituisce il
reverse proxy principale.

Crea il primo amministratore:

```bash
docker compose --env-file deploy/docker/production/.env \
  -f deploy/docker/production/compose.yml exec backend python manage.py createsuperuser
```

## 4. Operatività

Alias opzionale:

```bash
alias dc='docker compose --env-file /opt/fininzen/deploy/docker/production/.env -f /opt/fininzen/deploy/docker/production/compose.yml'
```

```bash
dc ps
dc logs -f backend
dc logs -f frontend
dc logs -f static
dc up -d --build
dc exec backend python manage.py shell
```

`migrate` e `collectstatic` sono eseguiti dall'entrypoint del backend a ogni
avvio. Dopo un aggiornamento controlla `dc ps`, i log e l'URL pubblico con:

```bash
API_PREFIX=/api scripts/smoke_test.sh https://<hostname>
```

## 5. Job e backup

Come `dockerapp`, pianifica i job applicativi con `crontab -e`:

```cron
17 * * * * /usr/bin/docker compose --env-file /opt/fininzen/deploy/docker/production/.env -f /opt/fininzen/deploy/docker/production/compose.yml exec -T backend python manage.py refresh_asset_prices >> /home/dockerapp/refresh_prices.log 2>&1
23 3 * * * /usr/bin/docker compose --env-file /opt/fininzen/deploy/docker/production/.env -f /opt/fininzen/deploy/docker/production/compose.yml exec -T backend python manage.py generate_recurring_expenses >> /home/dockerapp/recurring_expenses.log 2>&1
41 3 * * * /usr/bin/docker compose --env-file /opt/fininzen/deploy/docker/production/.env -f /opt/fininzen/deploy/docker/production/compose.yml exec -T backend python manage.py generate_split_recurring_expenses >> /home/dockerapp/split_recurring_expenses.log 2>&1
30 3 * * * /opt/fininzen/scripts/backup_postgres.sh >> /home/dockerapp/backup_db.log 2>&1
```

`just production-backup` produce un dump PostgreSQL verificato in
`backups/`, con cifratura opzionale tramite `BACKUP_ENC_PASSPHRASE`. Per un
bundle cifrato con age, configura `AGE_RECIPIENT` nello stesso `.env` ed esegui
`scripts/backup_production_bundle.sh`.
