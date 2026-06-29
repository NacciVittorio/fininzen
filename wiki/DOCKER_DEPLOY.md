# Deploy Docker — da VM vuota a stack online

Guida completa per portare Fininzen in produzione su una VM Linux (es. Debian su
Proxmox) con **tutto in Docker**: Caddy + Next.js + Django/Gunicorn + PostgreSQL
+ Redis, dietro un unico `docker compose`.

Scenario di riferimento: deploy su **LAN affidabile in HTTP** (accesso via
`http://<IP-VM>`). La migrazione a dominio reale + HTTPS è in fondo.

> Questo sostituisce il vecchio deploy bare-metal (gunicorn sotto systemd). I
> file `deploy/systemd/` sono stati ritirati: l'app non gira più come servizio
> di sistema ma dentro i container.

```
browser ──http://<IP-VM>──▶ caddy:80
                             ├─ /static/*        → volume staticfiles
                             ├─ /fininzen/api/*  → backend:8000  (Django/Gunicorn)
                             ├─ /api/*           → backend:8000
                             └─ /*               → frontend:3000 (Next.js SSR)
backend ◀── SSR (DJANGO_ORIGIN=http://backend:8000) ── frontend
postgres ◀─ backend ─▶ redis
```

---

## 0. Concetti di base (host vs container)

Con Docker ci sono **due piani di utenti** da non confondere:

| Concetto | Cos'è | Esempio |
|---|---|---|
| **Utente host** | chi *gestisce* i container e possiede i file di deploy | `dockerapp` |
| **Path del repo** | *dove* sta il progetto sul disco | `/opt/fininzen` |
| **Utenti nei container** | chi *esegue* davvero l'app (definiti dalle immagini) | `postgres`, `redis`, root |

⚠️ In un deploy 100% Docker **non** serve creare un utente di sistema `fininzen`
con cui far girare l'app (quello è il pattern bare-metal/systemd). L'app gira
come utente *interno* a ciascun container. Sull'host basta un normale utente nel
gruppo `docker`.

I **dati** (database, statici, certificati) non stanno in `/opt/fininzen`: stanno
nei *volumi Docker* sotto `/var/lib/docker/volumes/`, gestiti da Docker. In
`/opt/fininzen` vivono solo codice, `compose.yml` e `.env`.

---

## 1. Prerequisiti sulla VM

- Debian (o derivata) con **Docker Engine + plugin Compose** già installati
  (`docker --version` e `docker compose version` devono rispondere).
- Porta **80** libera.
- Accesso `root` (o `sudo`) per i passi di setup iniziale.

Usa sempre `su -` (con il trattino) per le operazioni da amministratore: carica
l'ambiente completo di root, `/usr/sbin` incluso, evitando errori tipo
`usermod: command not found`.

---

## 2. Utente, gruppo, permessi (come root)

```bash
su -
apt install -y git                 # nano di solito c'è già

# utente non-root dedicato alla gestione dei container
adduser dockerapp
usermod -aG docker dockerapp       # il gruppo docker = privilegi root: solo utenti fidati

# cartella applicativa, di proprietà di dockerapp
mkdir -p /opt/fininzen
chown dockerapp:dockerapp /opt/fininzen
exit
```

Verifica l'appartenenza al gruppo (ha effetto solo da una **nuova** sessione):

```bash
getent group docker                # deve elencare dockerapp
```

