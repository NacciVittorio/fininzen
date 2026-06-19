from django.contrib import admin
from .models import Category, Expense


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ["name", "category_type", "parent", "color", "icon"]
    list_filter = ["category_type", "parent"]
    search_fields = ["name"]
    ordering = ["category_type", "parent__name", "name"]


@admin.register(Expense)
class ExpenseAdmin(admin.ModelAdmin):
    list_display = ["date", "description", "amount", "category"]
    list_filter = ["category", "date"]
    search_fields = ["description"]
    ordering = ["-date"]
    list_editable = ["amount", "category"]
