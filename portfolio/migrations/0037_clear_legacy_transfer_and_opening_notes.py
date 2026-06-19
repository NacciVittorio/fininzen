from django.db import migrations


def clear_legacy_notes(apps, schema_editor):
    AssetTransaction = apps.get_model("portfolio", "AssetTransaction")

    AssetTransaction.objects.filter(
        transaction_type="cash_in",
        derived_from__isnull=True,
        notes="Saldo iniziale",
    ).update(notes="")

    AssetTransaction.objects.filter(
        transaction_type="cash_out",
        derived_txs__isnull=False,
        notes__startswith="Trasferimento → ",
    ).distinct().update(notes="")

    AssetTransaction.objects.filter(
        transaction_type="cash_in",
        derived_from__isnull=False,
        notes__startswith="Trasferimento ← ",
    ).update(notes="")


class Migration(migrations.Migration):
    dependencies = [
        ("portfolio", "0036_clear_legacy_adjustment_notes"),
    ]
    operations = [
        migrations.RunPython(clear_legacy_notes, migrations.RunPython.noop),
    ]
