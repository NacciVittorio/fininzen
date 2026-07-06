# Checklist deploy VPS — fininzen.nacci.eu

Guida operativa per il deploy in corso su una VPS (IP `217.160.187.118`). Spunta le caselle
man mano che procedi; puoi riprendere da dove ti eri fermato. Riferimento generico completo:
`wiki/DOCKER_DEPLOY.md`.

## Decisioni prese

- **Nessun accesso diretto per Claude**: ogni comando (root e non-root) lo esegui tu dal tuo
  terminale SSH, incolli l'output in chat e si procede da lì. Nessuna chiave SSH condivisa.
- **Dominio + HTTPS da subito** (non prima HTTP sull'IP nudo).
- **Sul server esiste già un Caddy di sistema** (systemd, non Docker) che serve un altro sito,
  `finnet.nacci.eu`, sulle porte 80/443 — **temporaneo**, verrà eliminato in futuro. Per non
  disfare il disegno "tutto in Docker" (che andrebbe ricostruito da capo quando quel Caddy
  sparirà), lo stack Docker di fininzen **resta auto-contenuto con il proprio Caddy incluso**,
  ma temporaneamente:
  - il suo `Caddyfile` torna al blocco semplice `:80 { ... }` (niente TLS/dominio gestito da
    lui, routing interno invariato: `/static/*`, `/fininzen/api/*` con strip prefix, `/api/*`,
    resto → frontend);
  - è pubblicato su una porta host **alternativa** libera invece che su 80/443, tramite la
    variabile `HTTP_PORT` già presente nel compose (default 80, va solo impostata a es. `8080`
    nel `.env` — nessuna modifica di codice).
  Il Caddy di sistema ottiene lui il certificato Let's Encrypt per `fininzen.nacci.eu` (come
  già fa per `finnet`) e fa da relay: `reverse_proxy 127.0.0.1:8080` verso il Caddy Docker. Gli
  header di sicurezza restano nel Caddy Docker, attraversano il relay senza duplicazioni.
  **Quando il Caddy di sistema verrà eliminato**: si flippa `Caddyfile` su
  `fininzen.nacci.eu { ... }` (auto-TLS), `HTTP_PORT=80` + `443:443` nel compose, e si toglie
  il blocco relay dal Caddy di sistema — due file, poche righe, nessuna reintegrazione da capo.
