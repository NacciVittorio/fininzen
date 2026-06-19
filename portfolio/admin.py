"""
portfolio/admin.py — Admin Django per il portafoglio.
"""

from django.contrib import admin
from django.contrib import messages
from .models import Asset, AssetContributionSource, ContributionSource, InvestmentType
from .prices import aggiorna_prezzo_singolo


@admin.register(InvestmentType)
class InvestmentTypeAdmin(admin.ModelAdmin):
    list_display = [
        "name",
        "icon",
        "color",
        "supports_ticker",
        "is_liquid_default",
        "asset_count",
    ]
    list_editable = ["supports_ticker", "is_liquid_default"]

    def asset_count(self, obj):
        return obj.assets.count()

    asset_count.short_description = "Asset"


@admin.register(ContributionSource)
class ContributionSourceAdmin(admin.ModelAdmin):
    list_display = ["name", "owner", "sort_order", "is_active"]
    list_filter = ["is_active", "owner"]
    search_fields = ["name", "owner__username", "owner__email"]
    list_editable = ["sort_order", "is_active"]


@admin.register(AssetContributionSource)
class AssetContributionSourceAdmin(admin.ModelAdmin):
    list_display = ["asset", "contribution_source", "owner", "sort_order"]
    list_filter = ["owner"]
    search_fields = ["asset__name", "contribution_source__name"]


@admin.register(Asset)
class AssetAdmin(admin.ModelAdmin):
    list_display = [
        "name",
        "investment_type",
        "ticker",
        "price_source",
        "source_symbol",
        "shares",
        "price_per_share",
        "invested_capital",
        "current_value",
        "is_liquid",
        "last_price_update",
    ]
    list_filter = ["investment_type", "price_source", "is_liquid", "currency"]
    search_fields = ["name", "ticker", "source_symbol"]
    readonly_fields = ["last_price_update", "created_at"]
    list_editable = ["current_value", "shares"]

    fieldsets = (
        (
            "Informazioni base",
            {"fields": ("name", "investment_type", "is_liquid", "notes")},
        ),
        (
            "Prezzi e quote (ETF / Azioni / Fondi / Crypto)",
            {
                "fields": (
                    "price_source",
                    "ticker",
                    "source_symbol",
                    "source_url",
                    "currency",
                    "shares",
                    "price_per_share",
                ),
                "description": "Compila fonte, simbolo e quote per l'aggiornamento automatico.",
            },
        ),
        ("Valori", {"fields": ("invested_capital", "current_value")}),
        (
            "Metadati",
            {"fields": ("last_price_update", "created_at"), "classes": ("collapse",)},
        ),
    )

    actions = ["aggiorna_prezzi_selezionati"]

    @admin.action(description="Aggiorna prezzi via provider")
    def aggiorna_prezzi_selezionati(self, request, queryset):
        successi = 0
        for asset in queryset:
            if aggiorna_prezzo_singolo(asset):
                successi += 1
        self.message_user(
            request,
            f"Aggiornati {successi}/{queryset.count()} asset.",
            messages.SUCCESS,
        )
