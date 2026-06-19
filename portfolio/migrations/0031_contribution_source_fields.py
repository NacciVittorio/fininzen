from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


DEFAULT_CONTRIBUTION_SOURCE_NAMES = [
    "Trattenuta stipendio",
    "Contributo datore",
    "TFR",
    "Altro non da conto",
]


def create_default_contribution_sources(apps, schema_editor):
    app_label, model_name = settings.AUTH_USER_MODEL.split(".")
    User = apps.get_model(app_label, model_name)
    ContributionSource = apps.get_model("portfolio", "ContributionSource")
    for user in User.objects.all():
        for idx, name in enumerate(DEFAULT_CONTRIBUTION_SOURCE_NAMES):
            ContributionSource.objects.get_or_create(
                owner=user,
                name=name,
                defaults={"sort_order": idx, "is_active": True},
            )


class Migration(migrations.Migration):
    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("portfolio", "0030_verify_adjustment_transactions"),
    ]

    operations = [
        migrations.CreateModel(
            name="ContributionSource",
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
                ("name", models.CharField(max_length=80)),
                ("sort_order", models.PositiveIntegerField(default=0)),
                ("is_active", models.BooleanField(default=True)),
                (
                    "owner",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.CASCADE,
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "ordering": ["sort_order", "name"],
            },
        ),
        migrations.AddField(
            model_name="investmenttype",
            name="supports_contribution_source",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="asset",
            name="contribution_source_mode",
            field=models.CharField(
                choices=[
                    ("inherit", "Eredita dal tipo"),
                    ("enabled", "Abilitata"),
                    ("disabled", "Disabilitata"),
                ],
                default="inherit",
                max_length=8,
            ),
        ),
        migrations.AddField(
            model_name="assettransaction",
            name="contribution_source",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="transactions",
                to="portfolio.contributionsource",
            ),
        ),
        migrations.CreateModel(
            name="AssetContributionSource",
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
                ("sort_order", models.PositiveIntegerField(default=0)),
                (
                    "asset",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="contribution_source_links",
                        to="portfolio.asset",
                    ),
                ),
                (
                    "contribution_source",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="asset_links",
                        to="portfolio.contributionsource",
                    ),
                ),
                (
                    "owner",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.CASCADE,
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "ordering": ["sort_order", "contribution_source__sort_order"],
            },
        ),
        migrations.AddConstraint(
            model_name="contributionsource",
            constraint=models.UniqueConstraint(
                fields=("owner", "name"),
                name="unique_contribution_source_owner_name",
            ),
        ),
        migrations.AddConstraint(
            model_name="assetcontributionsource",
            constraint=models.UniqueConstraint(
                fields=("owner", "asset", "contribution_source"),
                name="unique_asset_contribution_source",
            ),
        ),
        migrations.RunPython(
            create_default_contribution_sources,
            reverse_code=migrations.RunPython.noop,
        ),
    ]