- Reverse proxy = **Caddy** (non nginx — non c'è nginx nel repo). Fa da proxy *e* client ACME:
  gli basta il nome a dominio nel site block per ottenere/rinnovare da solo il certificato
  Let's Encrypt.
- Redis = container interno, mai esposto sull'host/internet. È il cache backend Django
  (`django.core.cache.backends.redis.RedisCache`, attivato da `REDIS_URL` —
  `fininzen/settings.py:370-374`) che rende condivisi tra i 2 worker gunicorn i bucket di
  `ScopedRateThrottle` di DRF. Bounded: `maxmemory 64mb`, `volatile-lru`, nessuna persistenza
  (è solo cache/throttle).
- `deploy/docker/`: `local/` = solo dev infra (Postgres+Redis); `production/` = lo stack
  completo che usiamo (compose.yml + Caddyfile + .env, Caddy incluso); `backend/` = immagine
  Django; `web/` = immagine Next.js.

## ⚠️ Attenzione: `just release` può spazzolare via modifiche non committate

`just release` (commitizen bump) fa un commit che include **tutti** i file modificati nel
working tree, non solo quelli di versioning, e poi lancia `git push --follow-tags` in
automatico. Se lanci `just release` da un altro terminale mentre ci sono modifiche di deploy
non ancora committate (mie o tue), finiscono pushate su `origin/main` insieme al bump di
versione, senza che nessuno lo chieda esplicitamente — già successo una volta in questo giro
(commit `b543f30`, tag `v0.3.0`). Prima di lanciare `just release`, verifica `git status` /
chiedimi se ci sono modifiche di deploy in sospeso.

## 0. Da fare prima di riprendere

- [ ] Verifica che i file in `deploy/docker/production/` e `wiki/VPS_DEPLOY_CHECKLIST.md`
      riflettano l'architettura "Caddy nello stack Docker, porta alternativa temporanea"
      descritta sopra (non quella "niente Caddy Docker" di un tentativo precedente, già
      superato). Se in dubbio, `git log --oneline -5` e chiedimi conferma.
- [ ] Push dei commit locali su `origin/main` (chiedimelo quando riprendi, o dimmi di farlo
      ora: `git push`).

## 1. DNS

- [ ] Crea un record **A**: `fininzen.nacci.eu` → `217.160.187.118` (TTL basso, es. 300s).
- [ ] Verifica propagazione: `dig fininzen.nacci.eu +short` → deve rispondere
      `217.160.187.118` da locale. Aspetta che risolva ovunque prima di ricaricare il Caddy di
      sistema con il nuovo site block, altrimenti la richiesta del certificato Let's Encrypt
      fallisce.

## 2. Setup — fase A, come **root** sulla VPS

- [ ] ```bash
      apt update && apt upgrade -y
      apt install -y git curl
      ```
- [ ] Verifica se Docker è già presente (probabilmente no, il sito esistente sembra bare-metal):
      ```bash
      docker --version && docker compose version
      ```
      Se manca, installa Docker Engine + Compose plugin (repo ufficiale, non `docker.io` di
      Debian):
      ```bash
      curl -fsSL https://get.docker.com | sh
      docker --version && docker compose version
      ```
- [ ] Utente non-root dedicato:
      ```bash
      adduser dockerapp
      usermod -aG docker dockerapp
      mkdir -p /opt/fininzen
      chown dockerapp:dockerapp /opt/fininzen
      ```
- [ ] Firewall — **verifica prima lo stato attuale**, probabilmente 80/443 sono già aperte per
      il sito esistente:
      ```bash
      ufw status
      ```
      Se non lo sono già (`ufw allow` è idempotente, ripeterlo non fa danni):
      ```bash
      ufw allow OpenSSH
      ufw allow 80/tcp
      ufw allow 443/tcp
      ufw enable
      ```
- [ ] Verifica che la porta scelta per il relay temporaneo (`8080` di default) sia libera:
      ```bash
      ss -ltnp | grep :8080   # deve restare vuoto
      ```
- [ ] Verifica gruppo (serve nuova sessione): `exit`, riconnetti come `dockerapp`,
      `getent group docker` deve elencarlo.
- [ ] (Quando l'accesso via chiave funziona) considera `PermitRootLogin no` e
      `PasswordAuthentication no` in `sshd_config`, poi riavvia `sshd`.

> Nota: il gruppo `docker` è root-equivalente (chi lancia container monta il filesystem
> host). Solo `dockerapp` dovrebbe starci.

## 3. Setup — fase B, come **dockerapp**

- [ ] Deploy key (sola lettura, un solo repo):
      ```bash
      ssh-keygen -t ed25519 -C "dockerapp@$(hostname) fininzen deploy" -f ~/.ssh/id_ed25519 -N ""
      cat ~/.ssh/id_ed25519.pub
      ```
      GitHub → repo → Settings → Deploy keys → Add deploy key (**senza** write access).
      Verifica: `ssh -T git@github.com`.
- [ ] Clone:
      ```bash
      cd /opt/fininzen
      git clone git@github.com:NacciVittorio/fininzen.git .
      git checkout main
      ```
- [ ] `.env` di produzione:
      ```bash
      cp deploy/docker/production/.env.example deploy/docker/production/.env
      chmod 600 deploy/docker/production/.env
      python3 -c "import secrets; print(secrets.token_urlsafe(64))"                   # DJANGO_SECRET_KEY
      python3 -c "import os,base64; print(base64.b64encode(os.urandom(32)).decode())" # FIELD_ENCRYPTION_KEYS
      nano deploy/docker/production/.env
      ```
      Valori da impostare:

      | Campo | Valore |
      |---|---|
      | `DJANGO_SECRET_KEY` | primo segreto generato |
      | `FIELD_ENCRYPTION_KEYS` | secondo segreto generato |
      | `POSTGRES_PASSWORD` | password robusta a scelta |
      | `DJANGO_ALLOWED_HOSTS` | `backend,localhost,127.0.0.1,fininzen.nacci.eu` |
      | `CSRF_TRUSTED_ORIGINS` | `https://fininzen.nacci.eu` |
      | `WEBAUTHN_RP_ID` | `fininzen.nacci.eu` |
      | `WEBAUTHN_ORIGIN` | `https://fininzen.nacci.eu` |
      | `DJANGO_SECURE_COOKIES` | `1` |
      | `DJANGO_SECURE_SSL_REDIRECT` | `1` |
      | `HTTP_PORT` | `8080` (o la porta libera verificata al passo 2) |

      `REDIS_URL` resta il default (`redis://redis:6379/0`).
- [ ] Build e avvio (stack completo, incluso il Caddy Docker sulla porta interna `HTTP_PORT`):
      ```bash
      cd /opt/fininzen
      docker compose --env-file deploy/docker/production/.env \
        -f deploy/docker/production/compose.yml up -d --build
      ```
- [ ] Primo utente admin:
      ```bash
      docker compose --env-file deploy/docker/production/.env \
        -f deploy/docker/production/compose.yml exec backend python manage.py createsuperuser
      ```
- [ ] Alias comodo (in `~/.bashrc` di dockerapp):
      ```bash
      alias dc='docker compose --env-file /opt/fininzen/deploy/docker/production/.env -f /opt/fininzen/deploy/docker/production/compose.yml'
      ```
- [ ] Cron `dockerapp` (`crontab -e`): refresh prezzi orario (§7 `wiki/DOCKER_DEPLOY.md`) +
      `scripts/backup_db.sh` (+ eventuale `scripts/backup_offsite.sh`).

## 4. Blocco relay sul Caddy di sistema (temporaneo, come **root**)

- [ ] Apri il Caddyfile di sistema (es. `/etc/caddy/Caddyfile`) e aggiungi un **nuovo** site
      block, accanto a quello di `finnet.nacci.eu` già presente:
      ```
      fininzen.nacci.eu {
          reverse_proxy 127.0.0.1:8080
      }
      ```
      (porta = `HTTP_PORT` impostata nel `.env` al passo 3).
- [ ] Ricarica e verifica:
      ```bash
      systemctl reload caddy
      journalctl -u caddy -f   # conferma emissione certificato Let's Encrypt, nessun errore ACME
      ```

## 5. Verifica di un deploy reale

- [ ] `dc ps` → tutti i servizi (`postgres`, `redis`, `backend`, `frontend`, `caddy`)
      `healthy`/`running`.
- [ ] `dc logs -f caddy` → nessun errore nel Caddy Docker (routing interno).
- [ ] `journalctl -u caddy -n50` (Caddy di sistema) → certificato per `fininzen.nacci.eu`
      emesso.
- [ ] `curl -I https://fininzen.nacci.eu` → 200/307, TLS ok (terminato dal Caddy di sistema).
- [ ] `bash scripts/smoke_test.sh https://fininzen.nacci.eu` (già puntato di default a questo
      dominio) → `/login` renderizzata, asset hashati con `Cache-Control: immutable`,
      `/fininzen/api/health/` ok, `/fininzen/api/auth/profile/` → 401 da anonimo.
- [ ] Login reale da browser con l'utente admin, per confermare i cookie `Secure` sotto HTTPS.
- [ ] Conferma che `finnet.nacci.eu` continui a funzionare invariato (nessuna regressione dal
      nuovo site block/relay).

Se qualcosa fallisce: incolla l'output (log/curl) in chat. Cause tipiche: porta `8080` già
occupata, DNS non propagato, relay non ricaricato sul Caddy di sistema, valore nel `.env` non
aggiornato al dominio/porta.
