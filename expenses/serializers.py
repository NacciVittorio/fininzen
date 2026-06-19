from rest_framework import serializers
from django.utils import timezone
from .models import (
    Budget,
    Category,
    Expense,
    ExpenseDescriptionSuggestion,
    RecurringExpense,
)
from portfolio.models import Asset
from fininzen.utils import serializer_user


def _bank_accounts_for(user):
    if not user:
        return Asset.objects.none()
    return Asset.objects.filter(
        owner=user,
        tracking_type=Asset.MANUAL,
        investment_type__is_bank_account=True,
    )


class SubcategorySerializer(serializers.ModelSerializer):
    expense_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Category
        fields = [
            "id",
            "name",
            "color",
            "icon",
            "category_type",
            "parent",
            "expense_count",
        ]


class CategorySerializer(serializers.ModelSerializer):
    expense_count = serializers.IntegerField(read_only=True)
    subcategory_expense_count = serializers.SerializerMethodField()
    subcategories = SubcategorySerializer(many=True, read_only=True)

    class Meta:
        model = Category
        fields = [
            "id",
            "name",
            "color",
            "icon",
            "category_type",
            "parent",
            "expense_count",
            "subcategory_expense_count",
            "subcategories",
        ]

    def get_fields(self):
        fields = super().get_fields()
        user = serializer_user(self)
        fields["parent"].queryset = (
            Category.objects.filter(owner=user) if user else Category.objects.none()
        )
        return fields

    def validate(self, attrs):
        attrs = super().validate(attrs)
        parent = attrs.get("parent")
        instance = getattr(self, "instance", None)
        category_type = attrs.get(
            "category_type",
            instance.category_type if instance else Category.EXPENSE,
        )
        if parent and parent.category_type != category_type:
            raise serializers.ValidationError(
                {"parent": "La categoria padre deve avere lo stesso tipo."}
            )
        if instance and parent:
            if parent.pk == instance.pk:
                raise serializers.ValidationError(
                    {"parent": "Una categoria non può essere padre di sé stessa."}
                )
            current = parent
            while current:
                if current.pk == instance.pk:
                    raise serializers.ValidationError(
                        {"parent": "Il parent creerebbe un ciclo."}
                    )
                current = current.parent
        return attrs

    def get_subcategory_expense_count(self, obj):
        # Sum the already-annotated expense_count on each prefetched subcategory.
        # Avoids a correlated subquery per parent row (1 extra query → N+1).
        return sum(
            getattr(sub, "expense_count", 0) or 0 for sub in obj.subcategories.all()
        )


class ExpenseSerializer(serializers.ModelSerializer):
    category_detail = CategorySerializer(source="category", read_only=True)
    category = serializers.PrimaryKeyRelatedField(
        queryset=Category.objects.all(), allow_null=False, required=True
    )
    linked_asset = serializers.PrimaryKeyRelatedField(
        queryset=Asset.objects.filter(tracking_type="MANUAL"),
        allow_null=True,
        required=False,
    )
    linked_asset_name = serializers.SerializerMethodField()

    def get_linked_asset_name(self, obj):
        return obj.linked_asset.name if obj.linked_asset_id else None

    class Meta:
        model = Expense
        fields = [
            "id",
            "description",
            "amount",
            "category",
            "category_detail",
            "date",
            "linked_asset",
            "linked_asset_name",
            "is_verified",
            "created_at",
        ]
        read_only_fields = ["created_at"]

    def get_fields(self):
        fields = super().get_fields()
        user = serializer_user(self)
        fields["category"].queryset = (
            Category.objects.filter(owner=user) if user else Category.objects.none()
        )
        fields["linked_asset"].queryset = _bank_accounts_for(user)
        return fields

    def validate_amount(self, value):
        if value <= 0:
            raise serializers.ValidationError("L'importo deve essere maggiore di zero.")
        return value

    def validate(self, attrs):
        attrs = super().validate(attrs)
        category = attrs.get("category")
        if self.instance is not None and "category" not in attrs:
            category = self.instance.category
        if category is None:
            raise serializers.ValidationError(
                {"category": "La categoria è obbligatoria."}
            )
        return attrs


class ExpenseDescriptionSuggestionSerializer(serializers.ModelSerializer):
    class Meta:
        model = ExpenseDescriptionSuggestion
        fields = ["text", "use_count", "last_used_at"]


class BudgetSerializer(serializers.ModelSerializer):
    class Meta:
        model = Budget
        fields = ["id", "category", "amount"]

    def get_fields(self):
        fields = super().get_fields()
        user = serializer_user(self)
        fields["category"].queryset = (
            Category.objects.filter(owner=user) if user else Category.objects.none()
        )
        return fields

    def validate_amount(self, value):
        if value <= 0:
            raise serializers.ValidationError("L'importo deve essere maggiore di zero.")
        return value


class RecurringExpenseSerializer(serializers.ModelSerializer):
    linked_asset_name = serializers.SerializerMethodField()

    def get_linked_asset_name(self, obj):
        return obj.linked_asset.name if obj.linked_asset_id else None

    def validate(self, attrs):
        instance = getattr(self, "instance", None)
        today = timezone.localdate()

        start_date = attrs.get("start_date", instance.start_date if instance else None)
        end_date = attrs.get("end_date", instance.end_date if instance else None)
        frequency = attrs.get(
            "frequency",
            instance.frequency if instance else RecurringExpense.FREQUENCY_MONTHLY,
        )
        month_of_year = attrs.get(
            "month_of_year", instance.month_of_year if instance else None
        )
        status = attrs.get("status", instance.status if instance else None)
        is_active = attrs.get("is_active", instance.is_active if instance else True)
        linked_asset = attrs.get(
            "linked_asset", instance.linked_asset if instance else None
        )
        owner = serializer_user(self)

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
        if frequency == RecurringExpense.FREQUENCY_YEARLY:
            if month_of_year is None:
                month_of_year = start_date.month
                attrs["month_of_year"] = month_of_year
            if not 1 <= int(month_of_year) <= 12:
                raise serializers.ValidationError(
                    {"month_of_year": "Il mese deve essere compreso tra 1 e 12."}
                )
        else:
            attrs["month_of_year"] = None
        if linked_asset:
            if not owner or linked_asset.owner_id != owner.id:
                raise serializers.ValidationError(
                    {"linked_asset": "Account non valido."}
                )
            if linked_asset.tracking_type != "MANUAL" or not (
                linked_asset.investment_type
                and linked_asset.investment_type.is_bank_account
            ):
                raise serializers.ValidationError(
                    {
                        "linked_asset": "L'account deve essere manuale e di tipo bank account."
                    }
                )

        # Keep compatibility between old `is_active` and new `status`.
        if status == RecurringExpense.STATUS_DELETED:
            attrs["is_active"] = False
        elif "is_active" in attrs and "status" not in attrs:
            attrs["status"] = (
                RecurringExpense.STATUS_ACTIVE
                if is_active
                else RecurringExpense.STATUS_DISABLED
            )
        elif "status" in attrs and "is_active" not in attrs:
            attrs["is_active"] = status == RecurringExpense.STATUS_ACTIVE
        return attrs

    def get_fields(self):
        fields = super().get_fields()
        user = serializer_user(self)
        fields["category"].queryset = (
            Category.objects.filter(owner=user) if user else Category.objects.none()
        )
        fields["linked_asset"].queryset = _bank_accounts_for(user)
        return fields

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

    class Meta:
        model = RecurringExpense
        fields = [
            "id",
            "description",
            "amount",
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
        ]
        read_only_fields = ["created_at", "disabled_at", "deleted_at"]
