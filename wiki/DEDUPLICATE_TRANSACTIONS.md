# Deduplica transazioni

Questa procedura corregge i duplicati trovati nel cashflow (`expenses_expense`).
Le transazioni portfolio (`portfolio_assettransaction`) non risultano duplicate.

Non usare `DELETE` SQL diretto: la cancellazione deve passare dall'ORM Django,
cosi i segnali eliminano anche le transazioni ombra collegate e ricalcolano il
saldo degli asset.

## Test locale eseguito

Test fatto su una copia temporanea del database locale:

```bash
sqlite3 db.sqlite3 ".backup '/private/tmp/fininzen_dedupe_test.sqlite3'"
sqlite3 db.sqlite3 "PRAGMA integrity_check;"
```

Risultato iniziale:

```text
portfolio_assettransaction: 0 gruppi duplicati, 0 righe extra
expenses_expense: 7 gruppi duplicati, 7 righe extra
```

Dry-run sulla copia:

```text
KEEP 607 DELETE [609] date 2025-04-06 amount 4.50 desc Car accessory/toll
KEEP 862 DELETE [863] date 2024-10-02 amount 2.40 desc Sweet
KEEP 2395 DELETE [2397] date 2023-08-20 amount 20.00 desc Grandmother
KEEP 2247 DELETE [2248] date 2023-08-10 amount 300.00 desc Father
KEEP 1594 DELETE [1596] date 2023-04-08 amount 4.70 desc Car accessory/toll
KEEP 2052 DELETE [2053] date 2022-04-16 amount 4.40 desc Highway toll
KEEP 2473 DELETE [2474] date 2022-03-27 amount 20.00 desc Grandmother
TOTAL_TO_DELETE 7 [609, 863, 2397, 2248, 1596, 2053, 2474]
```

Applicazione sulla copia:

```text
DELETE_IDS [609, 863, 1596, 2053, 2248, 2397, 2474]
DELETED 7 {'expenses.Expense': 7}
```

Controllo finale sulla copia:

```text
expenses_expense: 0 gruppi duplicati, 0 righe extra
portfolio_assettransaction: 0 gruppi duplicati, 0 righe extra
Recomputed 42 assets, rebuilt 9 manual histories, invalidated 2 summaries.
Domain integrity OK.
```

## Comandi VPS

### 1. Ferma app e crea backup consistente

```bash
sudo systemctl stop fininzen

cd /opt/fininzen
STAMP="$(date +%Y%m%d_%H%M%S)"

sudo -u fininzen mkdir -p /opt/fininzen/backups
sudo -u fininzen sqlite3 /opt/fininzen/db.sqlite3 ".backup '/opt/fininzen/backups/db.sqlite3.before_dedupe.$STAMP'"
sudo -u fininzen sqlite3 "/opt/fininzen/backups/db.sqlite3.before_dedupe.$STAMP" "PRAGMA integrity_check;"
```

L'ultimo comando deve stampare:

```text
ok
```

### 2. Verifica duplicati portfolio

```bash
sudo -u fininzen sqlite3 -header -column /opt/fininzen/db.sqlite3 "
SELECT COUNT(*) AS portfolio_duplicate_groups, COALESCE(SUM(n - 1),0) AS extra_rows
FROM (
  SELECT COUNT(*) n
  FROM portfolio_assettransaction
  GROUP BY owner_id, asset_id, transaction_type, date, shares, price_per_share,
           COALESCE(notes,''), contribution_source_id, source_expense_id,
           derived_from_id, is_verified
  HAVING COUNT(*) > 1
);
"
```

Atteso:

```text
portfolio_duplicate_groups  extra_rows
--------------------------  ----------
0                           0
```

### 3. Dry-run duplicati cashflow

```bash
sudo -u fininzen /opt/fininzen/venv/bin/python manage.py shell -c '
from django.db.models import Count, Min
from expenses.models import Expense

fields = [
    "owner_id", "date", "amount", "category_id", "linked_asset_id",
    "recurring_source_id", "recurring_occurrence_date", "description", "is_verified",
]

groups = (
    Expense.objects.values(*fields)
    .annotate(n=Count("id"), keep_id=Min("id"))
    .filter(n__gt=1)
    .order_by("-date")
)

delete_ids = []
for g in groups:
    qs = (
        Expense.objects
        .filter(**{f: g[f] for f in fields})
        .exclude(id=g["keep_id"])
        .order_by("id")
    )
    ids = list(qs.values_list("id", flat=True))
    delete_ids.extend(ids)
    print("KEEP", g["keep_id"], "DELETE", ids, "date", g["date"], "amount", g["amount"], "desc", g["description"])

print("TOTAL_TO_DELETE", len(delete_ids), delete_ids)
'
```

