"""
portfolio/models.py — Modelli per il portafoglio investimenti.
"""

import logging
from django.conf import settings
from django.db import models
from django.db.models import Q, UniqueConstraint
from django.core.validators import MinValueValidator
from django.utils import timezone
from decimal import Decimal, ROUND_HALF_UP

from fininzen.fields import EncryptedTextField


# Helper unitario per il quantize a centesimi (CRIT-05): tutti i campi monetari
# del portafoglio hanno decimal_places=2 e i calcoli intermedi su shares×prezzo
# possono produrre più di due decimali; applicare quantize esplicito con
# ROUND_HALF_UP evita troncamenti impliciti divergenti dal ricalcolo.
_Q2 = Decimal("0.01")


def _q2(value):
    return value.quantize(_Q2, rounding=ROUND_HALF_UP)


logger = logging.getLogger(__name__)
OPENING_BALANCE_NOTE_PREFIX = "Opening balance correction"


class InvestmentType(models.Model):
    name = models.CharField(max_length=50)
    color = models.CharField(max_length=7, default="#4f7fff")
    icon = models.CharField(max_length=10, default="📈")
    supports_ticker = models.BooleanField(default=True)
    is_liquid_default = models.BooleanField(default=True)
    is_bank_account = models.BooleanField(default=False)
    supports_contribution_source = models.BooleanField(default=False)
    tax_rate = models.DecimalField(
        max_digits=5,
        decimal_places=4,
        default=Decimal("0"),
        validators=[MinValueValidator(Decimal("0"))],
    )

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
    )

    class Meta:
        ordering = ["name"]
        verbose_name = "Tipo investimento"
        verbose_name_plural = "Tipi investimento"
        constraints = [
            models.CheckConstraint(
                condition=models.Q(tax_rate__gte=0),
                name="investmenttype_tax_rate_non_negative",
            ),
        ]

    def __str__(self):
        return self.name


class ContributionSource(models.Model):
    name = models.CharField(max_length=80)
    sort_order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
    )

    class Meta:
        ordering = ["sort_order", "name"]
        constraints = [
            models.UniqueConstraint(
                fields=["owner", "name"],
                name="unique_contribution_source_owner_name",
            )
        ]

    def __str__(self):
        return self.name


