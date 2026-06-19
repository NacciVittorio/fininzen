"""
expenses/models.py — Modelli del database per le spese.

Abbiamo separato Category da Expense (relazione ForeignKey) invece di usare
un semplice CharField perché così l'utente può:
- Aggiungere/rinominare/colorare le categorie liberamente
- Fare query aggregate per categoria (totale speso per categoria nel mese)
- Evitare typo: la categoria è sempre un oggetto validato, non una stringa libera
"""

from django.conf import settings
from django.db import models


class Category(models.Model):
    """
    Categoria personalizzabile, supporta entrate e uscite e sottocategorie.
    """

    EXPENSE = "expense"
    INCOME = "income"
    TYPE_CHOICES = [(EXPENSE, "Uscita"), (INCOME, "Entrata")]

    name = models.CharField(max_length=50)
    color = models.CharField(max_length=7, default="#8e8e8e")
    icon = models.CharField(max_length=10, default="💰")
    category_type = models.CharField(
        max_length=10, choices=TYPE_CHOICES, default=EXPENSE
    )
    # NULL = categoria principale; impostato = sottocategoria
    parent = models.ForeignKey(
        "self",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="subcategories",
    )
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )

    class Meta:
        ordering = ["category_type", "name"]
        verbose_name = "Categoria"
        verbose_name_plural = "Categorie"

    def __str__(self):
        if self.parent:
            return f"{self.parent.name} › {self.name}"
        return self.name


class Expense(models.Model):
    """
    Singola transazione di spesa.

    Usiamo DateField (non DateTimeField) perché per le spese personali
    conta il giorno, non l'ora esatta.
    """

    description = models.CharField(max_length=200)

    # DecimalField invece di FloatField per i soldi:
    # FloatField ha errori di arrotondamento binario (es. 0.1 + 0.2 ≠ 0.3 esatto)
    # DecimalField è preciso fino al centesimo
    amount = models.DecimalField(max_digits=10, decimal_places=2)

    # SET_NULL: se cancello la categoria "Svago", le spese esistenti non vengono cancellate
    # ma la loro categoria diventa null (invece di CASCADE che cancellerebbe tutto)
    category = models.ForeignKey(
        Category,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="expenses",
    )

    date = models.DateField()

    linked_asset = models.ForeignKey(
        "portfolio.Asset",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="linked_expenses",
    )
    recurring_source = models.ForeignKey(
        "RecurringExpense",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="generated_expenses",
    )
    recurring_occurrence_date = models.DateField(null=True, blank=True)
    is_verified = models.BooleanField(default=False)

    # auto_now_add: timestamp automatico di creazione, utile per debug e audit
    created_at = models.DateTimeField(auto_now_add=True)
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )

    class Meta:
        ordering = ["-date", "-created_at"]
        verbose_name = "Spesa"
        verbose_name_plural = "Spese"
        indexes = [
            models.Index(fields=["date"], name="expenses_ex_date_17a2b2_idx"),
            models.Index(
                fields=["owner", "date"],
                name="expenses_ex_owner_i_7060b6_idx",
            ),
            models.Index(
                fields=["owner", "is_verified", "date"],
                name="expenses_ex_owner_i_f7e8b9_idx",
            ),
            models.Index(
                fields=["category", "date"],
                name="expenses_ex_categor_9e3535_idx",
            ),
            models.Index(
                fields=["owner", "category", "date"],
                name="expenses_ex_owner_i_17b108_idx",
            ),
            models.Index(
                fields=["linked_asset", "date"],
                name="expenses_ex_linked__118d37_idx",
            ),
            models.Index(
                fields=["owner", "linked_asset", "date"],
                name="expenses_ex_owner_i_5948da_idx",
            ),
            models.Index(
                fields=["owner", "recurring_source", "recurring_occurrence_date"],
                name="ex_rec_src_occ_idx",
            ),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["owner", "recurring_source", "recurring_occurrence_date"],
                condition=models.Q(
                    recurring_source__isnull=False,
                    recurring_occurrence_date__isnull=False,
                ),
                name="uniq_rec_occ_owner",
            ),
            models.CheckConstraint(
                condition=models.Q(amount__gt=0),
                name="expense_amount_positive",
            ),
        ]

    def __str__(self):
        return f"{self.date} — {self.description} ({self.amount}€)"