Se la VPS ha gli stessi dati del locale, l'output deve indicare 7 righe da
cancellare:

```text
TOTAL_TO_DELETE 7 [609, 863, 2397, 2248, 1596, 2053, 2474]
```

### 4. Applica deduplica cashflow

Esegui questo comando solo se il dry-run e corretto.

```bash
sudo -u fininzen /opt/fininzen/venv/bin/python manage.py shell -c '
from django.db import transaction
from django.db.models import Count, Min
from expenses.models import Expense

fields = [
    "owner_id", "date", "amount", "category_id", "linked_asset_id",
    "recurring_source_id", "recurring_occurrence_date", "description", "is_verified",
]

groups = (
    Expense.objects.values(*fields)
    .annotate(n=Count("id"), keep_id=Min("id"))
    .filter(n__gt=1)
)

delete_ids = []
for g in groups:
    delete_ids.extend(
        Expense.objects
        .filter(**{f: g[f] for f in fields})
        .exclude(id=g["keep_id"])
        .values_list("id", flat=True)
    )

with transaction.atomic():
    deleted, details = Expense.objects.filter(id__in=delete_ids).delete()

print("DELETE_IDS", sorted(delete_ids))
print("DELETED", deleted, details)
'
```

### 5. Verifica post-fix

```bash
sudo -u fininzen sqlite3 -header -column /opt/fininzen/db.sqlite3 "
SELECT COUNT(*) AS expense_duplicate_groups, COALESCE(SUM(n - 1),0) AS extra_rows
FROM (
  SELECT COUNT(*) n
  FROM expenses_expense
  GROUP BY owner_id, date, amount, category_id, linked_asset_id,
           recurring_source_id, recurring_occurrence_date,
           COALESCE(description,''), is_verified
  HAVING COUNT(*) > 1
);

SELECT COUNT(*) AS portfolio_duplicate_groups, COALESCE(SUM(n - 1),0) AS extra_rows
FROM (
  SELECT COUNT(*) n
  FROM portfolio_assettransaction
  GROUP BY owner_id, asset_id, transaction_type, date, shares, price_per_share,
           COALESCE(notes,''), contribution_source_id, source_expense_id,
           derived_from_id, is_verified
  HAVING COUNT(*) > 1
);
"
```

Atteso:

```text
expense_duplicate_groups  extra_rows
------------------------  ----------
0                         0

portfolio_duplicate_groups  extra_rows
--------------------------  ----------
0                           0
```

### 6. Ricalcola ledger e audit

```bash
sudo -u fininzen /opt/fininzen/venv/bin/python manage.py recompute_verified_ledger --apply
sudo -u fininzen /opt/fininzen/venv/bin/python manage.py audit_domain_integrity
```

L'audit deve finire con:

```text
Domain integrity OK.
```

Se il deploy include la versione applicativa con repair dei mirror collegati,
puoi usare direttamente:

```bash
sudo -u fininzen /opt/fininzen/venv/bin/python manage.py audit_domain_integrity --apply
```

Questo ripara anche:

- transazioni ombra delle spese collegate ad account bancari;
- mirror derivati da acquisti/vendite/trasferimenti (`derived_from`);
- saldi degli account manuali toccati dalla repair.

### 7. Riavvia app

```bash
sudo systemctl start fininzen
sudo systemctl status fininzen --no-pager
```

## Ripristino backup

Da usare solo se qualcosa va storto, sostituendo il nome del backup con quello
creato nello step 1.

```bash
sudo systemctl stop fininzen
sudo -u fininzen sqlite3 /opt/fininzen/db.sqlite3 ".restore '/opt/fininzen/backups/db.sqlite3.before_dedupe.YYYYMMDD_HHMMSS'"
sudo -u fininzen sqlite3 /opt/fininzen/db.sqlite3 "PRAGMA integrity_check;"
sudo systemctl start fininzen
```