class Asset(models.Model):
    AUTO = "AUTO"
    MANUAL = "MANUAL"
    TRACKING_CHOICES = [(AUTO, "Automatico (yfinance)"), (MANUAL, "Manuale")]
    PRICE_SOURCE_AUTO = "AUTO"
    PRICE_SOURCE_YAHOO = "YAHOO"
    PRICE_SOURCE_BORSA_ITALIANA = "BORSA_ITALIANA"
    PRICE_SOURCE_CHOICES = [
        (PRICE_SOURCE_AUTO, "Auto"),
        (PRICE_SOURCE_YAHOO, "Yahoo Finance"),
        (PRICE_SOURCE_BORSA_ITALIANA, "Borsa Italiana"),
    ]
    CONTRIBUTION_SOURCE_INHERIT = "inherit"
    CONTRIBUTION_SOURCE_ENABLED = "enabled"
    CONTRIBUTION_SOURCE_DISABLED = "disabled"
    CONTRIBUTION_SOURCE_MODE_CHOICES = [
        (CONTRIBUTION_SOURCE_INHERIT, "Eredita dal tipo"),
        (CONTRIBUTION_SOURCE_ENABLED, "Abilitata"),
        (CONTRIBUTION_SOURCE_DISABLED, "Disabilitata"),
    ]
    TAX_CMP = "CMP"
    TAX_CRYPTO = "CRYPTO"
    TAX_CHOICES = [
        (TAX_CMP, "Costo medio ponderato"),
        (TAX_CRYPTO, "Crypto FIFO"),
    ]

    name = models.CharField(max_length=200)
    tracking_type = models.CharField(
        max_length=6, choices=TRACKING_CHOICES, default=AUTO
    )
    ticker = models.CharField(max_length=20, blank=True, default="")
    price_source = models.CharField(
        max_length=20, choices=PRICE_SOURCE_CHOICES, default=PRICE_SOURCE_AUTO
    )
    source_symbol = models.CharField(max_length=40, blank=True, default="")
    source_url = models.URLField(max_length=500, blank=True, default="")
    isin = models.CharField(max_length=12, blank=True, default="")
    investment_type = models.ForeignKey(
        InvestmentType,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="assets",
    )
    is_liquid = models.BooleanField(default=True)
    shares = models.DecimalField(
        max_digits=15,
        decimal_places=6,
        null=True,
        blank=True,
        validators=[MinValueValidator(Decimal("0"))],
    )
    price_per_share = models.DecimalField(
        max_digits=15,
        decimal_places=4,
        null=True,
        blank=True,
        validators=[MinValueValidator(Decimal("0"))],
    )
    currency = models.CharField(max_length=3, default="EUR")
    invested_capital = models.DecimalField(
        max_digits=15,
        decimal_places=2,
        default=Decimal("0"),
        validators=[MinValueValidator(Decimal("0"))],
    )
    current_value = models.DecimalField(
        max_digits=15,
        decimal_places=2,
        default=Decimal("0"),
        validators=[MinValueValidator(Decimal("0"))],
    )
    opening_balance = models.DecimalField(
        max_digits=15,
        decimal_places=2,
        default=Decimal("0"),
    )
    opening_balance_date = models.DateField(null=True, blank=True)
    notes = EncryptedTextField(blank=True, default="")
    source_account = models.ForeignKey(
        "self",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="held_investments",
        limit_choices_to={"investment_type__is_bank_account": True},
    )
    previous_account = models.ForeignKey(
        "self",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="previous_investments",
        limit_choices_to={"investment_type__is_bank_account": True},
    )
    contribution_source_mode = models.CharField(
        max_length=8,
        choices=CONTRIBUTION_SOURCE_MODE_CHOICES,
        default=CONTRIBUTION_SOURCE_INHERIT,
    )
    current_value_eur = models.DecimalField(
        max_digits=15,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(Decimal("0"))],
    )
    invested_capital_eur = models.DecimalField(
        max_digits=15,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(Decimal("0"))],
    )
    tax_rate_override = models.DecimalField(
        max_digits=5,
        decimal_places=4,
        null=True,
        blank=True,
        validators=[MinValueValidator(Decimal("0"))],
    )
    tax = models.CharField(max_length=12, choices=TAX_CHOICES, default=TAX_CMP)
    balance_as_of = models.DateField(null=True, blank=True)
    last_price_update = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    is_archived = models.BooleanField(default=False)
    archived_at = models.DateTimeField(null=True, blank=True)
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
    )

    class Meta:
        ordering = ["-current_value"]
        verbose_name = "Asset"
        verbose_name_plural = "Asset"
        indexes = [
            # Hot path: ogni lista/aggregazione filtra owner + is_archived=False
            # (default dei viewset, ~9 call-site). Indice parziale: indicizza solo
            # gli asset attivi (≈99%), più piccolo e caldo del caso comune. Postgres
            # applica la WHERE; su SQLite Django lo crea comunque (guadagno minore).
            models.Index(
                fields=["owner"],
                condition=models.Q(is_archived=False),
                name="asset_active_by_owner_idx",
            ),
        ]
        constraints = [
            # NOTE: invested_capital/current_value(_eur) NON sono qui di proposito.
            # I conti bancari in scoperto rendono questi campi legittimamente negativi
            # (recompute_from_transactions, ramo MANUAL: "do not clamp to 0"), quindi
            # un CheckConstraint li romperebbe — l'audit ha trovato righe negative reali.
            models.CheckConstraint(
                condition=models.Q(shares__isnull=True) | models.Q(shares__gte=0),
                name="asset_shares_non_negative",
            ),
            models.CheckConstraint(
                condition=(
                    models.Q(price_per_share__isnull=True)
                    | models.Q(price_per_share__gte=0)
                ),
                name="asset_price_per_share_non_negative",
            ),
            models.CheckConstraint(
                condition=(
                    models.Q(tax_rate_override__isnull=True)
                    | models.Q(tax_rate_override__gte=0)
                ),
                name="asset_tax_rate_override_non_negative",
            ),
        ]

    def __str__(self):
        type_name = self.investment_type.name if self.investment_type else "N/A"
        return f"{self.name} ({type_name})"

    @property
    def gain(self):
        return self.current_value - self.invested_capital

    @property
    def gain_percent(self):
        if self.invested_capital == 0:
            return Decimal("0")
        return (self.gain / self.invested_capital) * 100

    @property
    def effective_tax_rate(self):
        if self.tax_rate_override is not None:
            return self.tax_rate_override
        if self.investment_type_id and self.investment_type:
            return self.investment_type.tax_rate or Decimal("0")
        return Decimal("0")

    @property
    def has_ticker(self):
        return bool(self.source_symbol or self.ticker)

    @property
    def price_identifier(self):
        return self.source_symbol or self.ticker

    @property
    def supports_contribution_source(self):
        if self.contribution_source_mode == Asset.CONTRIBUTION_SOURCE_ENABLED:
            return True
        if self.contribution_source_mode == Asset.CONTRIBUTION_SOURCE_DISABLED:
            return False
        return bool(
            self.investment_type and self.investment_type.supports_contribution_source
        )

    def recompute_from_transactions(self):
        """Ricalcola shares, invested_capital e current_value dalle transactions.

        - AUTO: average-cost su BUY/SELL.
        - MANUAL: opening_balance + CASH_IN/CASH_OUT + ADJUSTMENT determinano current_value.
        I movimenti futuri restano persistiti ma non incidono sul saldo corrente.

        MED-07 — convenzione FX dei campi EUR (deliberata, non un bug):
        `current_value_eur` usa il tasso di cambio **live** (valore di mercato in
        EUR oggi, riga ~430), mentre `invested_capital_eur` è il **cost basis
        storico** accumulato col tasso FX *alla data di ciascuna transazione*
        (`_historical_rate`). È lo standard finanziario: il valore corrente
        riflette il mercato di oggi, il capitale investito riflette quanto è
        costato realmente in EUR all'epoca. Le due metriche NON vanno "allineate"
        sullo stesso tasso. Quando lo storico FX è incompleto, `invested_capital_eur`
        è None e il serializer espone `eur_complete=False` (la UI lo segnala con `~`).
        """
        today = timezone.localdate()
        txs = list(
            self.transactions.filter(date__lte=today, is_verified=True).order_by(
                "date", "created_at"
            )
        )
        from .fx import get_exchange_rate, get_historical_exchange_rate

        def _historical_rate(day):
            return get_historical_exchange_rate(
                self.currency or "EUR", day, owner=self.owner
            )

        if self.tracking_type == Asset.MANUAL:
            cash_in = Decimal("0")
            cash_out = Decimal("0")
            running_cost_eur = Decimal("0")
            eur_complete = True
            opening_balance, opening_date, txs = split_manual_opening_balance(txs)
            if opening_date is None:
                # No opening-balance adjustment transaction present: honor the
                # denormalized model fields instead of zeroing them out. This
                # keeps a baseline (the account's opening balance at its opening
                # date) when the balance lives only on the Asset row — otherwise
                # recompute would erase it and the manual history would lose the
                # opening-date data point (rebuild_manual_history reads these fields).
                opening_balance = Decimal(self.opening_balance or 0)
                opening_date = self.opening_balance_date
            for tx in txs:
                if tx.transaction_type not in (
                    AssetTransaction.CASH_IN,
                    AssetTransaction.CASH_OUT,
                ):
                    continue
                amount = tx.price_per_share
                if tx.transaction_type == AssetTransaction.CASH_IN:
                    cash_in += amount
                else:
                    cash_out += amount
                if tx.gross_amount_eur is not None:
                    signed = (
                        tx.gross_amount_eur
                        if tx.transaction_type == AssetTransaction.CASH_IN
                        else -tx.gross_amount_eur
                    )
                    running_cost_eur += signed
                else:
                    rate = _historical_rate(tx.date)
                    if rate is None:
                        eur_complete = False
                    elif eur_complete:
                        signed = (
                            amount
                            if tx.transaction_type == AssetTransaction.CASH_IN
                            else -amount
                        )
                        running_cost_eur += signed * rate
            adjustments = sum(
                (
                    tx.price_per_share
                    for tx in txs
                    if tx.transaction_type == AssetTransaction.ADJUSTMENT
                ),
                Decimal("0"),
            )
            # NOTE: do not clamp to 0 — bank accounts can legitimately go negative (overdraft)
            invested = cash_in - cash_out
            current = opening_balance + invested + adjustments
            self.shares = None
            self.price_per_share = None
            self.opening_balance = _q2(opening_balance)
            self.opening_balance_date = opening_date
            self.invested_capital = _q2(invested)
            self.current_value = _q2(current)
            self.invested_capital_eur = _q2(running_cost_eur) if eur_complete else None
        else:
            running_shares = Decimal("0")
            running_cost = Decimal("0")
            running_cost_eur = Decimal("0")
            eur_complete = True
            for tx in txs:
                if tx.transaction_type == AssetTransaction.BUY:
                    running_shares += tx.shares
                    running_cost += tx.shares * tx.price_per_share
                    if tx.gross_amount_eur is not None:
                        running_cost_eur += tx.gross_amount_eur
                    else:
                        rate = _historical_rate(tx.date)
                        if rate is None:
                            eur_complete = False
                        elif eur_complete:
                            running_cost_eur += tx.shares * tx.price_per_share * rate
                elif tx.transaction_type == AssetTransaction.SELL:
                    if running_shares > 0:
                        avg_cost = running_cost / running_shares
                        avg_cost_eur = (
                            running_cost_eur / running_shares if eur_complete else None
                        )
                        sold = min(tx.shares, running_shares)
                        running_cost -= sold * avg_cost
                        if avg_cost_eur is not None:
                            running_cost_eur -= sold * avg_cost_eur
                        running_shares -= sold
            running_cost = max(running_cost, Decimal("0"))
            running_cost_eur = max(running_cost_eur, Decimal("0"))
            self.shares = running_shares
            self.invested_capital = _q2(running_cost)
            self.invested_capital_eur = _q2(running_cost_eur) if eur_complete else None
            if self.price_per_share and running_shares > 0:
                self.current_value = _q2(running_shares * self.price_per_share)
            elif running_shares == 0:
                self.current_value = Decimal("0")
            else:
                # Price not yet available from yfinance: use cost basis so gain shows 0% instead of -100%
                self.current_value = _q2(running_cost)

        logger.debug(
            "recompute_from_transactions: asset=%s invested=%s current=%s",
            self.name,
            self.invested_capital,
            self.current_value,
        )
        # MED-07: current_value_eur uses the LIVE rate (today's market value in
        # EUR), in contrast with invested_capital_eur which is the historical
        # cost basis accumulated above with per-transaction rates. See the
        # method docstring — this asymmetry is intentional.
        rate = get_exchange_rate(self.currency or "EUR")
        if rate is not None:
            self.current_value_eur = _q2(self.current_value * rate)
        else:
            logger.warning(
                "FX conversion unavailable for asset '%s' (currency=%s)",
                self.name,
                self.currency,
            )
            self.current_value_eur = None
        self.balance_as_of = today

        self.save(
            update_fields=[
                "shares",
                "price_per_share",
                "invested_capital",
                "current_value",
                "current_value_eur",
                "invested_capital_eur",
                "balance_as_of",
            ]
        )


