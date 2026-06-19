from django.db import migrations


def create_demo_seed_state(apps, schema_editor):
    DemoSeedState = apps.get_model("fininzen", "DemoSeedState")
    DemoSeedState.objects.get_or_create(
        key="shared-demo",
        defaults={
            "last_seeded_month": "",
            "seed_version": "",
            "last_seeded_at": None,
        },
    )


class Migration(migrations.Migration):
    dependencies = [
        ("fininzen", "0008_demoseedstate"),
    ]

    operations = [
        migrations.RunPython(create_demo_seed_state, migrations.RunPython.noop),
    ]
