# Generated for SaaS tenant hardening.

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


OWNER_REQUIRED_MODELS = [
    "Category",
    "Expense",
    "Budget",
    "RecurringExpense",
]


def assert_no_ownerless_rows(apps, schema_editor):
    offenders = []
    for model_name in OWNER_REQUIRED_MODELS:
        model = apps.get_model("expenses", model_name)
        count = model.objects.filter(owner__isnull=True).count()
        if count:
            offenders.append(f"{model_name}={count}")
    if offenders:
        raise RuntimeError(
            "Cannot require expenses tenant ownership while ownerless rows exist: "
            + ", ".join(offenders)
            + ". Assign or purge these rows before applying this migration."
        )


class Migration(migrations.Migration):
    dependencies = [
        ("expenses", "0013_alter_expensedescriptionsuggestion_options_and_more"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.RunPython(assert_no_ownerless_rows, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="budget",
            name="owner",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AlterField(
            model_name="category",
            name="owner",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AlterField(
            model_name="expense",
            name="owner",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AlterField(
            model_name="recurringexpense",
            name="owner",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                to=settings.AUTH_USER_MODEL,
            ),
        ),
    ]
