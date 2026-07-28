"""
splitting/models.py — Modelli per la feature "Split" (divisione spese condivise,
tipo Splitwise). Vedi il piano di implementazione per le decisioni vincolanti.

Fasi 1-3: SplitContact, SplitPartnerLink, SplitGroup, SplitParticipant,
SplitExpense, SplitExpenseShare, SplitSettlement.

Fase ricorrenze (piano sez. 1.7): SplitRecurringExpense e
SplitRecurringExpenseParticipant, in fondo al file (mirror dell'ordinamento di
expenses/models.py, dove RecurringExpense è definita dopo Expense) — più i
campi `recurring_source`/`recurring_occurrence_date` e il relativo
UniqueConstraint `uniq_split_rec_occ` su SplitExpense sotto, aggiunti solo ora
che SplitRecurringExpense esiste da referenziare (stesso pattern con cui
`expenses.Expense.recurring_source` referenzia `RecurringExpense`).
"""

from django.conf import settings
from django.db import models

from fininzen.fields import EncryptedTextField


class SplitContact(models.Model):
    """Rubrica personale dell'utente: contatto locale (solo nome, nessun
    account) oppure collegato a un altro utente fininzen tramite un
    SplitPartnerLink accettato (`linked_user` valorizzato)."""

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="split_contacts",
    )
    display_name = models.CharField(max_length=80)
    color = models.CharField(max_length=7, default="#8e8e8e")
    linked_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
    )
    is_archived = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["display_name", "id"]
        constraints = [
            models.UniqueConstraint(
                fields=["owner", "linked_user"],
                condition=models.Q(linked_user__isnull=False),
                name="uniq_split_contact_owner_linked_user",
            ),
        ]

    def __str__(self):
        return self.display_name


class SplitPartnerLink(models.Model):
    """Richiesta di collegamento reciproco tra due utenti fininzen.

    Niente infrastruttura email reale: risolta contro un utente esistente
    esattamente come GrantsView.post() (vedi splitting/services.py).
    """

    PENDING = "PENDING"
    ACCEPTED = "ACCEPTED"
    DECLINED = "DECLINED"
    CANCELLED = "CANCELLED"
    STATUS_CHOICES = [
        (PENDING, "Pending"),
        (ACCEPTED, "Accepted"),
        (DECLINED, "Declined"),
        (CANCELLED, "Cancelled"),
    ]

    requester = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="split_links_sent",
    )
    recipient = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="split_links_received",
    )
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default=PENDING)
    created_at = models.DateTimeField(auto_now_add=True)
    responded_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at", "id"]
        constraints = [
            models.CheckConstraint(
                condition=~models.Q(requester=models.F("recipient")),
                name="split_link_no_self",
            ),
            models.UniqueConstraint(
                fields=["requester", "recipient"],
                condition=models.Q(status="PENDING"),
                name="uniq_pending_split_partner_link",
            ),
        ]

    def __str__(self):
        return f"{self.requester} → {self.recipient} ({self.status})"


class SplitGroup(models.Model):
    """Gruppo persistente (es. "Viaggio a Roma") con membri fissi."""

    name = models.CharField(max_length=120)
    icon = models.CharField(max_length=10, default="👥")
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="split_groups_created",
    )
    is_archived = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "id"]

    def __str__(self):
        return self.name


class SplitParticipant(models.Model):
    """Identità unificata: membro di un gruppo persistente OPPURE
    partecipante ad-hoc di una singola spesa occasionale (mai entrambi).

    In entrambi i contesti, l'identità è uno user registrato OPPURE un
    contatto locale (mai entrambi, mai nessuno) — vedi le due coppie di
    CheckConstraint sotto. Una sola tabella per i due scope evita di
    duplicare la logica ibrida "user XOR contact" e rende identiche le query
    di saldo (fase successiva) in entrambi i casi.
    """

    group = models.ForeignKey(
        SplitGroup,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="participants",
    )
    standalone_expense = models.ForeignKey(
        "SplitExpense",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="adhoc_participants",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="split_participations",
    )
    contact = models.ForeignKey(
        SplitContact,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="participations",
    )
    added_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="+",
    )
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.CheckConstraint(
                condition=(
                    models.Q(group__isnull=False, standalone_expense__isnull=True)
                    | models.Q(group__isnull=True, standalone_expense__isnull=False)
                ),
                name="splitparticipant_exactly_one_scope",
            ),
            models.CheckConstraint(
                condition=(
                    models.Q(user__isnull=False, contact__isnull=True)
                    | models.Q(user__isnull=True, contact__isnull=False)
                ),
                name="splitparticipant_exactly_one_identity",
            ),
            models.UniqueConstraint(
                fields=["group", "user"],
                condition=models.Q(user__isnull=False),
                name="uniq_group_member_user",
            ),
            models.UniqueConstraint(
                fields=["group", "contact"],
                condition=models.Q(contact__isnull=False),
                name="uniq_group_member_contact",
            ),
        ]

    def __str__(self):
        who = self.user_id or self.contact_id
        return f"SplitParticipant<{who}>"


