"""splitting/tests/test_split_expenses_api.py — API CRUD delle spese
condivise (`/api/split/expenses/`, piano sez. 1.5/6/8.1): i 4 metodi di
divisione via HTTP, arrotondamento 100€/3, validazioni (percentuali ≠ 100,
importi esatti che non sommano al totale, vincolo un solo pagatore,
categoria/conto di un altro utente), scoping/permessi in lettura.
"""

from decimal import Decimal

from expenses.models import Category
from portfolio.models import Asset, InvestmentType
from splitting.models import SplitExpense, SplitGroup, SplitParticipant


class TestCreateFourMethods:
    def test_equal_split_standalone(
        self, client, test_user, second_user, split_contact_linked
    ):
        res = client.post(
            "/api/split/expenses/",
            data={
                "description": "Taxi",
                "amount": "40.00",
                "date": "2026-07-01",
                "split_method": "equal",
                "participants": [
                    {"user_id": test_user.id, "is_payer": True},
                    {"user_id": second_user.id},
                ],
            },
            content_type="application/json",
        )

        assert res.status_code == 201, res.content
        shares = {
            s["participant_user_id"]: s["share_amount"] for s in res.json()["shares"]
        }
        assert shares[test_user.id] == "20.00"
        assert shares[second_user.id] == "20.00"

    def test_equal_split_rounding_100_over_3(
        self, client, split_group_with_contact_and_user, test_user
    ):
        group, _owner_p, member_p, contact_p = split_group_with_contact_and_user
        res = client.post(
            "/api/split/expenses/",
            data={
                "group": group.id,
                "description": "Cena",
                "amount": "100.00",
                "date": "2026-07-01",
                "split_method": "equal",
                "participants": [
                    {"user_id": test_user.id, "is_payer": True},
                    {"user_id": member_p.user_id},
                    {"contact_id": contact_p.contact_id},
                ],
            },
            content_type="application/json",
        )

        assert res.status_code == 201, res.content
        amounts = sorted(Decimal(s["share_amount"]) for s in res.json()["shares"])
        assert sum(amounts) == Decimal("100.00")
        assert amounts == [Decimal("33.33"), Decimal("33.33"), Decimal("33.34")]

    def test_exact_split(self, client, test_user, second_user, third_user):
        group = SplitGroup.objects.create(name="Casa", created_by=test_user)
        SplitParticipant.objects.create(group=group, user=test_user, added_by=test_user)
        SplitParticipant.objects.create(
            group=group, user=second_user, added_by=test_user
        )
        SplitParticipant.objects.create(
            group=group, user=third_user, added_by=test_user
        )

        res = client.post(
            "/api/split/expenses/",
            data={
                "group": group.id,
                "description": "Spesa",
                "amount": "100.00",
                "date": "2026-07-01",
                "split_method": "exact",
                "participants": [
                    {"user_id": test_user.id, "is_payer": True, "raw_input": "50.00"},
                    {"user_id": second_user.id, "raw_input": "30.00"},
                    {"user_id": third_user.id, "raw_input": "20.00"},
                ],
            },
            content_type="application/json",
        )

        assert res.status_code == 201, res.content
        shares = {
            s["participant_user_id"]: s["share_amount"] for s in res.json()["shares"]
        }
        assert shares[test_user.id] == "50.00"
        assert shares[second_user.id] == "30.00"
        assert shares[third_user.id] == "20.00"

    def test_percentage_split(
        self, client, test_user, second_user, split_contact_linked
    ):
        res = client.post(
            "/api/split/expenses/",
            data={
                "description": "Weekend",
                "amount": "200.00",
                "date": "2026-07-01",
                "split_method": "percentage",
                "participants": [
                    {"user_id": test_user.id, "is_payer": True, "raw_input": "75"},
                    {"user_id": second_user.id, "raw_input": "25"},
                ],
            },
            content_type="application/json",
        )

        assert res.status_code == 201, res.content
        shares = {
            s["participant_user_id"]: s["share_amount"] for s in res.json()["shares"]
        }
        assert shares[test_user.id] == "150.00"
        assert shares[second_user.id] == "50.00"

    def test_shares_weighted_split(
        self, client, test_user, second_user, split_contact_linked
    ):
        res = client.post(
            "/api/split/expenses/",
            data={
                "description": "Affitto",
                "amount": "90.00",
                "date": "2026-07-01",
                "split_method": "shares",
                "participants": [
                    {"user_id": test_user.id, "is_payer": True, "raw_input": "2"},
                    {"user_id": second_user.id, "raw_input": "1"},
                ],
            },
            content_type="application/json",
        )

        assert res.status_code == 201, res.content
        shares = {
            s["participant_user_id"]: s["share_amount"] for s in res.json()["shares"]
        }
        assert shares[test_user.id] == "60.00"
        assert shares[second_user.id] == "30.00"


