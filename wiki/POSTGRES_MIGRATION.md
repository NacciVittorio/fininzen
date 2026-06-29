# Migrazione SQLite → PostgreSQL + cifratura campi

Questa guida copre il passaggio una-tantum dal vecchio `db.sqlite3` (database di
sviluppo) al PostgreSQL dello stack Docker, con cifratura applicativa
AES-256-GCM dei campi sensibili. Dopo lo switch la produzione gira solo su
Postgres dentro i container.

Presuppone lo stack già in piedi (`just stack-up`) e un `.env` completo in
`deploy/docker/stack/.env` — vedi [DOCKER_DEPLOY.md](DOCKER_DEPLOY.md).

## Cosa viene cifrato

Cifrati a riposo (AES-256-GCM, envelope `fenc:v1:…`):

- `portfolio.Asset.notes`
- `expenses.RecurringExpense.description`
- `expenses.ExpenseDescriptionSuggestion.text` (+ blind index `text_bidx`
  deterministico per lookup esatti/unicità e autocomplete)

Restano **in chiaro** per non rompere query/aggregazioni/ordinamenti/vincoli:
importi, date, FK, owner, tipi transazione, ticker, e `Expense.description`
(usato dalla ricerca cashflow che alimenta i totali `Sum` — un blind index a
trigram produrrebbe falsi positivi e gonfierebbe i totali).

I backup (`pg_dump`) contengono comunque importi/date in chiaro: cifrali a riposo
con `BACKUP_ENC_PASSPHRASE` (vedi [DOCKER_DEPLOY.md](DOCKER_DEPLOY.md) §8).

## Come funziona la cifratura in migrazione

Il `db.sqlite3` di sviluppo ha i campi sensibili in **chiaro**. Il command legge
le righe *attraverso l'ORM* — la lettura di un valore non-cifrato passa intatta —
e le **ricifra in scrittura** usando la `FIELD_ENCRYPTION_KEYS` del `.env` dello
stack. Non esiste quindi una "chiave originale" da far combaciare: è la prima
volta che quei dati vengono cifrati, e qualunque chiave valida nel `.env` va bene.

Se invece migrassi da un sorgente **già cifrato** (es. un altro deploy), la sua
chiave dovrebbe essere presente in `FIELD_ENCRYPTION_KEYS` per poter decifrare in
lettura. Il command si rifiuta di scrivere in Postgres senza chiave (i campi
finirebbero in chiaro) a meno di `--allow-plaintext` esplicito.

## 0. Prerequisiti

