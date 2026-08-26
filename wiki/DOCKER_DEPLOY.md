# Deploy Docker di Fininzen

Questa è la guida per eseguire l'intero stack di Fininzen con Docker Compose.
Il percorso usa PostgreSQL e Redis, mentre Django e Next.js vengono costruiti
dagli stessi sorgenti del repository.

Il reverse proxy pubblico (Nginx, Nginx Proxy Manager, Traefik o equivalente)
non fa parte di Fininzen e non viene installato né modificato da questa guida.
Deve solo poter raggiungere i container sulla rete Docker esterna indicata in
`.env`.

```text
client HTTPS
    │
    ▼
reverse proxy esterno
    ├── /      → fininzen-production-web:3000
    ├── /api/  → fininzen-production-api:8000
    └── /static/ → volume Docker production_staticfiles (sola lettura)

fininzen-production-api → postgres, redis
fininzen-production-web → fininzen-production-api (SSR)
```

## 1. Prerequisiti

Sul server servono:

- Docker Engine e il plugin `docker compose`;
- Git e accesso in lettura al repository;
- un utente dedicato, normalmente `dockerapp`, membro del gruppo `docker`;
- un checkout in `/opt/fininzen`, di proprietà di `dockerapp`;
- una rete Docker esterna già usata dal reverse proxy.

La rete esterna non viene creata né gestita da Fininzen. Verifica soltanto che
esista e che il container del reverse proxy sia collegato:

```bash
docker network inspect nacci_proxy
```

Se il nome è diverso, usa quel nome per `PROXY_NETWORK` nel file ambiente.

## 2. Primo checkout e configurazione

Esempio di installazione iniziale sul server:

```bash
sudo useradd --create-home --shell /bin/bash dockerapp
sudo usermod --append --groups docker dockerapp
sudo mkdir -p /opt/fininzen
sudo chown dockerapp:dockerapp /opt/fininzen
sudo -u dockerapp git clone <URL_DEL_REPOSITORY> /opt/fininzen
```

Prepara il file ambiente che non deve essere committato:

```bash
cd /opt/fininzen
sudo -u dockerapp cp deploy/docker/production/.env.example \
  deploy/docker/production/.env
sudo chmod 600 deploy/docker/production/.env
sudo chown dockerapp:dockerapp deploy/docker/production/.env
```

Genera valori casuali e inseriscili in `.env`:

```bash
python3 -c "import secrets; print(secrets.token_urlsafe(64))"
python3 -c "import os,base64; print(base64.b64encode(os.urandom(32)).decode())"
```

Imposta almeno questi valori:

| Variabile | Indicazione |
| --- | --- |
| `DJANGO_SECRET_KEY` | primo valore generato, lungo e privato |
| `FIELD_ENCRYPTION_KEYS` | secondo valore generato; supporta più chiavi separate da virgola per la rotazione |
| `POSTGRES_PASSWORD` | password PostgreSQL robusta e privata |
| `DJANGO_ALLOWED_HOSTS` | hostname pubblico e `backend` |
| `CSRF_TRUSTED_ORIGINS` | origini HTTPS effettivamente usate dagli utenti |
| `CORS_ALLOWED_ORIGINS` | normalmente le stesse origini HTTPS |
| `WEBAUTHN_RP_ID` / `WEBAUTHN_ORIGIN` | dominio HTTPS pubblico usato dalle passkey |
| `PROXY_NETWORK` | rete Docker esterna del reverse proxy |

Mantieni questi valori coerenti con il routing pubblico:

```dotenv
REFRESH_COOKIE_PATH=/api/auth/
NEXT_PUBLIC_API_BASE=/api
DJANGO_SECURE_SSL_REDIRECT=1
DJANGO_SECURE_COOKIES=1
COMPOSE_PROJECT_NAME=production
```

Il progetto Compose predefinito è `production`: perciò il volume degli statici
si chiama `production_staticfiles`. Se cambi `COMPOSE_PROJECT_NAME`, devi
aggiornare anche il mount del volume nel reverse proxy esterno e valorizzare
`FININZEN_COMPOSE_PROJECT_NAME` allo stesso valore quando usi
`scripts/deploy.sh`.

## 3. Primo avvio dello stack

Esegui la validazione e l'avvio come `dockerapp`:

```bash
cd /opt/fininzen
docker compose -p production --env-file deploy/docker/production/.env \
  -f deploy/docker/production/compose.yml config --quiet
docker compose -p production --env-file deploy/docker/production/.env \
  -f deploy/docker/production/compose.yml up -d --build
docker compose -p production --env-file deploy/docker/production/.env \
  -f deploy/docker/production/compose.yml ps
```

L'entrypoint del backend esegue automaticamente `migrate` e `collectstatic`
all'avvio. Controlla i log se un container resta in riavvio:

```bash
docker compose -p production --env-file deploy/docker/production/.env \
  -f deploy/docker/production/compose.yml logs --tail=100 backend frontend
```

Il primo amministratore si crea dopo che il backend è in esecuzione:

```bash
docker compose -p production --env-file deploy/docker/production/.env \
  -f deploy/docker/production/compose.yml exec backend \
  python manage.py createsuperuser
```