class AssetContributionSource(models.Model):
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
    )
    asset = models.ForeignKey(
        Asset,
        on_delete=models.CASCADE,
        related_name="contribution_source_links",
    )
    contribution_source = models.ForeignKey(
        ContributionSource,
        on_delete=models.CASCADE,
        related_name="asset_links",
    )
    sort_order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["sort_order", "contribution_source__sort_order"]
        constraints = [
            models.UniqueConstraint(
                fields=["owner", "asset", "contribution_source"],
                name="unique_asset_contribution_source",
            )
        ]

    def __str__(self):
        return f"{self.asset} <- {self.contribution_source}"


class AssetTransaction(models.Model):
    BUY = "buy"
    SELL = "sell"
    CASH_IN = "cash_in"
    CASH_OUT = "cash_out"
    ADJUSTMENT = "adjustment"
    TYPE_CHOICES = [
        (BUY, "Buy"),
        (SELL, "Sell"),
        (CASH_IN, "Cash In"),
        (CASH_OUT, "Cash Out"),
        (ADJUSTMENT, "Adjustment"),
    ]
    DERIVED_PRINCIPAL = "principal"
    DERIVED_FEE = "fee"
    DERIVED_TAX = "tax"
    DERIVED_KIND_CHOICES = [
        (DERIVED_PRINCIPAL, "Principal"),
        (DERIVED_FEE, "Fee"),
        (DERIVED_TAX, "Tax"),
    ]
    asset = models.ForeignKey(
        Asset, on_delete=models.CASCADE, related_name="transactions"
    )
    transaction_type = models.CharField(
        max_length=12, choices=TYPE_CHOICES, default=BUY
    )
    derived_from = models.ForeignKey(
        "self",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="derived_txs",
    )
    derived_kind = models.CharField(
        max_length=10,
        choices=DERIVED_KIND_CHOICES,
        default=DERIVED_PRINCIPAL,
    )
    date = models.DateField()
    shares = models.DecimalField(
        max_digits=15,
        decimal_places=6,
        validators=[MinValueValidator(Decimal("0.000001"))],
    )
    # price_per_share può essere negativo per ADJUSTMENT (delta negativo)
    price_per_share = models.DecimalField(max_digits=15, decimal_places=4)
    fee = models.DecimalField(
        max_digits=15,
        decimal_places=2,
        default=Decimal("0"),
        validators=[MinValueValidator(Decimal("0"))],
    )
    tax_amount = models.DecimalField(
        max_digits=15,
        decimal_places=2,
        default=Decimal("0"),
        validators=[MinValueValidator(Decimal("0"))],
    )
    tax_amount_is_manual = models.BooleanField(default=False)
    fx_rate_to_eur = models.DecimalField(
        max_digits=18,
        decimal_places=8,
        null=True,
        blank=True,
        validators=[MinValueValidator(Decimal("0"))],
    )
    gross_amount_eur = models.DecimalField(
        max_digits=15,
        decimal_places=2,
        null=True,
        blank=True,
    )
    fee_eur = models.DecimalField(
        max_digits=15,
        decimal_places=2,
        null=True,
        blank=True,
    )
    tax_amount_eur = models.DecimalField(
        max_digits=15,
        decimal_places=2,
        null=True,
        blank=True,
    )
    notes = models.CharField(max_length=255, blank=True, default="")
    contribution_source = models.ForeignKey(
        ContributionSource,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="transactions",
    )
    is_verified = models.BooleanField(default=False)
    source_expense = models.ForeignKey(
        "expenses.Expense",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="portfolio_transactions",
    )
    recurring_plan = models.ForeignKey(
        "RecurringInvestmentPlan",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="generated_transactions",
    )
    recurring_occurrence_date = models.DateField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
    )

    @property
    def total_value(self):
        return self.shares * self.price_per_share

    class Meta:
        ordering = ["-date", "-created_at"]
        verbose_name = "Transazione"
        verbose_name_plural = "Transazioni"
        indexes = [
            models.Index(
                fields=["asset", "date"],
                name="portfolio_a_asset_i_f1d252_idx",
            ),
            models.Index(
                fields=["owner", "date"],
                name="portfolio_a_owner_i_3f0df2_idx",
            ),
            models.Index(
                fields=["owner", "transaction_type", "date"],
                name="portfolio_a_owner_i_eae2cd_idx",
            ),
            models.Index(
                fields=["owner", "is_verified", "date"],
                name="portfolio_a_owner_i_313d81_idx",
            ),
            models.Index(
                fields=["source_expense"],
                name="portfolio_a_source__3a5f16_idx",
            ),
            models.Index(
                fields=["derived_from"],
                name="portfolio_a_derived_d38bd7_idx",
            ),
            models.Index(
                fields=["derived_from", "derived_kind"],
                name="portfolio_a_derkind_idx",
            ),
            models.Index(
                fields=["owner", "recurring_plan", "recurring_occurrence_date"],
                name="portfolio_a_recplan_occ_idx",
            ),
        ]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(shares__gt=0),
                name="assettransaction_shares_positive",
            ),
            models.CheckConstraint(
                condition=(
                    (
                        models.Q(transaction_type="adjustment")
                        & (
                            models.Q(price_per_share__gt=0)
                            | models.Q(price_per_share__lt=0)
                        )
                    )
                    | (
                        ~models.Q(transaction_type="adjustment")
                        & models.Q(price_per_share__gt=0)
                    )
                ),
                name="assettransaction_amount_valid",
            ),
            UniqueConstraint(
                fields=["source_expense"],
                condition=Q(source_expense__isnull=False),
                name="unique_shadow_tx_per_expense",
            ),
            UniqueConstraint(
                fields=["owner", "recurring_plan", "recurring_occurrence_date"],
                condition=Q(
                    recurring_plan__isnull=False,
                    recurring_occurrence_date__isnull=False,
                    derived_from__isnull=True,
                ),
                name="unique_pac_occ_owner",
            ),
            models.CheckConstraint(
                condition=models.Q(fee__gte=0),
                name="assettransaction_fee_non_negative",
            ),
            models.CheckConstraint(
                condition=models.Q(tax_amount__gte=0),
                name="assettransaction_tax_amount_non_negative",
            ),
        ]

    def __str__(self):
        return f"{self.transaction_type} {self.shares} {self.asset.name} @ {self.price_per_share}"