> **Sicurezza**: il gruppo `docker` è di fatto root-equivalente (chi può lanciare
> container può montare il filesystem dell'host). Trattalo come accesso
> amministrativo. Per `dockerapp` valuta di disabilitare il login con password e
> usare solo SSH con chiave.

(Opzionale) alias `ll` per tutti gli utenti:

```bash
su -
echo "alias ll='ls -alF'" > /etc/profile.d/aliases.sh
chmod 644 /etc/profile.d/aliases.sh
exit
```

---

## 3. Chiave SSH per il clone (deploy key)

Per un server che fa solo `git pull` su un repo, la scelta migliore è una
**deploy key**: chiave SSH legata a *un solo* repo, di sola lettura. Se la VM
viene compromessa, l'attaccante legge solo questo repo — non tutti i tuoi.

Come **dockerapp**:

```bash
ssh-keygen -t ed25519 -C "dockerapp@$(hostname) fininzen deploy" -f ~/.ssh/id_ed25519 -N ""
cat ~/.ssh/id_ed25519.pub          # copia questa riga
```

Su GitHub: repo → **Settings → Deploy keys → Add deploy key** → incolla la
chiave, **lascia "Allow write access" deselezionato** (serve solo leggere).

Verifica:

```bash
ssh -T git@github.com
# atteso: "Hi NacciVittorio/fininzen! You've successfully authenticated, but
#          GitHub does not provide shell access." (è normale)
```

---

## 4. Clone del repo (come dockerapp)

```bash
cd /opt/fininzen
git clone git@github.com:NacciVittorio/fininzen.git .
git checkout main                  # o il branch desiderato
ls deploy/docker/stack/            # deve mostrare: compose.yml Caddyfile .env.example README.md
```

> Se avevi già clonato in HTTPS, cambia solo il remote senza riclonare:
> `git remote set-url origin git@github.com:NacciVittorio/fininzen.git`

---

## 5. Configurazione `.env` (come dockerapp, in `/opt/fininzen`)

```bash
cp deploy/docker/stack/.env.example deploy/docker/stack/.env
chmod 600 deploy/docker/stack/.env     # blinda i segreti: solo dockerapp legge/scrive

# genera i due segreti (lanciali separatamente, copia ciascun output):
python3 -c "import secrets; print(secrets.token_urlsafe(64))"                     # → DJANGO_SECRET_KEY
python3 -c "import os,base64; print(base64.b64encode(os.urandom(32)).decode())"   # → FIELD_ENCRYPTION_KEYS

hostname -I                            # → IP LAN della VM
nano deploy/docker/stack/.env
```

Valori da impostare:

| Campo | Valore |
|---|---|
| `DJANGO_SECRET_KEY` | primo segreto generato |
| `FIELD_ENCRYPTION_KEYS` | secondo segreto generato |
| `POSTGRES_PASSWORD` | password robusta a tua scelta |
| `DJANGO_ALLOWED_HOSTS` | `backend,localhost,127.0.0.1,<IP-VM>` |
| `CSRF_TRUSTED_ORIGINS` | `http://<IP-VM>` |
| `WEBAUTHN_RP_ID` | `<IP-VM>` |
| `WEBAUTHN_ORIGIN` | `http://<IP-VM>` |
| `DJANGO_SECURE_COOKIES` | `0` (deploy HTTP — vedi nota sotto) |
| `DJANGO_SECURE_SSL_REDIRECT` | `0` (deploy HTTP) |

`token_urlsafe` e `b64encode` producono solo caratteri sicuri per un file `.env`
(niente `#` o spazi): **non** servono virgolette attorno ai valori.

> `DJANGO_ALLOWED_HOSTS` deve includere sia `<IP-VM>` (come lo raggiunge il
> browser) sia `backend` (come il livello SSR di Next.js raggiunge Django sulla
> rete Docker). Senza `backend`, le pagine renderizzate lato server falliscono.

---

## 6. Build e avvio (come dockerapp)

```bash
cd /opt/fininzen
docker compose --env-file deploy/docker/stack/.env \
  -f deploy/docker/stack/compose.yml up -d --build
```

`migrate` e `collectstatic` vengono eseguiti automaticamente dall'entrypoint del
backend a ogni avvio. Crea poi il primo utente amministratore:

```bash
docker compose --env-file deploy/docker/stack/.env \
  -f deploy/docker/stack/compose.yml exec backend python manage.py createsuperuser
```

Apri **`http://<IP-VM>`** dal browser.

Alias comodo per non ripetere i flag (aggiungilo a `~/.bashrc` di dockerapp):

```bash
alias dc='docker compose --env-file /opt/fininzen/deploy/docker/stack/.env -f /opt/fininzen/deploy/docker/stack/compose.yml'
```

---

## 7. Aggiornamento prezzi schedulato (IMPORTANTE)

I prezzi degli asset si aggiornano con `manage.py refresh_asset_prices`, che
**non** deve girare ai request degli utenti (vedi `wiki/OPS_HARDENING.md`). Nel
mondo bare-metal lo faceva un timer systemd; in Docker lo schediamo con il **cron
dell'host** che invoca il container già in esecuzione.

Come **dockerapp**, `crontab -e`:

```cron
# Aggiorna i prezzi ogni ora (minuto 17 per evitare il picco dell'ora esatta)
17 * * * * /usr/bin/docker compose --env-file /opt/fininzen/deploy/docker/stack/.env -f /opt/fininzen/deploy/docker/stack/compose.yml exec -T backend python manage.py refresh_asset_prices >> /home/dockerapp/refresh_prices.log 2>&1
```

Note:
- `exec -T` riusa il container `backend` già attivo (niente nuovo container) e
  disabilita la TTY (necessario sotto cron).
- Path assoluto a `docker` perché cron ha un `PATH` minimale.
- In alternativa "pure-Docker" si può aggiungere un container scheduler
  (es. *ofelia*) al compose; il cron dell'host è più semplice ed è la scelta
  consigliata per un homelab.

---

## 8. Operatività quotidiana

Con l'alias `dc` impostato al punto 6:

```bash
dc ps                      # stato dei servizi
dc logs -f backend         # log del backend
dc logs -f caddy           # log del reverse proxy
dc exec backend python manage.py shell
dc restart backend
dc down                    # ferma (i dati restano nei volumi)
dc up -d                   # riavvia
```

### Aggiornare a una nuova versione del codice

```bash
cd /opt/fininzen
git pull
dc up -d --build           # ricostruisce le immagini; migrate/collectstatic automatici
```

### Backup del database

```bash
dc exec -T postgres pg_dump -U fininzen -Fc fininzen > /home/dockerapp/fininzen_$(date +%F).dump
```

Ripristino su un DB vuoto:

```bash
cat fininzen_AAAA-MM-GG.dump | dc exec -T postgres pg_restore -U fininzen -d fininzen --clean
```

> Pianifica i backup (cron) e testa periodicamente un restore su un path usa e
> getta, non sul DB live.

---

## 9. Note di sicurezza (deploy HTTP)

- `DJANGO_SECURE_COOKIES=0` e `DJANGO_SECURE_SSL_REDIRECT=0` permettono il
  funzionamento su HTTP: senza, Django marca i cookie di auth come `Secure`, il
  browser li scarta su `http://` e **login/refresh si rompono in silenzio**.
  Accettabile **solo** su LAN fidata.
- **WebAuthn/passkey** richiede HTTPS o `localhost`: da un altro PC via
  `http://<IP-VM>` non funziona. Login con username+password sì.
- Nessuna porta di DB/Redis è esposta sull'host: solo Caddy pubblica la `:80`.
- Tieni `.env` a `chmod 600` e mai committato (è in `.gitignore`).

---

## 10. Passare a dominio reale + HTTPS

1. Punta un record DNS all'IP della VM e apri le porte 80 + 443.
2. In `deploy/docker/stack/Caddyfile` sostituisci `:80 {` con `tuo.dominio {`
   (Caddy ottiene il certificato Let's Encrypt da solo) e aggiungi `- "443:443"`
   ai `ports` del servizio `caddy` in `compose.yml`.
3. Nel `.env`: `DJANGO_SECURE_SSL_REDIRECT=1`, `DJANGO_SECURE_COOKIES=1`, e
   aggiorna `CSRF_TRUSTED_ORIGINS=https://tuo.dominio` e `WEBAUTHN_*` con il
   dominio.
4. `dc up -d` per applicare.

---

## Riferimenti

- `deploy/docker/stack/README.md` — riferimento rapido dei comandi dello stack.
- `wiki/OPS_HARDENING.md` — checklist di hardening lato deploy.
- `wiki/VERSIONING.md` — schema di versionamento unico backend/frontend.
- `wiki/POSTGRES_MIGRATION.md` — note di migrazione SQLite → PostgreSQL.
