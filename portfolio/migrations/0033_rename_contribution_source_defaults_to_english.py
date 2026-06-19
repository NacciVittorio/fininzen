from django.db import migrations


DEFAULT_SOURCE_RENAMES = {
    "Trattenuta stipendio": "Payroll withholding",
    "Contributo datore": "Employer contribution",
    "Altro non da conto": "Other non-account source",
}


def _rename_defaults(apps, old_to_new):
    ContributionSource = apps.get_model("portfolio", "ContributionSource")
    for old_name, new_name in old_to_new.items():
        for source in ContributionSource.objects.filter(name=old_name).iterator():
            target_exists = ContributionSource.objects.filter(
                owner_id=source.owner_id,
                name=new_name,
            ).exists()
            if target_exists:
                continue
            source.name = new_name
            source.save(update_fields=["name"])


def rename_defaults_to_english(apps, schema_editor):
    _rename_defaults(apps, DEFAULT_SOURCE_RENAMES)


def rename_defaults_to_italian(apps, schema_editor):
    reverse_map = {new: old for old, new in DEFAULT_SOURCE_RENAMES.items()}
    _rename_defaults(apps, reverse_map)


class Migration(migrations.Migration):
    dependencies = [
        ("portfolio", "0032_drop_legacy_contribution_source_column"),
    ]

    operations = [
        migrations.RunPython(rename_defaults_to_english, rename_defaults_to_italian),
    ]