def split_manual_opening_balance(txs):
    """Return (opening_balance, opening_balance_date, remaining_txs)."""
    opening_balance = Decimal("0")
    opening_date = None
    remaining = []
    for tx in txs:
        if tx.transaction_type == AssetTransaction.ADJUSTMENT and tx.notes.startswith(
            OPENING_BALANCE_NOTE_PREFIX
        ):
            opening_balance += tx.price_per_share
            if opening_date is None or tx.date < opening_date:
                opening_date = tx.date
            continue
        remaining.append(tx)
    return opening_balance, opening_date, remaining


class AssetPriceHistory(models.Model):
    """Cache dei prezzi storici per asset.

    - Asset con ticker: `close` = chiusura giornaliera Yahoo (nella valuta dell'asset,
      già convertita GBX→GBP quando necessario).
    - Asset illiquidi: entry creata quando l'utente aggiorna manualmente `current_value`;
      `close` contiene il valore totale dell'asset in quella data (non un prezzo per quota).
    """

    asset = models.ForeignKey(
        Asset, on_delete=models.CASCADE, related_name="price_history"
    )
    date = models.DateField()
    open = models.DecimalField(max_digits=15, decimal_places=4, null=True, blank=True)
    close = models.DecimalField(max_digits=15, decimal_places=4)

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["asset", "date"],
                name="unique_assetpricehistory_asset_date",
            ),
        ]
        indexes = [models.Index(fields=["asset", "date"])]
        ordering = ["-date"]
        verbose_name = "Price History"
        verbose_name_plural = "Price History"

    def __str__(self):
        return f"{self.asset.name} @ {self.date}: {self.close}"