Lo schema su Postgres viene già creato dall'entrypoint del container backend
(`manage.py migrate` all'avvio), quindi al primo `stack-up` il DB ha solo le
righe seed (es. `InvestmentType` di default), che il command cancella prima di
copiare. Serve solo che `FIELD_ENCRYPTION_KEYS` sia valorizzata nel `.env`:

```bash
# genera una chiave a 32 byte (base64) se non l'hai già messa nel .env
python3 -c "import os,base64;print(base64.b64encode(os.urandom(32)).decode())"
```

`FIELD_ENCRYPTION_KEYS` accetta più chiavi separate da virgola: la **prima**
cifra, le altre restano valide per la decifratura (rotazione chiavi).

> **Ordine consigliato:** migra *prima* di creare un superuser a mano. Il sorgente
> porta già i suoi utenti (admin incluso). Se hai già lanciato
> `just stack-superuser`, vedi la nota su `--force` al passo 3.

## 1. Sul Mac (o macchina di sviluppo) — prepara e trasferisci il sorgente

```bash
# Snapshot consistente: NON copiare il file a caldo, usa .backup
sqlite3 db.sqlite3 ".backup '/tmp/fininzen_src.sqlite3'"
sqlite3 /tmp/fininzen_src.sqlite3 "PRAGMA integrity_check;"   # deve dire: ok

# Spedisci alla VM (sostituisci VM_IP)
scp /tmp/fininzen_src.sqlite3 dockerapp@VM_IP:/opt/fininzen/migrate_src.sqlite3
```

## 2. Sulla VM — copia il sorgente nel container

```bash
cd /opt/fininzen
DC="docker compose --env-file deploy/docker/stack/.env -f deploy/docker/stack/compose.yml"

# Il db.sqlite3 è in .dockerignore (non è dentro l'immagine): va copiato
# nel backend in esecuzione.
$DC cp migrate_src.sqlite3 backend:/tmp/migrate_src.sqlite3
```

## 3. Migrazione (attraverso l'ORM, cifra in scrittura)

```bash
# DRY-RUN — conta le righe, non scrive nulla. Cerca la riga "Encryption ENABLED".
$DC exec backend python manage.py migrate_sqlite_to_postgres \
    --sqlite-path /tmp/migrate_src.sqlite3 --dry-run

# APPLY — copia e CIFRA dentro Postgres.
$DC exec backend python manage.py migrate_sqlite_to_postgres \
    --sqlite-path /tmp/migrate_src.sqlite3 --apply
```

> **Se hai già creato un superuser** (`just stack-superuser`), la destinazione ha
> già un utente e `--apply` si rifiuta per non sovrascrivere dati per errore.
> Aggiungi `--force`: il command azzera la destinazione e la rimpiazza con gli
> utenti reali del sorgente (il tuo admin è tra questi, con il suo flag
> superuser).

Il command preserva le primary key, usa `bulk_create`/`bulk_update` (niente
signal), tiene i timestamp originali, gestisce le FK cicliche
(`Category.parent`, `Asset.source_account`/`previous_account`,
`AssetTransaction.derived_from`) in due fasi, riallinea le sequenze Postgres e
verifica i conteggi per modello.

Non vengono migrati (gli utenti rifanno login dopo lo switch): sessioni, token
JWT outstanding/blacklist, WebAuthn challenge temporanee, e ContentType/
Permission/Group (rigenerati da `migrate`). Il biometrico (Face/Touch ID) va
comunque ri-registrato (cambia l'origin; e su `http://IP` WebAuthn non funziona
da remoto).

## 4. Verifica

```bash
# Conteggi sorgente vs destinazione: tutto deve essere OK
$DC exec backend python manage.py migrate_sqlite_to_postgres \
    --sqlite-path /tmp/migrate_src.sqlite3 --verify-only

# Audit integrità di dominio sul nuovo DB
$DC exec backend python manage.py audit_domain_integrity
```

## 5. Pulizia (importante)

Il sqlite contiene dati finanziari in **chiaro**: non lasciarlo in giro.

```bash
$DC exec backend rm -f /tmp/migrate_src.sqlite3   # dentro il container
rm -f /opt/fininzen/migrate_src.sqlite3           # sulla VM
# e sul Mac:
# rm -f /tmp/fininzen_src.sqlite3
```

## 6. Rollback

Lo switch fallisce? Il SQLite originale sul Mac resta intatto: nessun dato perso.
Per ripartire da uno stato pulito su Postgres:

```bash
$DC down -v        # ⚠️ rimuove anche il volume dati Postgres
$DC up -d --build  # schema ricreato vuoto dall'entrypoint
```

Poi ripeti dal passo 2. Tieni il SQLite originale finché la validazione su
Postgres non è completa.

## 7. Backup & restore (steady state, Postgres)

Esegui `scripts/backup_db.sh` periodicamente (pg_dump `--format=custom` dal
container, con rotazione e cifratura at-rest opzionale) — vedi
[DOCKER_DEPLOY.md](DOCKER_DEPLOY.md) §8. `scripts/backup_offsite.sh` replica
off-site i file `*.dump` / `*.dump.enc`.

Restore dentro lo stack:

```bash
# Se cifrato, decifra prima:
openssl enc -d -aes-256-cbc -pbkdf2 -in fininzen_YYYYMMDD.dump.enc \
    -out fininzen_YYYYMMDD.dump -pass env:BACKUP_ENC_PASSPHRASE

# Ripristina nel container postgres (DROP + ricrea oggetti):
$DC cp fininzen_YYYYMMDD.dump postgres:/tmp/restore.dump
$DC exec -T postgres sh -c \
    'pg_restore --clean --if-exists --no-owner -U "$POSTGRES_USER" -d "$POSTGRES_DB" /tmp/restore.dump'
$DC exec postgres rm -f /tmp/restore.dump
```

I valori cifrati nel dump sono leggibili solo con la `FIELD_ENCRYPTION_KEYS`
corrispondente: conserva la chiave separata dai backup.
