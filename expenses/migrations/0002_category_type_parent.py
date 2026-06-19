from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("expenses", "0001_initial"),
    ]

    operations = [
        # Rimuovi il vincolo unique sul nome per permettere stessa denominazione in tipi diversi
        migrations.AlterField(
            model_name="category",
            name="name",
            field=models.CharField(max_length=50),
        ),
        migrations.AddField(
            model_name="category",
            name="category_type",
            field=models.CharField(
                choices=[("expense", "Uscita"), ("income", "Entrata")],
                default="expense",
                max_length=10,
            ),
        ),
        migrations.AddField(
            model_name="category",
            name="parent",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="subcategories",
                to="expenses.category",
            ),
        ),
        migrations.AlterModelOptions(
            name="category",
            options={
                "ordering": ["category_type", "name"],
                "verbose_name": "Categoria",
                "verbose_name_plural": "Categorie",
            },
        ),
    ]