class RecurringInvestmentPlan(models.Model):
    """Piano di acquisto ricorrente quote su un asset (PAC)."""

    STATUS_ACTIVE = "ACTIVE"
    STATUS_DISABLED = "DISABLED"
    STATUS_DELETED = "DELETED"
    STATUS_CHOICES = [
        (STATUS_ACTIVE, "Active"),
        (STATUS_DISABLED, "Disabled"),
        (STATUS_DELETED, "Deleted"),
    ]
    FREQUENCY_WEEKLY = "WEEKLY"
    FREQUENCY_MONTHLY = "MONTHLY"
    FREQUENCY_QUARTERLY = "QUARTERLY"
    FREQUENCY_SEMIANNUAL = "SEMIANNUAL"
    FREQUENCY_ANNUAL = "ANNUAL"
    FREQUENCY_CHOICES = [
        (FREQUENCY_WEEKLY, "Weekly"),
        (FREQUENCY_MONTHLY, "Monthly"),
        (FREQUENCY_QUARTERLY, "Quarterly"),
        (FREQUENCY_SEMIANNUAL, "Semiannual"),
        (FREQUENCY_ANNUAL, "Annual"),
    ]

    name = models.CharField(max_length=200)
    asset = models.ForeignKey(
        Asset,
        on_delete=models.CASCADE,
        related_name="recurring_investment_plans",
    )
    source_account = models.ForeignKey(
        Asset,
        on_delete=models.PROTECT,
        related_name="funded_recurring_investment_plans",
    )
    amount = models.DecimalField(
        max_digits=15,
        decimal_places=2,
        validators=[MinValueValidator(Decimal("0.01"))],
    )
    frequency = models.CharField(
        max_length=12,
        choices=FREQUENCY_CHOICES,
        default=FREQUENCY_MONTHLY,
    )
    day_of_week = models.PositiveSmallIntegerField(null=True, blank=True)
    day_of_month = models.PositiveSmallIntegerField(default=1)
    anchor_month = models.PositiveSmallIntegerField(null=True, blank=True)
    generated_transactions_verified = models.BooleanField(default=False)
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
    )

    class Meta:
        ordering = ["name", "id"]
        verbose_name = "Recurring Investment Plan"
        verbose_name_plural = "Recurring Investment Plans"
        indexes = [
            models.Index(fields=["owner", "status", "is_active", "start_date"]),
            models.Index(fields=["owner", "asset", "status"]),
        ]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(amount__gt=0),
                name="recinvplan_amount_positive",
            ),
            models.CheckConstraint(
                condition=models.Q(day_of_month__gte=1, day_of_month__lte=31),
                name="recinvplan_day_of_month_valid",
            ),
            models.CheckConstraint(
                condition=(
                    models.Q(day_of_week__isnull=True)
                    | models.Q(day_of_week__gte=1, day_of_week__lte=7)
                ),
                name="recinvplan_day_of_week_valid",
            ),
            models.CheckConstraint(
                condition=(
                    models.Q(anchor_month__isnull=True)
                    | models.Q(anchor_month__gte=1, anchor_month__lte=12)
                ),
                name="recinvplan_anchor_month_valid",
            ),
        ]

    def __str__(self):
        return f"{self.name} ({self.amount})"