## 4. Contratto del reverse proxy esterno

La configurazione del reverse proxy è responsabilità dell'infrastruttura che lo
ospita. Fininzen espone sulla rete esterna solo questi due alias, configurabili
con `PROXY_WEB_UPSTREAM` e `PROXY_API_UPSTREAM`:

- frontend: `fininzen-production-web:3000`;
- API: `fininzen-production-api:8000`.

Il proxy deve terminare TLS, inoltrare il prefisso `/api` senza riscriverlo e
passare `X-Forwarded-Proto: https`. Per servire gli statici, può montare in
sola lettura il volume Docker dello stack:

```yaml
volumes:
  production_staticfiles:
    external: true
```

Il percorso interno da servire è `/app/staticfiles`. Non aggiungere un
container Nginx al Compose di Fininzen e non modificare il proxy con lo script
di deploy.

## 5. Aggiornamenti

Il deploy aggiornato è in `scripts/deploy.sh`. Esegue, in ordine:

1. verifica del checkout pulito e della configurazione Compose;
2. rilevamento dei servizi attualmente attivi;
3. backup verificato di PostgreSQL;
4. `git fetch` e riallineamento alla branch remota;
5. nuova validazione Compose e `docker compose up -d --build` sui servizi attivi;
6. controllo dello stato dei container e, se richiesto, smoke test HTTP.

Sul server, come root:

```bash
sudo FININZEN_PUBLIC_URL=https://fininzen.example \
  FININZEN_API_PREFIX=/api \
  /opt/fininzen/scripts/deploy.sh main
```

`FININZEN_PUBLIC_URL` è opzionale; quando è presente abilita
`scripts/smoke_test.sh`. Lo script richiede che PostgreSQL sia attivo per poter
creare il backup. Un checkout con modifiche tracciate viene rifiutato: il file
`.env` è ignorato da Git e non costituisce una modifica tracciata.

In caso di errore dopo il cambio di revisione, lo script ripristina il commit
precedente e ricostruisce i container che erano attivi. Il rollback del codice
non annulla automaticamente le migrazioni del database: conservarne i backup e
testarne periodicamente il ripristino.

Per un aggiornamento manuale equivalente:

```bash
docker compose -p production --env-file deploy/docker/production/.env \
  -f deploy/docker/production/compose.yml up -d --build
```

## 6. Operatività quotidiana

Per evitare di ripetere i parametri:

```bash
alias fininzen-dc='docker compose -p production --env-file /opt/fininzen/deploy/docker/production/.env -f /opt/fininzen/deploy/docker/production/compose.yml'
```

Comandi utili:

```bash
fininzen-dc ps
fininzen-dc logs -f backend
fininzen-dc logs -f frontend
fininzen-dc restart backend frontend
fininzen-dc exec backend python manage.py refresh_asset_prices
```

Non usare `docker compose down -v`: rimuoverebbe i volumi e quindi i dati di
PostgreSQL. `docker compose down` senza `-v` ferma lo stack e conserva i dati.

## 7. Backup e job applicativi

Il backup PostgreSQL verificato è disponibile con:

```bash
cd /opt/fininzen
ENV_FILE=deploy/docker/production/.env scripts/backup_postgres.sh
```

Per cifratura e copia off-site configura le variabili documentate in
`deploy/docker/production/.env.example`. Il bundle cifrato autosufficiente è
generato da `scripts/backup_production_bundle.sh`.

I job applicativi possono essere eseguiti dal cron dell'utente `dockerapp`:

```cron
17 * * * * cd /opt/fininzen && docker compose -p production --env-file deploy/docker/production/.env -f deploy/docker/production/compose.yml exec -T backend python manage.py refresh_asset_prices >> /home/dockerapp/refresh_prices.log 2>&1
23 3 * * * cd /opt/fininzen && docker compose -p production --env-file deploy/docker/production/.env -f deploy/docker/production/compose.yml exec -T backend python manage.py generate_recurring_expenses >> /home/dockerapp/recurring_expenses.log 2>&1
41 3 * * * cd /opt/fininzen && docker compose -p production --env-file deploy/docker/production/.env -f deploy/docker/production/compose.yml exec -T backend python manage.py generate_split_recurring_expenses >> /home/dockerapp/split_recurring_expenses.log 2>&1
30 3 * * * cd /opt/fininzen && ENV_FILE=deploy/docker/production/.env scripts/backup_postgres.sh >> /home/dockerapp/backup_db.log 2>&1
```

## 8. Verifica finale e troubleshooting

Per un controllo applicativo attraverso il proxy esterno:

```bash
cd /opt/fininzen
API_PREFIX=/api scripts/smoke_test.sh https://fininzen.example 20
```

Se il test fallisce, controlla nell'ordine:

```bash
fininzen-dc ps
fininzen-dc logs backend
fininzen-dc logs frontend
docker network inspect nacci_proxy
```

Un errore di connessione del proxy non implica necessariamente un problema
nell'applicazione: verifica prima che la rete esterna configurata in
`PROXY_NETWORK` sia quella a cui è collegato il proxy.
