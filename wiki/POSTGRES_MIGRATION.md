# Migrazione SQLite → PostgreSQL + cifratura campi

Questa guida copre il passaggio una-tantum dal vecchio `db.sqlite3` a PostgreSQL,
con cifratura applicativa AES-256-GCM dei campi sensibili. Dopo lo switch la
produzione gira solo su Postgres.

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
con `BACKUP_ENC_PASSPHRASE` (vedi sotto).

## 0. Prerequisiti

```bash
apt install -y postgresql postgresql-client openssl
sudo -u postgres psql -c "CREATE USER finnet WITH PASSWORD 'CHANGE_ME';"
sudo -u postgres psql -c "CREATE DATABASE finnet OWNER finnet;"
```

Genera una chiave di cifratura a 32 byte (base64):

```bash
python3 -c "import os,base64;print(base64.b64encode(os.urandom(32)).decode())"
```

In `/etc/finnet.env` aggiungi (vedi anche `.env.example`):

```bash
DATABASE_URL=postgres://finnet:CHANGE_ME@127.0.0.1:5432/finnet
FIELD_ENCRYPTION_KEYS=<chiave-base64-32-byte>
# opzionale ma raccomandato: cifra i dump a riposo
BACKUP_ENC_PASSPHRASE=<passphrase-lunga-random>
```

`FIELD_ENCRYPTION_KEYS` accetta più chiavi separate da virgola: la **prima**
cifra, le altre restano valide per la decifratura (rotazione chiavi).

## 1. Cutover (finestra di manutenzione breve)

```bash
# 1. App in manutenzione, ferma i worker
systemctl stop finnet

# 2. Backup del SQLite di origine + integrity check (NON copiare a caldo: usa .backup)
sqlite3 /opt/finnet/db.sqlite3 ".backup '/var/backups/finnet/pre_pg_$(date +%F).sqlite3'"
sqlite3 /var/backups/finnet/pre_pg_*.sqlite3 "PRAGMA integrity_check;"   # deve dire: ok

# 3. Crea lo schema sul Postgres VUOTO (carica le env con DATABASE_URL + chiave)
set -a; source /etc/finnet.env; set +a
/opt/finnet/venv/bin/python manage.py migrate

# 4. Copia i dati attraverso l'ORM (cifra in scrittura). Prima un dry-run:
/opt/finnet/venv/bin/python manage.py migrate_sqlite_to_postgres \
    --sqlite-path /var/backups/finnet/pre_pg_*.sqlite3 --dry-run
# poi l'esecuzione reale:
/opt/finnet/venv/bin/python manage.py migrate_sqlite_to_postgres \
    --sqlite-path /var/backups/finnet/pre_pg_*.sqlite3 --apply

# 5. Audit integrità di dominio sul nuovo DB
/opt/finnet/venv/bin/python manage.py audit_domain_integrity

# 6. Riavvia e smoke test
systemctl start finnet
/opt/finnet/scripts/smoke_test.sh https://finnet.nacci.eu
```

Il comando preserva le primary key, usa `bulk_create`/`bulk_update` (niente
signal), tiene i timestamp originali, gestisce le FK cicliche
(`Category.parent`, `Asset.source_account`/`previous_account`,
`AssetTransaction.derived_from`) in due fasi, riallinea le sequenze Postgres e
verifica i conteggi per modello. **Cancella** eventuali righe seed create da
`migrate` (es. InvestmentType di default) prima di copiare.

Non vengono migrati (gli utenti rifanno login dopo lo switch): sessioni, token
JWT outstanding/blacklist, WebAuthn challenge temporanee, e ContentType/
Permission/Group (rigenerati da `migrate`).

Verifica in qualsiasi momento i conteggi sorgente vs destinazione:

```bash
manage.py migrate_sqlite_to_postgres --sqlite-path <legacy.sqlite3> --verify-only
```

## 2. Rollback

Lo switch fallisce? Il SQLite originale resta intatto:

```bash
systemctl stop finnet
# Rimuovi DATABASE_URL/POSTGRES_* da /etc/finnet.env (torna a SQLite)
# e rimuovi FIELD_ENCRYPTION_KEYS solo se torni completamente a SQLite in DEBUG
systemctl start finnet
```

Tieni il SQLite originale finché la validazione su Postgres non è completa.

## 3. Backup & restore (steady state, Postgres)

`scripts/deploy.sh` fa un `pg_dump --format=custom` prima di ogni migrazione e
lo cifra con `BACKUP_ENC_PASSPHRASE` se impostata. `scripts/backup_offsite.sh`
replica i file `*.dump` / `*.dump.enc`.

Restore:

```bash
# Se cifrato, decifra prima:
openssl enc -d -aes-256-cbc -pbkdf2 -in db_YYYYMMDD.dump.enc \
    -out db_YYYYMMDD.dump -pass env:BACKUP_ENC_PASSPHRASE

# Ripristina (DROP + ricrea oggetti):
pg_restore --clean --if-exists --no-owner -d "$DATABASE_URL" db_YYYYMMDD.dump
```

I valori cifrati nel dump sono leggibili solo con la `FIELD_ENCRYPTION_KEYS`
corrispondente: conserva la chiave separata dai backup.
