"""
splitting/serializers.py — Serializer DRF per la feature Split.

Le ViewSet non usano mai `get_effective_user()`/ViewAsMixin (vedi
splitting/permissions.py e piano sez. 0.2): qui il contesto utente è sempre
`request.user` reale, mai una delega View As.
"""

from django.db import transaction
from django.utils import timezone
from rest_framework import serializers

from expenses.models import Category
from portfolio.models import Asset

from .models import (
    SplitContact,
    SplitExpense,
    SplitExpenseShare,
    SplitGroup,
    SplitParticipant,
    SplitPartnerLink,
    SplitRecurringExpense,
    SplitRecurringExpenseParticipant,
    SplitSettlement,
)
from .permissions import user_can_access_group
from .services import (
    SplitServiceError,
    apply_split_recurring_participants,
    apply_split_shares,
)


def _request_user(serializer):
    request = serializer.context.get("request")
    user = getattr(request, "user", None)
    return user if user and getattr(user, "is_authenticated", False) else None


def _bank_accounts_for(user):
    # Mirror of expenses/serializers.py::_bank_accounts_for — kept local
    # rather than imported since that helper is a private module symbol.
    if not user:
        return Asset.objects.none()
    return Asset.objects.filter(
        owner=user,
        tracking_type=Asset.MANUAL,
        investment_type__is_bank_account=True,
    )


# ── Contacts ─────────────────────────────────────────────────────────────


class SplitContactSerializer(serializers.ModelSerializer):
    linked_user_email = serializers.SerializerMethodField()

    class Meta:
        model = SplitContact
        fields = [
            "id",
            "display_name",
            "color",
            "linked_user",
            "linked_user_email",
            "is_archived",
            "created_at",
        ]
        # linked_user/is_archived are only ever set by the partner-link
        # accept flow / the destroy() soft-archive path, never by direct write.
        read_only_fields = ["linked_user", "is_archived", "created_at"]

    def get_linked_user_email(self, obj):
        return obj.linked_user.email if obj.linked_user_id else None

    def validate_display_name(self, value):
        value = (value or "").strip()
        if not value:
            raise serializers.ValidationError("Il nome è obbligatorio.")
        return value


# ── Partner links ────────────────────────────────────────────────────────


class SplitPartnerLinkSerializer(serializers.ModelSerializer):
    requester_email = serializers.SerializerMethodField()
    recipient_email = serializers.SerializerMethodField()

    class Meta:
        model = SplitPartnerLink
        fields = [
            "id",
            "requester",
            "requester_email",
            "recipient",
            "recipient_email",
            "status",
            "created_at",
            "responded_at",
        ]
        read_only_fields = fields

    def get_requester_email(self, obj):
        return obj.requester.email

    def get_recipient_email(self, obj):
        return obj.recipient.email


class SplitPartnerLinkCreateSerializer(serializers.Serializer):
    email = serializers.EmailField()


# ── Groups & participants ────────────────────────────────────────────────


class SplitParticipantSerializer(serializers.ModelSerializer):
    user_email = serializers.SerializerMethodField()
    contact_name = serializers.SerializerMethodField()
    contact_color = serializers.SerializerMethodField()

    class Meta:
        model = SplitParticipant
        fields = [
            "id",
            "group",
            "standalone_expense",
            "user",
            "user_email",
            "contact",
            "contact_name",
            "contact_color",
            "is_active",
            "created_at",
        ]
        read_only_fields = fields

    def get_user_email(self, obj):
        return obj.user.email if obj.user_id else None

    def get_contact_name(self, obj):
        return obj.contact.display_name if obj.contact_id else None

    def get_contact_color(self, obj):
        return obj.contact.color if obj.contact_id else None


class SplitParticipantInputSerializer(serializers.Serializer):
    """Payload for POST /groups/{id}/members/: exactly one of user_id/contact_id."""

    user_id = serializers.IntegerField(required=False, allow_null=True)
    contact_id = serializers.IntegerField(required=False, allow_null=True)

    def validate(self, attrs):
        user_id = attrs.get("user_id")
        contact_id = attrs.get("contact_id")
        if bool(user_id) == bool(contact_id):
            raise serializers.ValidationError(
                "Specificare esattamente uno tra user_id e contact_id."
            )
        return attrs