class TestValidationErrors:
    def test_percentages_not_summing_to_100_returns_400(
        self, client, test_user, second_user
    ):
        res = client.post(
            "/api/split/expenses/",
            data={
                "description": "Cena",
                "amount": "100.00",
                "date": "2026-07-01",
                "split_method": "percentage",
                "participants": [
                    {"user_id": test_user.id, "is_payer": True, "raw_input": "60"},
                    {"user_id": second_user.id, "raw_input": "30"},
                ],
            },
            content_type="application/json",
        )
        assert res.status_code == 400
        assert not SplitExpense.objects.filter(description="Cena").exists()

    def test_exact_amounts_not_summing_to_total_returns_400(
        self, client, test_user, second_user
    ):
        res = client.post(
            "/api/split/expenses/",
            data={
                "description": "Cena",
                "amount": "100.00",
                "date": "2026-07-01",
                "split_method": "exact",
                "participants": [
                    {"user_id": test_user.id, "is_payer": True, "raw_input": "40.00"},
                    {"user_id": second_user.id, "raw_input": "40.00"},
                ],
            },
            content_type="application/json",
        )
        assert res.status_code == 400
        assert not SplitExpense.objects.filter(description="Cena").exists()

    def test_zero_payers_returns_400(self, client, test_user, second_user):
        res = client.post(
            "/api/split/expenses/",
            data={
                "description": "Cena",
                "amount": "40.00",
                "date": "2026-07-01",
                "split_method": "equal",
                "participants": [
                    {"user_id": test_user.id},
                    {"user_id": second_user.id},
                ],
            },
            content_type="application/json",
        )
        assert res.status_code == 400

    def test_two_payers_returns_400(self, client, test_user, second_user):
        res = client.post(
            "/api/split/expenses/",
            data={
                "description": "Cena",
                "amount": "40.00",
                "date": "2026-07-01",
                "split_method": "equal",
                "participants": [
                    {"user_id": test_user.id, "is_payer": True},
                    {"user_id": second_user.id, "is_payer": True},
                ],
            },
            content_type="application/json",
        )
        assert res.status_code == 400

    def test_non_positive_amount_returns_400(self, client, test_user, second_user):
        res = client.post(
            "/api/split/expenses/",
            data={
                "description": "Cena",
                "amount": "0.00",
                "date": "2026-07-01",
                "split_method": "equal",
                "participants": [
                    {"user_id": test_user.id, "is_payer": True},
                    {"user_id": second_user.id},
                ],
            },
            content_type="application/json",
        )
        assert res.status_code == 400

    def test_participant_not_in_group_returns_400(
        self, client, split_group_with_two_users, test_user, third_user
    ):
        group, _owner_p, _member_p = split_group_with_two_users
        res = client.post(
            "/api/split/expenses/",
            data={
                "group": group.id,
                "description": "Cena",
                "amount": "40.00",
                "date": "2026-07-01",
                "split_method": "equal",
                "participants": [
                    {"user_id": test_user.id, "is_payer": True},
                    {"user_id": third_user.id},
                ],
            },
            content_type="application/json",
        )
        assert res.status_code == 400

    def test_group_not_accessible_returns_400(self, client, test_user, second_user):
        foreign_group = SplitGroup.objects.create(
            name="Not mine", created_by=second_user
        )
        SplitParticipant.objects.create(
            group=foreign_group, user=second_user, added_by=second_user
        )

        res = client.post(
            "/api/split/expenses/",
            data={
                "group": foreign_group.id,
                "description": "Cena",
                "amount": "40.00",
                "date": "2026-07-01",
                "split_method": "equal",
                "participants": [{"user_id": test_user.id, "is_payer": True}],
            },
            content_type="application/json",
        )
        assert res.status_code == 400

    def test_category_belonging_to_another_user_returns_400(
        self, client, test_user, second_user
    ):
        foreign_category = Category.objects.create(
            name="Not mine", category_type=Category.EXPENSE, owner=second_user
        )
        res = client.post(
            "/api/split/expenses/",
            data={
                "description": "Cena",
                "amount": "40.00",
                "date": "2026-07-01",
                "split_method": "equal",
                "category": foreign_category.id,
                "participants": [
                    {"user_id": test_user.id, "is_payer": True},
                    {"user_id": second_user.id},
                ],
            },
            content_type="application/json",
        )
        assert res.status_code == 400

    def test_linked_asset_belonging_to_another_user_returns_400(
        self, client, test_user, second_user
    ):
        inv_type = InvestmentType.objects.create(
            name="Bank",
            is_bank_account=True,
            supports_ticker=False,
            owner=second_user,
        )
        foreign_account = Asset.objects.create(
            name="Not mine",
            tracking_type=Asset.MANUAL,
            investment_type=inv_type,
            owner=second_user,
        )
        res = client.post(
            "/api/split/expenses/",
            data={
                "description": "Cena",
                "amount": "40.00",
                "date": "2026-07-01",
                "split_method": "equal",
                "linked_asset": foreign_account.id,
                "participants": [
                    {"user_id": test_user.id, "is_payer": True},
                    {"user_id": second_user.id},
                ],
            },
            content_type="application/json",
        )
        assert res.status_code == 400

    def test_category_rejected_when_request_user_is_not_the_payer(
        self, client, test_user, second_user, expense_cat
    ):
        """`request.user` sceglie una PROPRIA categoria ma designa
        `second_user` come pagatore: bloccato, perché la categoria va sempre
        associata al pagatore effettivo (piano sez. 1.5) e mostrarla nel
        CashFlow di `second_user` sarebbe una fuga di dati cross-utente."""
        res = client.post(
            "/api/split/expenses/",
            data={
                "description": "Cena",
                "amount": "40.00",
                "date": "2026-07-01",
                "split_method": "equal",
                "category": expense_cat.id,
                "participants": [
                    {"user_id": second_user.id, "is_payer": True},
                    {"user_id": test_user.id},
                ],
            },
            content_type="application/json",
        )
        assert res.status_code == 400

    def test_raw_input_required_for_non_equal_method_returns_400(
        self, client, test_user, second_user
    ):
        res = client.post(
            "/api/split/expenses/",
            data={
                "description": "Cena",
                "amount": "40.00",
                "date": "2026-07-01",
                "split_method": "exact",
                "participants": [
                    {"user_id": test_user.id, "is_payer": True, "raw_input": "40.00"},
                    {"user_id": second_user.id},
                ],
            },
            content_type="application/json",
        )
        assert res.status_code == 400


