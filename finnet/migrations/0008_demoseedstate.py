from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("finnet", "0007_webauthncredential_webauthnchallenge"),
    ]

    operations = [
        migrations.CreateModel(
            name="DemoSeedState",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                ("key", models.CharField(max_length=32, unique=True)),
                (
                    "last_seeded_month",
                    models.CharField(blank=True, default="", max_length=7),
                ),
                (
                    "seed_version",
                    models.CharField(blank=True, default="", max_length=16),
                ),
                ("last_seeded_at", models.DateTimeField(blank=True, null=True)),
            ],
            options={
                "verbose_name": "Demo Seed State",
                "verbose_name_plural": "Demo Seed States",
            },
        ),
    ]