class SplitGroupSerializer(serializers.ModelSerializer):
    members = serializers.SerializerMethodField()

    class Meta:
        model = SplitGroup
        fields = [
            "id",
            "name",
            "icon",
            "is_archived",
            "created_by",
            "created_at",
            "members",
        ]
        read_only_fields = ["created_by", "created_at", "members"]

    def get_members(self, obj):
        qs = obj.participants.filter(is_active=True).select_related("user", "contact")
        return SplitParticipantSerializer(qs, many=True).data

    def validate_name(self, value):
        value = (value or "").strip()
        if not value:
            raise serializers.ValidationError("Il nome è obbligatorio.")
        return value


# ── Expenses & shares ────────────────────────────────────────────────────


class SplitExpenseShareOutputSerializer(serializers.ModelSerializer):
    participant_user_id = serializers.IntegerField(
        source="participant.user_id", read_only=True
    )
    participant_contact_id = serializers.IntegerField(
        source="participant.contact_id", read_only=True
    )

    class Meta:
        model = SplitExpenseShare
        fields = [
            "id",
            "participant",
            "participant_user_id",
            "participant_contact_id",
            "share_amount",
            "raw_input",
            "is_payer",
        ]
        read_only_fields = fields


class SplitExpenseParticipantInputSerializer(serializers.Serializer):
    user_id = serializers.IntegerField(required=False, allow_null=True)
    contact_id = serializers.IntegerField(required=False, allow_null=True)
    raw_input = serializers.DecimalField(
        max_digits=10, decimal_places=4, required=False, allow_null=True
    )
    is_payer = serializers.BooleanField(required=False, default=False)

    def validate(self, attrs):
        user_id = attrs.get("user_id")
        contact_id = attrs.get("contact_id")
        if bool(user_id) == bool(contact_id):
            raise serializers.ValidationError(
                "Specificare esattamente uno tra user_id e contact_id."
            )
        return attrs


