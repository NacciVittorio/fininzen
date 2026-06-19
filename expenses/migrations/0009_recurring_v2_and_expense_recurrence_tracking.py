from django.db import migrations, models
import django.db.models.deletion


def seed_recurring_dates_and_status(apps, schema_editor):
    RecurringExpense = apps.get_model("expenses", "RecurringExpense")
    for rec in RecurringExpense.objects.all().iterator():
        rec.start_date = rec.created_at.date()
        rec.status = "ACTIVE" if rec.is_active else "DISABLED"
        rec.save(update_fields=["start_date", "status"])


class Migration(migrations.Migration):
    dependencies = [
        ("portfolio", "0025_alter_asset_current_value_eur"),
        ("expenses", "0008_expense_owner_filter_indexes"),
    ]

    operations = [
        migrations.AddField(
            model_name="expense",
            name="recurring_occurrence_date",
            field=models.DateField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="expense",
            name="recurring_source",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="generated_expenses",
                to="expenses.recurringexpense",
            ),
        ),
        migrations.AddField(
            model_name="recurringexpense",
            name="deleted_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="recurringexpense",
            name="disabled_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="recurringexpense",
            name="end_date",
            field=models.DateField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="recurringexpense",
            name="linked_asset",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="recurring_expenses",
                to="portfolio.asset",
            ),
        ),
        migrations.AddField(
            model_name="recurringexpense",
            name="start_date",
            field=models.DateField(default="2026-01-01"),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name="recurringexpense",
            name="status",
            field=models.CharField(
                choices=[
                    ("ACTIVE", "Active"),
                    ("DISABLED", "Disabled"),
                    ("DELETED", "Deleted"),
                ],
                default="ACTIVE",
                max_length=10,
            ),
        ),
        migrations.RunPython(
            seed_recurring_dates_and_status, migrations.RunPython.noop
        ),
        migrations.AddIndex(
            model_name="expense",
            index=models.Index(
                fields=["owner", "recurring_source", "recurring_occurrence_date"],
                name="ex_rec_src_occ_idx",
            ),
        ),
        migrations.AddConstraint(
            model_name="expense",
            constraint=models.UniqueConstraint(
                condition=models.Q(
                    ("recurring_occurrence_date__isnull", False),
                    ("recurring_source__isnull", False),
                ),
                fields=("owner", "recurring_source", "recurring_occurrence_date"),
                name="uniq_rec_occ_owner",
            ),
        ),
        migrations.AddIndex(
            model_name="recurringexpense",
            index=models.Index(
                fields=["owner", "status", "is_active", "start_date"],
                name="expenses_re_owner_i_4cc694_idx",
            ),
        ),
        migrations.AddIndex(
            model_name="recurringexpense",
            index=models.Index(
                fields=["owner", "start_date", "end_date"],
                name="expenses_re_owner_i_e9916b_idx",
            ),
        ),
    ]