class SplitExpense(models.Model):
    """Spesa condivisa, di gruppo (group valorizzato) o occasionale
    (group=None, partecipanti ad-hoc). Le quote vivono in SplitExpenseShare."""

    EQUAL = "equal"
    EXACT = "exact"
    PERCENTAGE = "percentage"
    SHARES = "shares"
    SPLIT_METHOD_CHOICES = [
        (EQUAL, "Equal"),
        (EXACT, "Exact amounts"),
        (PERCENTAGE, "Percentage"),
        (SHARES, "Shares/weights"),
    ]

    group = models.ForeignKey(
        SplitGroup,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="expenses",
    )
    description = models.CharField(max_length=200)
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    date = models.DateField()
    split_method = models.CharField(
        max_length=10, choices=SPLIT_METHOD_CHOICES, default=EQUAL
    )
    # SET_NULL: se l'utente cancella la categoria/il conto, le spese Split
    # storiche restano ma perdono il riferimento — stesso pattern di
    # expenses.Expense.category/linked_asset.
    category = models.ForeignKey(
        "expenses.Category",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="split_expenses",
    )
    linked_asset = models.ForeignKey(
        "portfolio.Asset",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="linked_split_expenses",
    )
    notes = EncryptedTextField(blank=True, default="")
    # SET_NULL (non CASCADE): cancellare la ricorrenza non deve cancellare lo
    # storico delle occorrenze già generate — stesso pattern di
    # expenses.Expense.recurring_source verso RecurringExpense.
    recurring_source = models.ForeignKey(
        "SplitRecurringExpense",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="generated_expenses",
    )
    recurring_occurrence_date = models.DateField(null=True, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="split_expenses_created",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-date", "-created_at"]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(amount__gt=0),
                name="split_expense_amount_positive",
            ),
            # Idempotenza della generazione ricorrente (piano sez. 1.7/3.4):
            # a differenza di expenses.Expense.uniq_rec_occ_owner, qui non
            # c'è un owner diretto da includere nella chiave — un dato
            # recurring_source appartiene sempre a un solo gruppo, quindi
            # (recurring_source, recurring_occurrence_date) da solo basta a
            # impedire doppie occorrenze per lo stesso mese/anno.
            models.UniqueConstraint(
                fields=["recurring_source", "recurring_occurrence_date"],
                condition=models.Q(
                    recurring_source__isnull=False,
                    recurring_occurrence_date__isnull=False,
                ),
                name="uniq_split_rec_occ",
            ),
        ]

    def __str__(self):
        return f"{self.date} — {self.description} ({self.amount}€)"