class PortfolioSnapshot(models.Model):
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
    )
    total_value = models.DecimalField(
        max_digits=15, decimal_places=2, validators=[MinValueValidator(Decimal("0"))]
    )
    liquid_value = models.DecimalField(
        max_digits=15, decimal_places=2, validators=[MinValueValidator(Decimal("0"))]
    )
    illiquid_value = models.DecimalField(
        max_digits=15, decimal_places=2, validators=[MinValueValidator(Decimal("0"))]
    )
    snapshot_date = models.DateTimeField(default=timezone.now)
    snapshot_day = models.DateField(null=True, blank=True)
    # Granular breakdown by asset class {investment_type_id: amount_eur} and by asset [{asset_id, name, type_id, value}]
    by_asset_class = models.JSONField(default=dict)
    by_asset = models.JSONField(default=list)

    class Meta:
        ordering = ["-snapshot_date"]
        verbose_name = "Portfolio Snapshot"
        verbose_name_plural = "Portfolio Snapshots"
        indexes = [
            models.Index(fields=["snapshot_date"]),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["owner", "snapshot_day"],
                name="unique_snapshot_owner_day",
            ),
        ]

    def __str__(self):
        return f"Portfolio {self.total_value} EUR on {self.snapshot_date}"

    def save(self, *args, **kwargs):
        if self.snapshot_day is None and self.snapshot_date is not None:
            self.snapshot_day = self.snapshot_date.date()
        super().save(*args, **kwargs)


