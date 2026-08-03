from django.contrib import admin

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


@admin.register(SplitContact)
class SplitContactAdmin(admin.ModelAdmin):
    list_display = ["display_name", "owner", "linked_user", "is_archived"]
    list_filter = ["is_archived"]
    search_fields = ["display_name"]


@admin.register(SplitPartnerLink)
class SplitPartnerLinkAdmin(admin.ModelAdmin):
    list_display = ["requester", "recipient", "status", "created_at"]
    list_filter = ["status"]


@admin.register(SplitGroup)
class SplitGroupAdmin(admin.ModelAdmin):
    list_display = ["name", "created_by", "is_archived", "created_at"]
    list_filter = ["is_archived"]
    search_fields = ["name"]


@admin.register(SplitParticipant)
class SplitParticipantAdmin(admin.ModelAdmin):
    list_display = ["group", "standalone_expense", "user", "contact", "is_active"]
    list_filter = ["is_active"]


@admin.register(SplitExpense)
class SplitExpenseAdmin(admin.ModelAdmin):
    list_display = ["date", "description", "amount", "group", "split_method"]
    list_filter = ["split_method", "date"]
    search_fields = ["description"]


@admin.register(SplitExpenseShare)
class SplitExpenseShareAdmin(admin.ModelAdmin):
    list_display = ["expense", "participant", "share_amount", "is_payer"]
    list_filter = ["is_payer"]


@admin.register(SplitSettlement)
class SplitSettlementAdmin(admin.ModelAdmin):
    list_display = [
        "date",
        "amount",
        "payer_user",
        "payer_contact",
        "payee_user",
        "payee_contact",
        "group",
    ]
    list_filter = ["date"]


@admin.register(SplitRecurringExpense)
class SplitRecurringExpenseAdmin(admin.ModelAdmin):
    list_display = [
        "group",
        "amount",
        "frequency",
        "day_of_month",
        "status",
        "start_date",
        "end_date",
    ]
    list_filter = ["status", "frequency"]


@admin.register(SplitRecurringExpenseParticipant)
class SplitRecurringExpenseParticipantAdmin(admin.ModelAdmin):
    list_display = ["recurring", "participant", "raw_input", "is_payer"]
    list_filter = ["is_payer"]