class SplitExpenseSerializer(serializers.ModelSerializer):
    participants = SplitExpenseParticipantInputSerializer(many=True, write_only=True)
    shares = SplitExpenseShareOutputSerializer(many=True, read_only=True)

    class Meta:
        model = SplitExpense
        fields = [
            "id",
            "group",
            "description",
            "amount",
            "date",
            "split_method",
            "category",
            "linked_asset",
            "notes",
            "created_by",
            "created_at",
            "participants",
            "shares",
        ]
        read_only_fields = ["created_by", "created_at"]

    def get_fields(self):
        fields = super().get_fields()
        user = _request_user(self)
        # Same pattern as expenses/serializers.py::ExpenseSerializer: scope the
        # selectable category/account to the caller's own resources. Combined
        # with the payer check in validate() below, this is what guarantees
        # "category/linked_asset belong to the payer" (piano sez. 1.5): only
        # request.user's own rows are ever selectable in the first place.
        fields["category"].queryset = (
            Category.objects.filter(owner=user) if user else Category.objects.none()
        )
        fields["linked_asset"].queryset = _bank_accounts_for(user)
        return fields

    def validate_amount(self, value):
        if value <= 0:
            raise serializers.ValidationError("L'importo deve essere maggiore di zero.")
        return value

    def _existing_payer_user_id(self):
        """Identità utente del pagatore ATTUALMENTE persistito (share con
        is_payer=True), usata quando un PATCH parziale omette `participants`
        — vedi nota di sicurezza in validate()."""
        if self.instance is None:
            return None
        share = (
            self.instance.shares.filter(is_payer=True)
            .select_related("participant")
            .first()
        )
        return share.participant.user_id if share else None

    def validate(self, attrs):
        attrs = super().validate(attrs)
        request = self.context["request"]

        group = attrs.get("group", getattr(self.instance, "group", None))
        if group is not None and not user_can_access_group(request.user, group):
            raise serializers.ValidationError({"group": "Gruppo non accessibile."})

        participants = attrs.get("participants")
        payer_user_id = None
        if participants is not None:
            payer_entries = [p for p in participants if p.get("is_payer")]
            if len(payer_entries) != 1:
                raise serializers.ValidationError(
                    {"participants": "Deve esserci esattamente un pagatore."}
                )
            payer_user_id = payer_entries[0].get("user_id")

            split_method = attrs.get(
                "split_method",
                getattr(self.instance, "split_method", SplitExpense.EQUAL),
            )
            if split_method != SplitExpense.EQUAL:
                missing = [p for p in participants if p.get("raw_input") is None]
                if missing:
                    raise serializers.ValidationError(
                        {
                            "participants": (
                                "raw_input richiesto per questo metodo di divisione."
                            )
                        }
                    )
        elif self.instance is not None and (
            "amount" in attrs or "split_method" in attrs
        ):
            # BUG FIX (trovato dalla suite di test fase 8.1): un PATCH
            # parziale che cambia `amount`/`split_method` senza rimandare
            # `participants` lasciava silenziosamente le shares esistenti
            # invariate — la loro somma restava pari al VECCHIO importo,
            # disallineata dal nuovo `expense.amount` (e la shadow-tx
            # ricalcolata da `apply_split_shares` non veniva nemmeno
            # richiamata). Le quote dipendono sia dall'importo sia dal
            # metodo (piano sez. 1.5: "riscrittura shares ad ogni
            # create/update"): quando uno dei due cambia vanno sempre
            # rispecificati, non lasciati impliciti.
            raise serializers.ValidationError(
                {
                    "participants": (
                        "I partecipanti vanno rispecificati quando si "
                        "modifica l'importo o il metodo di divisione."
                    )
                }
            )
        elif self.instance is not None:
            # SECURITY FIX (revisione fase 9, CRIT): `participants` omesso in
            # un PATCH parziale (es. solo `category`/`linked_asset`) faceva
            # saltare INTERAMENTE il controllo sotto, perché viveva dentro
            # `if participants is not None:`. Un co-partecipante non pagatore
            # (che ha comunque accesso in scrittura via user_can_access_expense)
            # poteva così ripuntare category/linked_asset verso le proprie
            # risorse senza mai passare `participants` — vedi service layer
            # `_sync_shadow_for_expense`/`_cleanup_old_shadow_split_tx`, che
            # avrebbe poi cancellato la shadow-tx sul conto del VERO pagatore.
            # Il pagatore effettivo resta quello già persistito nelle shares.
            payer_user_id = self._existing_payer_user_id()

        # SECURITY FIX: il confronto è sempre contro l'owner REALE della
        # risorsa (category.owner_id/linked_asset.owner_id), non contro
        # request.user.id — questo copre sia il caso "valore nuovo" (già
        # scoped alle risorse di request.user via get_fields(), quindi il
        # confronto si riduce a request.user==payer se e solo se passa) sia
        # il caso "valore ereditato dall'istanza" quando `participants` è
        # omesso: deve comunque appartenere a chi risulta pagatore ORA, a
        # prescindere da chi ha inviato la richiesta PATCH.
        category = attrs.get("category", getattr(self.instance, "category", None))
        linked_asset = attrs.get(
            "linked_asset", getattr(self.instance, "linked_asset", None)
        )
        if category is not None and category.owner_id != payer_user_id:
            raise serializers.ValidationError(
                {"category": "La categoria deve appartenere al pagatore."}
            )
        if linked_asset is not None and linked_asset.owner_id != payer_user_id:
            raise serializers.ValidationError(
                {"linked_asset": "Il conto deve appartenere al pagatore."}
            )
        return attrs

    def create(self, validated_data):
        participants_payload = validated_data.pop("participants")
        request = self.context["request"]
        with transaction.atomic():
            expense = SplitExpense.objects.create(
                created_by=request.user, **validated_data
            )
            try:
                apply_split_shares(
                    expense,
                    participants_payload,
                    expense.split_method,
                    added_by=request.user,
                )
            except SplitServiceError as exc:
                raise serializers.ValidationError({"participants": str(exc)})
        return expense

    def update(self, instance, validated_data):
        participants_payload = validated_data.pop("participants", None)
        request = self.context["request"]
        with transaction.atomic():
            instance = super().update(instance, validated_data)
            if participants_payload is not None:
                try:
                    apply_split_shares(
                        instance,
                        participants_payload,
                        instance.split_method,
                        added_by=request.user,
                    )
                except SplitServiceError as exc:
                    raise serializers.ValidationError({"participants": str(exc)})
        return instance