class TestUpdate:
    def test_patch_rewrites_shares(self, client, test_user, second_user, third_user):
        group = SplitGroup.objects.create(name="Casa", created_by=test_user)
        SplitParticipant.objects.create(group=group, user=test_user, added_by=test_user)
        SplitParticipant.objects.create(
            group=group, user=second_user, added_by=test_user
        )
        SplitParticipant.objects.create(
            group=group, user=third_user, added_by=test_user
        )
        create_res = client.post(
            "/api/split/expenses/",
            data={
                "group": group.id,
                "description": "Spesa",
                "amount": "40.00",
                "date": "2026-07-01",
                "split_method": "equal",
                "participants": [
                    {"user_id": test_user.id, "is_payer": True},
                    {"user_id": second_user.id},
                ],
            },
            content_type="application/json",
        )
        expense_id = create_res.json()["id"]

        res = client.patch(
            f"/api/split/expenses/{expense_id}/",
            data={
                "amount": "60.00",
                "participants": [
                    {"user_id": test_user.id, "is_payer": True},
                    {"user_id": second_user.id},
                    {"user_id": third_user.id},
                ],
            },
            content_type="application/json",
        )

        assert res.status_code == 200, res.content
        shares = {
            s["participant_user_id"]: s["share_amount"] for s in res.json()["shares"]
        }
        assert shares == {
            test_user.id: "20.00",
            second_user.id: "20.00",
            third_user.id: "20.00",
        }

    def test_patch_amount_without_participants_is_rejected(
        self, client, test_user, second_user, split_contact_linked
    ):
        """Cambiare l'importo senza rispecificare i partecipanti lascerebbe
        le shares sballate (somma ancora pari al vecchio importo): bloccato
        esplicitamente invece di lasciare uno stato incoerente in silenzio."""
        create_res = client.post(
            "/api/split/expenses/",
            data={
                "description": "Taxi",
                "amount": "40.00",
                "date": "2026-07-01",
                "split_method": "equal",
                "participants": [
                    {"user_id": test_user.id, "is_payer": True},
                    {"user_id": second_user.id},
                ],
            },
            content_type="application/json",
        )
        expense_id = create_res.json()["id"]

        res = client.patch(
            f"/api/split/expenses/{expense_id}/",
            data={"amount": "60.00"},
            content_type="application/json",
        )

        assert res.status_code == 400
        expense = SplitExpense.objects.get(id=expense_id)
        assert expense.amount == Decimal("40.00")
        assert sum(s.share_amount for s in expense.shares.all()) == Decimal("40.00")

    def test_patch_unrelated_field_without_participants_succeeds(
        self, client, test_user, second_user, split_contact_linked
    ):
        create_res = client.post(
            "/api/split/expenses/",
            data={
                "description": "Taxi",
                "amount": "40.00",
                "date": "2026-07-01",
                "split_method": "equal",
                "participants": [
                    {"user_id": test_user.id, "is_payer": True},
                    {"user_id": second_user.id},
                ],
            },
            content_type="application/json",
        )
        expense_id = create_res.json()["id"]

        res = client.patch(
            f"/api/split/expenses/{expense_id}/",
            data={"description": "Taxi aeroporto"},
            content_type="application/json",
        )

        assert res.status_code == 200, res.content
        assert res.json()["description"] == "Taxi aeroporto"
        expense = SplitExpense.objects.get(id=expense_id)
        assert sum(s.share_amount for s in expense.shares.all()) == Decimal("40.00")


