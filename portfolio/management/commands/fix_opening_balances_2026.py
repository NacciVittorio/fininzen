"""
fix_opening_balances_2026 — Imposta i saldi iniziali al 1 gennaio 2026.

Logica
------
Il saldo corrente di un asset MANUAL è:
    current_value = opening_balance_correction + (CASH_IN - CASH_OUT) + other_ADJUSTMENT

dove `opening_balance_correction` è la somma delle transazioni ADJUSTMENT con note che
iniziano con OPENING_BALANCE_NOTE_PREFIX.

Per raggiungere il valore target:
    required_correction = target - total_net_cash_flows

dove total_net_cash_flows include tutte le transazioni verified (CASH_IN/CASH_OUT/other_ADJUSTMENT)
escluse quelle di opening balance.

Il campo `asset.opening_balance` (DB) viene aggiornato in sincronia con la correction transaction
perché rebuild_manual_history lo legge direttamente (non dalle transazioni).

Uso
---
    # Dry-run (stampa cosa cambierebbe, non modifica nulla)
    python manage.py fix_opening_balances_2026

    # Esegui le modifiche
    python manage.py fix_opening_balances_2026 --apply
"""

from datetime import date
from decimal import Decimal

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction as db_transaction
from django.utils import timezone

from portfolio.models import (
    Asset,
    AssetTransaction,
    OPENING_BALANCE_NOTE_PREFIX,
)
from portfolio.services import _refresh_manual_asset_strict

TARGET_DATE = date(2026, 1, 1)

# Valore target del current_value finale per ogni account
TARGET_BALANCES = {
    "Fineco": Decimal("29719.50"),
    "Trade Republic": Decimal("3060.53"),
    "Cash": Decimal("20.00"),
    "Edenred": Decimal("0.00"),
    "Arca Fondi": Decimal("0.00"),
    "PayPal": Decimal("0.00"),
}