class SplitExpenseShare(models.Model):
    """Quota di un singolo partecipante su una SplitExpense.

    `is_payer=True` su una sola riga per spesa (UniqueConstraint sotto) —
    impone a livello DB "un solo pagatore per spesa" (decisione utente #6).
    """

    expense = models.ForeignKey(
        SplitExpense, on_delete=models.CASCADE, related_name="shares"
    )
    # CASCADE (bug fix, suite di test fase 8.1): era PROTECT in origine,
    # nell'idea di impedire di eliminare un partecipante finché ha quote
    # storiche. In pratica quella protezione non è mai raggiungibile dal
    # flusso applicativo normale (la rimozione di un membro è sempre un
    # soft-deactivate via /groups/{id}/members/{id}/, mai un delete diretto)
    # e crea invece un deadlock strutturale nel collector di cancellazione di
    # Django: cancellare una SplitExpense occasionale cascata sia sulle sue
    # shares (`expense` CASCADE) sia sui suoi SplitParticipant ad-hoc
    # (`standalone_expense` CASCADE, vedi sotto) — ma il controllo PROTECT su
    # queste shares viene valutato con una query fresca sul DB, che le trova
    # ancora presenti (nulla è fisicamente cancellato durante la fase di
    # raccolta), sollevando ProtectedError anche se l'operazione nel suo
    # complesso è coerente. Stesso problema, identico, alla cancellazione di
    # un intero SplitGroup con storico spese. CASCADE risolve entrambi i casi
    # senza bisogno di override espliciti di delete() sui modelli a monte.
    participant = models.ForeignKey(
        SplitParticipant, on_delete=models.CASCADE, related_name="shares"
    )
    share_amount = models.DecimalField(max_digits=10, decimal_places=2)
    # % o peso o importo esatto pre-arrotondamento, per mostrare all'utente il
    # valore che ha effettivamente inserito (share_amount è già arrotondato).
    raw_input = models.DecimalField(
        max_digits=10, decimal_places=4, null=True, blank=True
    )
    is_payer = models.BooleanField(default=False)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["expense", "participant"],
                name="uniq_split_share_expense_participant",
            ),
            models.UniqueConstraint(
                fields=["expense"],
                condition=models.Q(is_payer=True),
                name="uniq_split_expense_single_payer",
            ),
            models.CheckConstraint(
                condition=models.Q(share_amount__gte=0),
                name="split_share_amount_non_negative",
            ),
        ]

    def __str__(self):
        return f"SplitExpenseShare<{self.expense_id}:{self.participant_id}={self.share_amount}>"


class SplitSettlement(models.Model):
    """Pagamento che salda (in tutto o in parte) un debito tra due identità
    (piano sez. 1.6).

    Non lega a SplitParticipant: un settlement può saldare un aggregato
    cross-gruppo, non solo il debito residuo interno a un gruppo specifico —
    `group` è quindi opzionale (valorizzato solo quando il saldo viene
    registrato dal contesto di un gruppo, es. il pulsante "Salda debito"
    nella pagina di quel gruppo; None per un saldo cross-gruppo registrato
    dall'overview complessivo).

    Validazione applicativa (serializer, non DB): `created_by` deve
    coincidere con l'identità "user" di payer_user o payee_user — non è
    possibile registrare un settlement di cui non si è parte.
    """

    group = models.ForeignKey(
        SplitGroup,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="settlements",
    )
    payer_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="split_settlements_paid",
    )
    payer_contact = models.ForeignKey(
        SplitContact,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
    )
    payee_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="split_settlements_received",
    )
    payee_contact = models.ForeignKey(
        SplitContact,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
    )
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    date = models.DateField()
    notes = EncryptedTextField(blank=True, default="")
    linked_asset = models.ForeignKey(
        "portfolio.Asset",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="linked_split_settlements",
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="split_settlements_created",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-date", "-created_at"]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(amount__gt=0),
                name="split_settlement_amount_positive",
            ),
            models.CheckConstraint(
                condition=(
                    models.Q(payer_user__isnull=False, payer_contact__isnull=True)
                    | models.Q(payer_user__isnull=True, payer_contact__isnull=False)
                ),
                name="split_settlement_exactly_one_payer_identity",
            ),
            models.CheckConstraint(
                condition=(
                    models.Q(payee_user__isnull=False, payee_contact__isnull=True)
                    | models.Q(payee_user__isnull=True, payee_contact__isnull=False)
                ),
                name="split_settlement_exactly_one_payee_identity",
            ),
        ]

    def __str__(self):
        return f"SplitSettlement<{self.pk}: {self.amount}>"


