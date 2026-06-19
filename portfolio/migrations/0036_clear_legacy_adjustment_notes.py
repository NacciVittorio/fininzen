from django.db import migrations


LEGACY_NOTE = "Rettifica manuale saldo"
ADJUSTMENT = "adjustment"


def clear_legacy_adjustment_notes(apps, schema_editor):
    AssetTransaction = apps.get_model("portfolio", "AssetTransaction")
    AssetTransaction.objects.filter(
        transaction_type=ADJUSTMENT,
        notes=LEGACY_NOTE,
    ).update(notes="")


def restore_legacy_adjustment_notes(apps, schema_editor):
    AssetTransaction = apps.get_model("portfolio", "AssetTransaction")
    AssetTransaction.objects.filter(
        transaction_type=ADJUSTMENT,
        notes="",
    ).update(notes=LEGACY_NOTE)


class Migration(migrations.Migration):
    dependencies = [
        ("portfolio", "0035_asset_previous_account"),
    ]
    operations = [
        migrations.RunPython(
            clear_legacy_adjustment_notes,
            restore_legacy_adjustment_notes,
        ),
    ]