# ── Settlements ──────────────────────────────────────────────────────────


class SplitSettlementSerializer(serializers.ModelSerializer):
    payer_user_email = serializers.SerializerMethodField()
    payee_user_email = serializers.SerializerMethodField()
    payer_contact_name = serializers.SerializerMethodField()
    payee_contact_name = serializers.SerializerMethodField()

    class Meta:
        model = SplitSettlement
        fields = [
            "id",
            "group",
            "payer_user",
            "payer_user_email",
            "payer_contact",
            "payer_contact_name",
            "payee_user",
            "payee_user_email",
            "payee_contact",
            "payee_contact_name",
            "amount",
            "date",
            "notes",
            "linked_asset",
            "created_by",
            "created_at",
        ]
        read_only_fields = ["created_by", "created_at"]

    def get_payer_user_email(self, obj):
        return obj.payer_user.email if obj.payer_user_id else None

    def get_payee_user_email(self, obj):
        return obj.payee_user.email if obj.payee_user_id else None

    def get_payer_contact_name(self, obj):
        return obj.payer_contact.display_name if obj.payer_contact_id else None

    def get_payee_contact_name(self, obj):
        return obj.payee_contact.display_name if obj.payee_contact_id else None

    def get_fields(self):
        fields = super().get_fields()
        user = _request_user(self)
        # Stesso pattern di SplitExpenseSerializer: il conto selezionabile è
        # scoped alle risorse del chiamante — combinato con il check
        # created_by in validate() qui sotto, garantisce che linked_asset
        # appartenga sempre a chi sta effettivamente registrando il saldo.
        fields["linked_asset"].queryset = _bank_accounts_for(user)
        # SECURITY FIX (revisione fase 9, HIGH): payer_contact/payee_contact
        # non erano mai scoped a owner=request.user (a differenza di
        # linked_asset sopra) — qualunque utente autenticato poteva
        # referenziare per id la rubrica privata di un altro utente
        # (SplitContact) e vedersela restituita nel response
        # (payer_contact_name/payee_contact_name). Stesso pattern di
        # linked_asset: se l'id non appartiene al chiamante, il
        # PrimaryKeyRelatedField lo rifiuta già in fase di
        # to_internal_value() con un 400 "does not exist" standard DRF.
        fields["payer_contact"].queryset = (
            SplitContact.objects.filter(owner=user)
            if user
            else SplitContact.objects.none()
        )
        fields["payee_contact"].queryset = (
            SplitContact.objects.filter(owner=user)
            if user
            else SplitContact.objects.none()
        )
        return fields

    def validate_amount(self, value):
        if value <= 0:
            raise serializers.ValidationError("L'importo deve essere maggiore di zero.")
        return value

    def validate(self, attrs):
        attrs = super().validate(attrs)
        request = self.context["request"]

        group = attrs.get("group", getattr(self.instance, "group", None))
        if group is not None and not user_can_access_group(request.user, group):
            raise serializers.ValidationError({"group": "Gruppo non accessibile."})

        payer_user = attrs.get("payer_user", getattr(self.instance, "payer_user", None))
        payer_contact = attrs.get(
            "payer_contact", getattr(self.instance, "payer_contact", None)
        )
        payee_user = attrs.get("payee_user", getattr(self.instance, "payee_user", None))
        payee_contact = attrs.get(
            "payee_contact", getattr(self.instance, "payee_contact", None)
        )

        if bool(payer_user) == bool(payer_contact):
            raise serializers.ValidationError(
                {"payer": "Specificare esattamente uno tra payer_user e payer_contact."}
            )
        if bool(payee_user) == bool(payee_contact):
            raise serializers.ValidationError(
                {"payee": "Specificare esattamente uno tra payee_user e payee_contact."}
            )

        payer_user_id = payer_user.id if payer_user else None
        payee_user_id = payee_user.id if payee_user else None
        payer_contact_id = payer_contact.id if payer_contact else None
        payee_contact_id = payee_contact.id if payee_contact else None

        # DEVIAZIONE MINORE dal piano (segnalata nel riepilogo finale): il
        # piano (sez. 1.6) elenca solo i due CheckConstraint DB "esattamente
        # una identità payer/payee" — non un divieto esplicito che payer e
        # payee coincidano. Un settlement payer==payee non ha senso di
        # dominio (un pagamento a se stessi non salda alcun debito reale) ed
        # è bloccato qui a livello applicativo: un CheckConstraint SQL
        # equivalente richiederebbe confrontare coppie eterogenee
        # user/contact, più fragile e meno leggibile di una validazione
        # Python nel serializer.
        same_identity = (
            payer_user_id is not None and payer_user_id == payee_user_id
        ) or (payer_contact_id is not None and payer_contact_id == payee_contact_id)
        if same_identity:
            raise serializers.ValidationError(
                {"payee": "Il pagatore e il beneficiario non possono coincidere."}
            )

        # Piano sez. 1.6: "created_by deve coincidere con l'identità 'user'
        # di una delle due parti" — non si può registrare un settlement di
        # cui non si è parte.
        if request.user.id not in {payer_user_id, payee_user_id}:
            raise serializers.ValidationError(
                {
                    "created_by": (
                        "Devi essere una delle due identità utente coinvolte nel saldo."
                    )
                }
            )

        # SECURITY FIX (revisione fase 9, HIGH): l'altra parte (quella che
        # NON è request.user), se è un utente registrato e non un contatto
        # locale, deve essere un partner collegato — stesso
        # `is_linked_partner` gate imposto per l'aggiunta di un membro
        # registrato a un gruppo (views/groups.py::members()). Senza questo
        # controllo chiunque poteva referenziare un user_id arbitrario per
        # payer_user/payee_user (l'altro utente si vedeva comparire un
        # debito/credito fabbricato mai richiesto né accettato).
        other_user_id = (
            payee_user_id if payer_user_id == request.user.id else payer_user_id
        )
        if other_user_id is not None:
            is_linked_partner = SplitContact.objects.filter(
                owner=request.user, linked_user_id=other_user_id, is_archived=False
            ).exists()
            if not is_linked_partner:
                field = (
                    "payee_user" if payer_user_id == request.user.id else "payer_user"
                )
                raise serializers.ValidationError(
                    {
                        field: (
                            "L'altro utente deve essere un partner collegato "
                            "(richiesta di collegamento accettata)."
                        )
                    }
                )

        return attrs

    def create(self, validated_data):
        request = self.context["request"]
        return SplitSettlement.objects.create(created_by=request.user, **validated_data)