class TestVisibilityAndAccess:
    def test_adhoc_participant_can_see_expense_they_did_not_create(
        self, client, second_client, test_user, second_user, split_contact_linked
    ):
        create_res = client.post(
            "/api/split/expenses/",
            data={
                "description": "Taxi",
                "amount": "40.00",
                "date": "2026-07-01",
                "split_method": "equal",
                "participants": [
                    {"user_id": test_user.id, "is_payer": True},
                    {"user_id": second_user.id},
                ],
            },
            content_type="application/json",
        )
        expense_id = create_res.json()["id"]

        res = second_client.get(f"/api/split/expenses/{expense_id}/")
        assert res.status_code == 200

    def test_uninvolved_user_cannot_see_expense(
        self, client, test_user, second_user, third_client, split_contact_linked
    ):
        create_res = client.post(
            "/api/split/expenses/",
            data={
                "description": "Taxi",
                "amount": "40.00",
                "date": "2026-07-01",
                "split_method": "equal",
                "participants": [
                    {"user_id": test_user.id, "is_payer": True},
                    {"user_id": second_user.id},
                ],
            },
            content_type="application/json",
        )
        expense_id = create_res.json()["id"]

        res = third_client.get(f"/api/split/expenses/{expense_id}/")
        assert res.status_code == 404

        res_list = third_client.get("/api/split/expenses/")
        ids = [row["id"] for row in res_list.json()["results"]]
        assert expense_id not in ids

    def test_delete_expense_removes_it_and_its_shares(
        self, client, test_user, second_user, split_contact_linked
    ):
        from splitting.models import SplitExpenseShare

        create_res = client.post(
            "/api/split/expenses/",
            data={
                "description": "Taxi",
                "amount": "40.00",
                "date": "2026-07-01",
                "split_method": "equal",
                "participants": [
                    {"user_id": test_user.id, "is_payer": True},
                    {"user_id": second_user.id},
                ],
            },
            content_type="application/json",
        )
        expense_id = create_res.json()["id"]

        res = client.delete(f"/api/split/expenses/{expense_id}/")

        assert res.status_code == 204
        assert not SplitExpense.objects.filter(id=expense_id).exists()
        assert not SplitExpenseShare.objects.filter(expense_id=expense_id).exists()
