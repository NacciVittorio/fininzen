from datetime import date

from expenses.models import Category, Expense, ExpenseDescriptionSuggestion


def test_create_expense_tracks_description_suggestion(client, test_user):
    category = Category.objects.create(
        name="Food",
        category_type=Category.EXPENSE,
        owner=test_user,
    )

    res = client.post(
        "/api/expenses/",
        data={
            "description": "Pizza da Mario",
            "amount": "18.50",
            "category": category.id,
            "date": "2026-05-01",
        },
        content_type="application/json",
    )

    assert res.status_code == 201
    suggestion = ExpenseDescriptionSuggestion.objects.get(
        owner=test_user,
        category=category,
        text="Pizza da Mario",
    )
    assert suggestion.use_count == 1


def test_patch_expense_description_tracks_new_suggestion(client, test_user):
    category = Category.objects.create(
        name="Food",
        category_type=Category.EXPENSE,
        owner=test_user,
    )
    expense = Expense.objects.create(
        description="Pizza",
        amount="15.00",
        category=category,
        date=date(2026, 5, 1),
        owner=test_user,
    )

    res = client.patch(
        f"/api/expenses/{expense.id}/",
        data={"description": "Pizza da Mario"},
        content_type="application/json",
    )

    assert res.status_code == 200
    assert ExpenseDescriptionSuggestion.objects.filter(
        owner=test_user,
        category=category,
        text="Pizza da Mario",
    ).exists()


def test_patch_expense_is_verified_does_not_create_suggestion(client, test_user):
    category = Category.objects.create(
        name="Food",
        category_type=Category.EXPENSE,
        owner=test_user,
    )
    expense = Expense.objects.create(
        description="Pizza",
        amount="15.00",
        category=category,
        date=date(2026, 5, 1),
        owner=test_user,
    )

    res = client.patch(
        f"/api/expenses/{expense.id}/",
        data={"is_verified": True},
        content_type="application/json",
    )

    assert res.status_code == 200
    expense.refresh_from_db()
    assert expense.is_verified is True
    assert not ExpenseDescriptionSuggestion.objects.filter(owner=test_user).exists()


def test_suggestions_are_pruned_to_ten_per_category(client, test_user):
    category = Category.objects.create(
        name="Food",
        category_type=Category.EXPENSE,
        owner=test_user,
    )

    for idx in range(11):
        res = client.post(
            "/api/expenses/",
            data={
                "description": f"Entry {idx}",
                "amount": "10.00",
                "category": category.id,
                "date": "2026-05-01",
            },
            content_type="application/json",
        )
        assert res.status_code == 201

    texts = set(
        ExpenseDescriptionSuggestion.objects.filter(
            owner=test_user,
            category=category,
        ).values_list("text", flat=True)
    )
    assert len(texts) == 10
    assert "Entry 0" not in texts


# ── GET /api/expenses/description-suggestions/ ────────────────────────────────


def test_description_suggestions_endpoint_returns_texts(client, test_user):
    category = Category.objects.create(
        name="Food", category_type=Category.EXPENSE, owner=test_user
    )
    ExpenseDescriptionSuggestion.objects.create(
        owner=test_user, category=category, text="Pizza da Mario"
    )
    ExpenseDescriptionSuggestion.objects.create(
        owner=test_user, category=category, text="Sushi"
    )

    res = client.get(
        f"/api/expenses/description-suggestions/?category_id={category.id}"
    )

    assert res.status_code == 200
    assert "Pizza da Mario" in res.json()
    assert "Sushi" in res.json()


def test_description_suggestions_without_category_id_returns_empty(client, test_user):
    res = client.get("/api/expenses/description-suggestions/")
    assert res.status_code == 200
    assert res.json() == []


def test_description_suggestions_q_filters_by_prefix(client, test_user):
    category = Category.objects.create(
        name="Food", category_type=Category.EXPENSE, owner=test_user
    )
    ExpenseDescriptionSuggestion.objects.create(
        owner=test_user, category=category, text="Pizza da Mario"
    )
    ExpenseDescriptionSuggestion.objects.create(
        owner=test_user, category=category, text="Pasta"
    )

    res = client.get(
        f"/api/expenses/description-suggestions/?category_id={category.id}&q=Pi"
    )

    assert res.status_code == 200
    data = res.json()
    assert "Pizza da Mario" in data
    assert "Pasta" not in data


def test_description_suggestions_scoped_to_owner(client, test_user, django_db_setup):
    from django.contrib.auth import get_user_model

    User = get_user_model()
    other = User.objects.create_user(username="other2", password="pass")
    category = Category.objects.create(
        name="Food", category_type=Category.EXPENSE, owner=test_user
    )
    other_cat = Category.objects.create(
        name="Food", category_type=Category.EXPENSE, owner=other
    )
    ExpenseDescriptionSuggestion.objects.create(
        owner=test_user, category=category, text="Mine"
    )
    ExpenseDescriptionSuggestion.objects.create(
        owner=other, category=other_cat, text="NotMine"
    )

    res = client.get(
        f"/api/expenses/description-suggestions/?category_id={category.id}"
    )

    assert res.status_code == 200
    data = res.json()
    assert "Mine" in data
    assert "NotMine" not in data