class FXRateHistory(models.Model):
    """Tasso di cambio giornaliero storico (fonte: Frankfurter/ECB). Usato per convertire asset in EUR nel wealth trend e nel monthly-overview."""

    from_currency = models.CharField(max_length=3)
    to_currency = models.CharField(max_length=3, default="EUR")
    date = models.DateField()
    rate = models.DecimalField(max_digits=12, decimal_places=6)
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["from_currency", "to_currency", "date", "owner"],
                name="unique_fxratehistory_pair_date_owner",
            ),
        ]
        indexes = [
            models.Index(fields=["owner", "from_currency", "to_currency", "date"]),
        ]
        verbose_name = "FX Rate History"

    def __str__(self):
        return f"{self.from_currency}→{self.to_currency} {self.date}: {self.rate}"


class AllocationTarget(models.Model):
    """Target percentuale di allocazione per tipo di investimento."""

    investment_type = models.ForeignKey(
        InvestmentType, on_delete=models.CASCADE, related_name="allocation_targets"
    )
    target_percent = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        validators=[MinValueValidator(Decimal("0"))],
    )
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
    )

    class Meta:
        verbose_name = "Allocation Target"
        verbose_name_plural = "Allocation Targets"
        constraints = [
            models.UniqueConstraint(
                fields=["owner", "investment_type"], name="unique_allocation_owner_type"
            ),
            models.CheckConstraint(
                condition=models.Q(target_percent__gte=0),
                name="allocationtarget_target_percent_non_negative",
            ),
        ]

    def __str__(self):
        return f"{self.investment_type.name}: {self.target_percent}%"