# ── Recurring expenses (piano sez. 1.7/3.4) ─────────────────────────────────


class SplitRecurringExpenseParticipantOutputSerializer(serializers.ModelSerializer):
    participant_user_id = serializers.IntegerField(
        source="participant.user_id", read_only=True
    )
    participant_contact_id = serializers.IntegerField(
        source="participant.contact_id", read_only=True
    )

    class Meta:
        model = SplitRecurringExpenseParticipant
        fields = [
            "id",
            "participant",
            "participant_user_id",
            "participant_contact_id",
            "raw_input",
            "is_payer",
        ]
        read_only_fields = fields


class SplitRecurringExpenseSerializer(serializers.ModelSerializer):
    """Mirror di expenses.serializers.RecurringExpenseSerializer, più il
    payload write-only `participants` (stessa forma — e stesso serializer —
    di SplitExpenseSerializer) che alimenta il template
    SplitRecurringExpenseParticipant (piano sez. 1.7/3.4). La validazione di
    "ogni partecipante è un membro attivo del gruppo" vive nel service layer
    (apply_split_recurring_participants → SplitServiceError, catturato in
    create()/update() sotto), non duplicata qui — stesso principio di
    SplitExpenseSerializer/apply_split_shares."""

    linked_asset_name = serializers.SerializerMethodField()
    participants = SplitExpenseParticipantInputSerializer(many=True, write_only=True)
    participant_templates = SplitRecurringExpenseParticipantOutputSerializer(
        many=True, read_only=True
    )

    class Meta:
        model = SplitRecurringExpense
        fields = [
            "id",
            "group",
            "description",
            "amount",
            "split_method",
            "category",
            "linked_asset",
            "linked_asset_name",
            "frequency",
            "day_of_month",
            "month_of_year",
            "is_active",
            "status",
            "start_date",
            "end_date",
            "disabled_at",
            "deleted_at",
            "created_at",
            "created_by",
            "participants",
            "participant_templates",
        ]
        read_only_fields = ["created_at", "disabled_at", "deleted_at", "created_by"]

    def get_linked_asset_name(self, obj):
        return obj.linked_asset.name if obj.linked_asset_id else None

    def get_fields(self):
        fields = super().get_fields()
        user = _request_user(self)
        fields["category"].queryset = (
            Category.objects.filter(owner=user) if user else Category.objects.none()
        )
        fields["linked_asset"].queryset = _bank_accounts_for(user)
        return fields

    def _existing_payer_user_id(self):
        """Mirror di SplitExpenseSerializer._existing_payer_user_id, sul
        template dei partecipanti invece che sulle shares di un'occorrenza
        già generata."""
        if self.instance is None:
            return None
        template = (
            self.instance.participant_templates.filter(is_payer=True)
            .select_related("participant")
            .first()
        )
        return template.participant.user_id if template else None

    def validate_amount(self, value):
        if value <= 0:
            raise serializers.ValidationError("L'importo deve essere maggiore di zero.")
        return value

    def validate_day_of_month(self, value):
        if not 1 <= value <= 31:
            raise serializers.ValidationError(
                "Il giorno deve essere compreso tra 1 e 31."
            )
        return value

    def validate(self, attrs):
        attrs = super().validate(attrs)
        request = self.context["request"]
        instance = self.instance

        group = attrs.get("group", getattr(instance, "group", None))
        if group is None:
            raise serializers.ValidationError({"group": "Il gruppo è obbligatorio."})
        if not user_can_access_group(request.user, group):
            raise serializers.ValidationError({"group": "Gruppo non accessibile."})

        today = timezone.localdate()
        start_date = attrs.get("start_date", instance.start_date if instance else None)
        end_date = attrs.get("end_date", instance.end_date if instance else None)
        frequency = attrs.get(
            "frequency",
            instance.frequency if instance else SplitRecurringExpense.FREQUENCY_MONTHLY,
        )
        month_of_year = attrs.get(
            "month_of_year", instance.month_of_year if instance else None
        )
        status_value = attrs.get("status", instance.status if instance else None)
        is_active = attrs.get("is_active", instance.is_active if instance else True)
        linked_asset = attrs.get(
            "linked_asset", getattr(instance, "linked_asset", None)
        )

        if not start_date:
            raise serializers.ValidationError(
                {"start_date": "Questo campo è obbligatorio."}
            )
        if end_date and end_date < start_date:
            raise serializers.ValidationError(
                {
                    "end_date": "La data di fine non può essere precedente alla data di inizio."
                }
            )
        if end_date and end_date < today:
            raise serializers.ValidationError(
                {
                    "end_date": "La data di fine non può essere antecedente alla data attuale."
                }
            )
        if frequency == SplitRecurringExpense.FREQUENCY_YEARLY:
            if month_of_year is None:
                month_of_year = start_date.month
                attrs["month_of_year"] = month_of_year
            if not 1 <= int(month_of_year) <= 12:
                raise serializers.ValidationError(
                    {"month_of_year": "Il mese deve essere compreso tra 1 e 12."}
                )
        else:
            attrs["month_of_year"] = None

        # Compatibilità is_active/status, stessa logica di
        # RecurringExpenseSerializer.
        if status_value == SplitRecurringExpense.STATUS_DELETED:
            attrs["is_active"] = False
        elif "is_active" in attrs and "status" not in attrs:
            attrs["status"] = (
                SplitRecurringExpense.STATUS_ACTIVE
                if is_active
                else SplitRecurringExpense.STATUS_DISABLED
            )
        elif "status" in attrs and "is_active" not in attrs:
            attrs["is_active"] = status_value == SplitRecurringExpense.STATUS_ACTIVE

        participants = attrs.get("participants")
        payer_user_id = None
        if participants is not None:
            payer_entries = [p for p in participants if p.get("is_payer")]
            if len(payer_entries) != 1:
                raise serializers.ValidationError(
                    {"participants": "Deve esserci esattamente un pagatore."}
                )
            payer_user_id = payer_entries[0].get("user_id")
            split_method = attrs.get(
                "split_method",
                getattr(instance, "split_method", SplitRecurringExpense.EQUAL),
            )
            if split_method != SplitRecurringExpense.EQUAL:
                missing = [p for p in participants if p.get("raw_input") is None]
                if missing:
                    raise serializers.ValidationError(
                        {
                            "participants": (
                                "raw_input richiesto per questo metodo di divisione."
                            )
                        }
                    )
        elif instance is not None and ("amount" in attrs or "split_method" in attrs):
            # Mirror del fix su SplitExpenseSerializer.validate(): per
            # exact/percentage il template persiste importi/percentuali
            # assoluti (raw_input) che devono sommare al NUOVO importo — un
            # PATCH parziale che cambia solo `amount` senza aggiornare
            # `participants` lascerebbe un template incoerente, che
            # `_create_split_occurrence_if_missing` scarterebbe in silenzio
            # a ogni generazione futura (SplitServiceError catturata come
            # "skip", mai propagata all'utente). Richiesto esplicitamente
            # anche per `equal` per coerenza di contratto API.
            raise serializers.ValidationError(
                {
                    "participants": (
                        "I partecipanti vanno rispecificati quando si "
                        "modifica l'importo o il metodo di divisione."
                    )
                }
            )
        elif instance is not None:
            # SECURITY FIX (revisione fase 9, CRIT): stesso identico bug di
            # SplitExpenseSerializer — qui era anche PEGGIO, perché la
            # versione originale non validava MAI category-vs-pagatore (solo
            # linked_asset, e per giunta contro request.user invece che
            # contro il pagatore) — un membro qualunque del gruppo poteva
            # ripuntare `category` su ogni occorrenza futura generata da
            # questa ricorrenza semplicemente omettendo `participants`.
            payer_user_id = self._existing_payer_user_id()

        # SECURITY FIX: stesso confronto contro l'owner REALE della risorsa
        # (non contro request.user.id) usato in SplitExpenseSerializer —
        # copre sia il valore nuovo (già scoped a request.user via
        # get_fields()) sia quello ereditato dall'istanza quando
        # `participants` è omesso.
        category = attrs.get("category", getattr(instance, "category", None))
        if category is not None and category.owner_id != payer_user_id:
            raise serializers.ValidationError(
                {"category": "La categoria deve appartenere al pagatore."}
            )
        if linked_asset is not None and linked_asset.owner_id != payer_user_id:
            raise serializers.ValidationError(
                {"linked_asset": "Il conto deve appartenere al pagatore."}
            )
        return attrs

    def create(self, validated_data):
        participants_payload = validated_data.pop("participants")
        request = self.context["request"]
        with transaction.atomic():
            rec = SplitRecurringExpense.objects.create(
                created_by=request.user, **validated_data
            )
            try:
                apply_split_recurring_participants(rec, participants_payload)
            except SplitServiceError as exc:
                raise serializers.ValidationError({"participants": str(exc)})
        return rec

    def update(self, instance, validated_data):
        participants_payload = validated_data.pop("participants", None)
        with transaction.atomic():
            instance = super().update(instance, validated_data)
            if participants_payload is not None:
                try:
                    apply_split_recurring_participants(instance, participants_payload)
                except SplitServiceError as exc:
                    raise serializers.ValidationError({"participants": str(exc)})
        return instance