class Command(BaseCommand):
    help = "Imposta saldi iniziali al 1 gennaio 2026 per tutti gli account manuali."

    def add_arguments(self, parser):
        parser.add_argument(
            "--apply",
            action="store_true",
            default=False,
            help="Esegui le modifiche. Senza questo flag è un dry-run.",
        )

    def handle(self, *args, **options):
        apply = options["apply"]
        today = timezone.localdate()

        if not apply:
            self.stdout.write(
                self.style.WARNING("=== DRY-RUN (usa --apply per eseguire) ===\n")
            )
        else:
            self.stdout.write(self.style.WARNING("=== APPLY MODE ===\n"))

        errors = []

        for asset_name, target in TARGET_BALANCES.items():
            self.stdout.write(f"--- {asset_name} ---")
            try:
                asset = Asset.objects.get(name=asset_name, tracking_type=Asset.MANUAL)
            except Asset.DoesNotExist:
                msg = f"  ERRORE: asset '{asset_name}' non trovato con tracking_type=MANUAL"
                self.stdout.write(self.style.ERROR(msg))
                errors.append(msg)
                continue
            except Asset.MultipleObjectsReturned:
                msg = f"  ERRORE: trovati più asset con nome '{asset_name}'"
                self.stdout.write(self.style.ERROR(msg))
                errors.append(msg)
                continue

            # Trova eventuali correction transactions esistenti
            existing_corrections = asset.transactions.filter(
                transaction_type=AssetTransaction.ADJUSTMENT,
                notes__startswith=OPENING_BALANCE_NOTE_PREFIX,
            )

            # Calcola il netto di tutte le transazioni NON-correction (verified, <= oggi)
            regular_txs = asset.transactions.filter(
                is_verified=True, date__lte=today
            ).exclude(
                transaction_type=AssetTransaction.ADJUSTMENT,
                notes__startswith=OPENING_BALANCE_NOTE_PREFIX,
            )
            cash_in = sum(
                (
                    t.price_per_share
                    for t in regular_txs.filter(
                        transaction_type=AssetTransaction.CASH_IN
                    )
                ),
                Decimal("0"),
            )
            cash_out = sum(
                (
                    t.price_per_share
                    for t in regular_txs.filter(
                        transaction_type=AssetTransaction.CASH_OUT
                    )
                ),
                Decimal("0"),
            )
            other_adj = sum(
                (
                    t.price_per_share
                    for t in regular_txs.filter(
                        transaction_type=AssetTransaction.ADJUSTMENT
                    )
                ),
                Decimal("0"),
            )
            total_net = (cash_in - cash_out + other_adj).quantize(Decimal("0.01"))
            required_correction = (target - total_net).quantize(Decimal("0.01"))

            self.stdout.write(f"  current_value DB:     {asset.current_value}")
            self.stdout.write(
                f"  opening_balance DB:   {asset.opening_balance}  (data: {asset.opening_balance_date})"
            )
            self.stdout.write(
                f"  correction tx esistenti: {existing_corrections.count()}"
            )
            for c in existing_corrections:
                self.stdout.write(
                    f"    id={c.id} date={c.date} amount={c.price_per_share}"
                )
            self.stdout.write(
                f"  net cash flows (non-correction): {total_net}"
                f"  (cash_in={cash_in} cash_out={cash_out} other_adj={other_adj})"
            )
            self.stdout.write(f"  target current_value: {target}")
            self.stdout.write(
                f"  => required opening correction: {required_correction}"
            )

            if apply:
                with db_transaction.atomic():
                    # 1. Elimina correction transactions esistenti
                    deleted_count = existing_corrections.count()
                    existing_corrections.delete()
                    if deleted_count:
                        self.stdout.write(
                            self.style.WARNING(
                                f"  Eliminate {deleted_count} correction tx"
                            )
                        )

                    # 2. Aggiorna i campi opening_balance direttamente sull'Asset
                    #    (rebuild_manual_history li legge dal DB, non dalle correction tx)
                    asset.opening_balance = required_correction
                    asset.opening_balance_date = (
                        TARGET_DATE if required_correction != 0 else None
                    )
                    asset.save(
                        update_fields=["opening_balance", "opening_balance_date"]
                    )

                    # 3. Crea la nuova correction transaction (solo se diversa da 0)
                    if required_correction != Decimal("0"):
                        owner = asset.owner
                        AssetTransaction.objects.create(
                            asset=asset,
                            transaction_type=AssetTransaction.ADJUSTMENT,
                            date=TARGET_DATE,
                            shares=Decimal("1"),
                            price_per_share=required_correction,
                            notes=f"{OPENING_BALANCE_NOTE_PREFIX} al {TARGET_DATE}",
                            is_verified=True,
                            owner=owner,
                        )
                        self.stdout.write(
                            self.style.SUCCESS(
                                f"  Creata correction tx: date={TARGET_DATE} amount={required_correction}"
                            )
                        )
                    else:
                        self.stdout.write(
                            "  Nessuna correction tx creata (importo = 0)"
                        )

                    # 4. Ricalcola asset (recompute + rebuild history)
                    _refresh_manual_asset_strict(asset)
                    asset.refresh_from_db()

                    # 5. Verifica
                    if asset.current_value == target:
                        self.stdout.write(
                            self.style.SUCCESS(
                                f"  ✓ current_value = {asset.current_value} (OK)"
                            )
                        )
                    else:
                        self.stdout.write(
                            self.style.ERROR(
                                f"  ✗ current_value = {asset.current_value} (atteso {target})"
                            )
                        )
                        errors.append(
                            f"{asset_name}: current_value={asset.current_value} != target={target}"
                        )

            self.stdout.write("")

        if errors:
            self.stdout.write(self.style.ERROR(f"\n{len(errors)} errore/i:"))
            for e in errors:
                self.stdout.write(self.style.ERROR(f"  - {e}"))
            raise CommandError("Completato con errori.")
        else:
            status = "Dry-run completato" if not apply else "Completato con successo"
            self.stdout.write(self.style.SUCCESS(f"\n{status}."))