class SplitRecurringExpense(models.Model):
    """Spesa ricorrente di gruppo — mirror di expenses.RecurringExpense
    (piano sez. 1.7), stessi campi day_of_month/month_of_year/frequency/
    status ACTIVE-DISABLED-DELETED/start_date/end_date.

    `group` è OBBLIGATORIO (mai None), a differenza di SplitExpense.group:
    una ricorrenza richiede un roster stabile nel tempo, mentre una
    SplitExpense singola può restare occasionale. Nessun `owner` singolo qui
    (piano sez. 0.1) — `created_by` è solo audit di chi ha creato la
    definizione, l'autorizzazione reale passa da `user_can_access_group`.

    Il template dei partecipanti (SplitRecurringExpenseParticipant, sotto) è
    popolato per intero per i metodi exact/percentage/shares; per equal si
    persiste SOLO la riga del pagatore (raw_input=None) — il resto del
    roster è risolto al momento della generazione dai membri ATTIVI del
    gruppo (si adatta se la composizione del gruppo cambia nel frattempo),
    invece di congelare una lista statica alla creazione.
    """

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
    # Stessi valori di SplitExpense.SPLIT_METHOD_CHOICES (fonte unica di
    # verità per le 4 stringhe), esposti anche qui per comodità di confronto
    # (es. `rec.split_method == SplitRecurringExpense.EQUAL`).
    EQUAL = SplitExpense.EQUAL
    EXACT = SplitExpense.EXACT
    PERCENTAGE = SplitExpense.PERCENTAGE
    SHARES = SplitExpense.SHARES

    group = models.ForeignKey(
        SplitGroup,
        on_delete=models.CASCADE,
        related_name="recurring_expenses",
    )
    description = EncryptedTextField()
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    split_method = models.CharField(
        max_length=10,
        choices=SplitExpense.SPLIT_METHOD_CHOICES,
        default=SplitExpense.EQUAL,
    )
    category = models.ForeignKey(
        "expenses.Category",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="split_recurring_expenses",
    )
    linked_asset = models.ForeignKey(
        "portfolio.Asset",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="split_recurring_expenses",
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
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="split_recurring_expenses_created",
    )

    class Meta:
        # `description` è cifrata (ciphertext randomizzato): stesso motivo di
        # RecurringExpense.Meta, ordina per data invece che per testo.
        ordering = ["-start_date", "id"]
        indexes = [
            models.Index(fields=["group", "status", "is_active", "start_date"]),
            models.Index(fields=["group", "start_date", "end_date"]),
        ]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(amount__gt=0),
                name="split_recurringexpense_amount_positive",
            ),
            models.CheckConstraint(
                condition=models.Q(day_of_month__gte=1, day_of_month__lte=31),
                name="split_recurringexpense_day_valid",
            ),
            models.CheckConstraint(
                condition=(
                    models.Q(month_of_year__isnull=True)
                    | models.Q(month_of_year__gte=1, month_of_year__lte=12)
                ),
                name="split_recurringexpense_month_valid",
            ),
        ]

    def __str__(self):
        return f"{self.description} ({self.amount}€)"


class SplitRecurringExpenseParticipant(models.Model):
    """Template dei partecipanti di una SplitRecurringExpense (piano sez.
    1.7) — stessa forma di SplitExpenseShare (participant + raw_input +
    is_payer), ma applicata alla DEFINIZIONE ricorrente invece che a una
    singola occorrenza già generata: `participant` referenzia sempre un
    membro del gruppo obbligatorio della ricorrenza.

    Per split_method=EQUAL si persiste SOLO la riga del pagatore (vedi
    docstring di SplitRecurringExpense); per exact/percentage/shares si
    persiste una riga per ogni partecipante del piano di divisione.
    """

    recurring = models.ForeignKey(
        SplitRecurringExpense,
        on_delete=models.CASCADE,
        related_name="participant_templates",
    )
    # CASCADE: mirror di SplitExpenseShare.participant — vedi la nota lì
    # (bug fix fase 8.1) sul perché PROTECT crea un deadlock nel collector di
    # Django quando l'intero SplitGroup di questa ricorrenza viene eliminato
    # (i suoi SplitParticipant cascatano via `group`, mentre queste righe
    # template li referenziavano ancora con PROTECT).
    participant = models.ForeignKey(
        SplitParticipant,
        on_delete=models.CASCADE,
        related_name="recurring_templates",
    )
    raw_input = models.DecimalField(
        max_digits=10, decimal_places=4, null=True, blank=True
    )
    is_payer = models.BooleanField(default=False)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["recurring", "participant"],
                name="uniq_split_rec_participant",
            ),
            models.UniqueConstraint(
                fields=["recurring"],
                condition=models.Q(is_payer=True),
                name="uniq_split_rec_single_payer",
            ),
        ]

    def __str__(self):
        return (
            f"SplitRecurringExpenseParticipant<{self.recurring_id}:"
            f"{self.participant_id}>"
        )
