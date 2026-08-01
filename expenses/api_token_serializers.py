"""Lenient input handling for the quick-add endpoint (ApiToken-authenticated
automation clients, e.g. an iOS Shortcut). Kept apart from serializers.py for
the same reason import_csv.py lives apart from it: automation-specific
leniency (category resolved by name, optional fields) doesn't belong in the
strict serializer used by the normal authenticated app."""

from django.utils import timezone
from rest_framework import serializers

from .models import Category, Expense
from .services import FALLBACK_CATEGORY_NAME, get_or_create_fallback_category


class QuickAddExpenseSerializer(serializers.Serializer):
    amount = serializers.DecimalField(max_digits=10, decimal_places=2)
    description = serializers.CharField(
        max_length=200, required=False, allow_blank=True
    )
    merchant = serializers.CharField(max_length=200, required=False, allow_blank=True)
    category = serializers.CharField(required=False, allow_blank=True)
    date = serializers.DateField(required=False)

    def validate_amount(self, value):
        if value == 0:
            raise serializers.ValidationError("Amount cannot be zero.")
        return value

    def validate(self, attrs):
        user = self.context["user"]
        category_name = (attrs.pop("category", "") or "").strip()
        cat = None
        if category_name:
            cat = Category.objects.filter(
                owner=user, name__iexact=category_name
            ).first()
        if cat is None:
            cat = get_or_create_fallback_category(user)
        attrs["category"] = cat

        merchant = attrs.pop("merchant", "")
        if not attrs.get("description"):
            attrs["description"] = merchant or category_name or FALLBACK_CATEGORY_NAME
        attrs.setdefault("date", timezone.localdate())
        return attrs

    def create(self, validated_data):
        return Expense.objects.create(**validated_data)