class DashboardSummary(models.Model):
    """Singleton (id=1) — cache materializzata del payload dashboard."""

    REASON_EXPENSE_CREATED = "expense_created"
    REASON_EXPENSE_UPDATED = "expense_updated"
    REASON_EXPENSE_DELETED = "expense_deleted"
    REASON_ASSET_CHANGED = "asset_changed"
    REASON_TRANSACTION = "transaction"
    REASON_PRICE_REFRESH = "price_refresh"

    payload = models.JSONField(default=dict)
    computed_at = models.DateTimeField(null=True, blank=True)
    invalidated_at = models.DateTimeField(null=True, blank=True)
    last_invalidation_reason = models.CharField(max_length=50, blank=True, default="")
    source_version = models.CharField(max_length=10, default="v1")
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
    )

    class Meta:
        verbose_name = "Dashboard Summary"
        constraints = [
            models.UniqueConstraint(
                fields=["owner"], name="unique_dashboard_summary_owner"
            ),
        ]

    def __str__(self):
        return f"DashboardSummary computed_at={self.computed_at}"

    @classmethod
    def get_singleton(cls, user=None):
        if not (user and getattr(user, "is_authenticated", False)):
            raise ValueError(
                "DashboardSummary.get_singleton requires an authenticated user"
            )
        obj, _ = cls.objects.get_or_create(owner=user)
        return obj

    @property
    def is_stale(self):
        if not self.computed_at:
            return True
        if self.invalidated_at and self.invalidated_at > self.computed_at:
            return True
        return False


class FireSettings(models.Model):
    """Singleton per utente — parametri utente per il calcolo FIRE."""

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
    )
    user_age = models.PositiveSmallIntegerField(default=30)
    retirement_age = models.PositiveSmallIntegerField(default=65)
    withdrawal_rate = models.DecimalField(
        max_digits=5, decimal_places=4, default=Decimal("0.04")
    )
    annual_expenses_override = models.DecimalField(
        max_digits=15,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Se impostato, sovrascrive la media degli ultimi 12 mesi da Expense.",
    )
    growth_rate_bear = models.DecimalField(
        max_digits=5, decimal_places=4, default=Decimal("0.04")
    )
    growth_rate_base = models.DecimalField(
        max_digits=5, decimal_places=4, default=Decimal("0.07")
    )
    growth_rate_bull = models.DecimalField(
        max_digits=5, decimal_places=4, default=Decimal("0.10")
    )
    inflation_rate = models.DecimalField(
        max_digits=5, decimal_places=4, default=Decimal("0.02")
    )
    net_worth_goal = models.DecimalField(
        max_digits=15, decimal_places=2, null=True, blank=True
    )
    model_mode = models.CharField(max_length=10, default="dual")
    swr_base = models.DecimalField(
        max_digits=5, decimal_places=4, default=Decimal("0.04")
    )
    swr_min = models.DecimalField(
        max_digits=5, decimal_places=4, default=Decimal("0.03")
    )
    swr_max = models.DecimalField(
        max_digits=5, decimal_places=4, default=Decimal("0.05")
    )
    annual_expenses_retirement = models.DecimalField(
        max_digits=15, decimal_places=2, null=True, blank=True
    )
    annual_passive_income_retirement = models.DecimalField(
        max_digits=15, decimal_places=2, default=Decimal("0")
    )
    expected_real_return = models.DecimalField(
        max_digits=5, decimal_places=4, default=Decimal("0.03")
    )
    expected_nominal_return = models.DecimalField(
        max_digits=5, decimal_places=4, default=Decimal("0.05")
    )
    annual_contribution = models.DecimalField(
        max_digits=15, decimal_places=2, null=True, blank=True
    )
    tax_drag_rate = models.DecimalField(
        max_digits=5, decimal_places=4, default=Decimal("0")
    )
    target_retirement_age = models.PositiveSmallIntegerField(default=65)
    life_expectancy = models.PositiveSmallIntegerField(default=95)
    portfolio_equity_pct = models.DecimalField(
        max_digits=5, decimal_places=2, default=Decimal("60.00")
    )

    class Meta:
        verbose_name = "FIRE Settings"
        constraints = [
            models.UniqueConstraint(
                fields=["owner"], name="unique_fire_settings_owner"
            ),
        ]

    def __str__(self):
        return f"FireSettings age={self.user_age} ret={self.retirement_age}"

    @classmethod
    def get_singleton(cls, user=None):
        if not (user and getattr(user, "is_authenticated", False)):
            raise ValueError(
                "FireSettings.get_singleton requires an authenticated user"
            )
        obj, _ = cls.objects.get_or_create(owner=user)
        return obj