class ExpenseDescriptionSuggestion(models.Model):
    """Suggestion per autocomplete description, isolate per utente e categoria."""

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="description_suggestions",
    )
    category = models.ForeignKey(
        Category,
        on_delete=models.CASCADE,
        related_name="description_suggestions",
    )
    text = models.CharField(max_length=200)
    last_used_at = models.DateTimeField(auto_now=True)
    use_count = models.PositiveIntegerField(default=1)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["owner", "category", "text"],
                name="unique_description_suggestion_per_owner_category_text",
            ),
        ]
        indexes = [
            models.Index(fields=["owner", "category", "-last_used_at"]),
        ]
        ordering = ["-last_used_at", "-use_count", "text"]

    def __str__(self):
        return f"{self.category_id}:{self.text}"


class Budget(models.Model):
    """Budget mensile per categoria di spesa."""

    category = models.ForeignKey(
        Category, on_delete=models.CASCADE, related_name="budgets"
    )
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )

    class Meta:
        verbose_name = "Budget"
        verbose_name_plural = "Budgets"
        constraints = [
            models.UniqueConstraint(
                fields=["owner", "category"], name="unique_budget_owner_category"
            ),
            models.CheckConstraint(
                condition=models.Q(amount__gt=0),
                name="budget_amount_positive",
            ),
        ]

    def __str__(self):
        return f"{self.category.name}: {self.amount}€/mese"


class RecurringExpense(models.Model):
    """Modello di spesa ricorrente."""

    STATUS_ACTIVE = "ACTIVE"
    STATUS_DISABLED = "DISABLED"
    STATUS_DELETED = "DELETED"
    STATUS_CHOICES = [
        (STATUS_ACTIVE, "Active"),
        (STATUS_DISABLED, "Disabled"),
        (STATUS_DELETED, "Deleted"),
    ]
    FREQUENCY_MONTHLY = "MONTHLY"
    FREQUENCY_YEARLY = "YEARLY"
    FREQUENCY_CHOICES = [
        (FREQUENCY_MONTHLY, "Monthly"),
        (FREQUENCY_YEARLY, "Yearly"),
    ]

    description = models.CharField(max_length=200)
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    category = models.ForeignKey(
        Category,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="recurring_expenses",
    )
    linked_asset = models.ForeignKey(
        "portfolio.Asset",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="recurring_expenses",
    )
    day_of_month = models.IntegerField(default=1)
    month_of_year = models.IntegerField(null=True, blank=True)
    frequency = models.CharField(
        max_length=10,
        choices=FREQUENCY_CHOICES,
        default=FREQUENCY_MONTHLY,
    )
    is_active = models.BooleanField(default=True)
    status = models.CharField(
        max_length=10, choices=STATUS_CHOICES, default=STATUS_ACTIVE
    )
    start_date = models.DateField()
    end_date = models.DateField(null=True, blank=True)
    disabled_at = models.DateTimeField(null=True, blank=True)
    deleted_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )

    class Meta:
        ordering = ["description"]
        verbose_name = "Spesa Ricorrente"
        verbose_name_plural = "Spese Ricorrenti"
        indexes = [
            models.Index(fields=["owner", "status", "is_active", "start_date"]),
            models.Index(fields=["owner", "start_date", "end_date"]),
        ]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(amount__gt=0),
                name="recurringexpense_amount_positive",
            ),
            models.CheckConstraint(
                condition=models.Q(day_of_month__gte=1, day_of_month__lte=31),
                name="recurringexpense_day_valid",
            ),
            models.CheckConstraint(
                condition=(
                    models.Q(month_of_year__isnull=True)
                    | models.Q(month_of_year__gte=1, month_of_year__lte=12)
                ),
                name="recurringexpense_month_valid",
            ),
        ]

    def __str__(self):
        return f"{self.description} ({self.amount}€)"
