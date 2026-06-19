from expenses.models import Budget


def test_create_budget(client, expense_cat):
    res = client.post(
        "/api/expenses/budgets/",
        data={"category": expense_cat.id, "amount": "300.00"},
        content_type="application/json",
    )
    assert res.status_code == 201
    assert Budget.objects.filter(category=expense_cat, amount="300.00").exists()


def test_create_budget_upserts_existing(client, expense_cat):
    client.post(
        "/api/expenses/budgets/",
        data={"category": expense_cat.id, "amount": "300.00"},
        content_type="application/json",
    )
    res = client.post(
        "/api/expenses/budgets/",
        data={"category": expense_cat.id, "amount": "500.00"},
        content_type="application/json",
    )
    assert res.status_code == 200
    assert Budget.objects.filter(category=expense_cat).count() == 1
    assert float(Budget.objects.get(category=expense_cat).amount) == 500.0


def test_list_budgets(client, budget):
    res = client.get("/api/expenses/budgets/")
    assert res.status_code == 200
    data = res.json()
    items = data["results"] if isinstance(data, dict) else data
    assert any(b["id"] == budget.id for b in items)


def test_patch_budget(client, budget):
    res = client.patch(
        f"/api/expenses/budgets/{budget.id}/",
        data={"amount": "400.00"},
        content_type="application/json",
    )
    assert res.status_code == 200
    budget.refresh_from_db()
    assert float(budget.amount) == 400.0


def test_delete_budget(client, budget):
    res = client.delete(f"/api/expenses/budgets/{budget.id}/")
    assert res.status_code == 204
    assert not Budget.objects.filter(pk=budget.id).exists()


def test_create_budget_missing_fields_returns_400(client, db):
    res = client.post(
        "/api/expenses/budgets/",
        data={},
        content_type="application/json",
    )
    assert res.status_code == 400
    assert "error" in res.json()
