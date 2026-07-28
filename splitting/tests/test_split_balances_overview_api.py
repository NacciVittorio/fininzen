"""splitting/tests/test_split_balances_overview_api.py — Endpoint
`/api/split/balances/overview/` (piano sez. 6): saldo complessivo per persona
dell'utente autenticato, cross-gruppo e incluse le spese occasionali
(standalone, group=None) — a differenza dei test in `test_split_balances.py`,
qui si passa sempre dal client HTTP.
"""

from decimal import Decimal

from splitting.models import SplitExpense, SplitGroup, SplitParticipant, SplitSettlement
from splitting.services import apply_split_shares


class TestBalancesOverviewEndpoint:
    def test_includes_standalone_and_group_expenses(
        self, client, test_user, second_user, split_contact_linked
    ):
        """Spesa occasionale (senza gruppo) tra test_user e second_user: deve
        comparire nell'overview cross-gruppo dell'utente autenticato.

        `split_contact_linked` stabilisce il collegamento reciproco
        richiesto (fix di sicurezza fase 9): un partecipante ad-hoc
        registrato deve essere un partner collegato, mirror del gate già
        imposto su /groups/{id}/members/."""
        expense = SplitExpense.objects.create(
            group=None,
            description="Taxi",
            amount=Decimal("20.00"),
            date="2026-07-02",
            split_method=SplitExpense.EQUAL,
            created_by=test_user,
        )
        payload = [
            {"user_id": test_user.id, "is_payer": True},
            {"user_id": second_user.id},
        ]
        apply_split_shares(expense, payload, SplitExpense.EQUAL, added_by=test_user)

        res = client.get("/api/split/balances/overview/")

        assert res.status_code == 200
        entries = {
            (e["user_id"], e["contact_id"]): Decimal(e["balance"]) for e in res.json()
        }
        assert entries[(test_user.id, None)] == Decimal("10.00")
        assert entries[(second_user.id, None)] == Decimal("-10.00")

    def test_aggregates_across_multiple_groups(
        self, client, test_user, second_user, third_user
    ):
        """Il saldo per identità aggrega più gruppi diversi: lo stesso
        `second_user` compare in due gruppi, l'overview somma entrambi."""
        group_a = SplitGroup.objects.create(name="A", created_by=test_user)
        SplitParticipant.objects.create(
            group=group_a, user=test_user, added_by=test_user
        )
        SplitParticipant.objects.create(
            group=group_a, user=second_user, added_by=test_user
        )
        group_b = SplitGroup.objects.create(name="B", created_by=test_user)
        SplitParticipant.objects.create(
            group=group_b, user=test_user, added_by=test_user
        )
        SplitParticipant.objects.create(
            group=group_b, user=second_user, added_by=test_user
        )

        for group, amount in ((group_a, "20.00"), (group_b, "40.00")):
            expense = SplitExpense.objects.create(
                group=group,
                description="Spesa",
                amount=Decimal(amount),
                date="2026-07-05",
                split_method=SplitExpense.EQUAL,
                created_by=test_user,
            )
            apply_split_shares(
                expense,
                [
                    {"user_id": test_user.id, "is_payer": True},
                    {"user_id": second_user.id},
                ],
                SplitExpense.EQUAL,
                added_by=test_user,
            )

        res = client.get("/api/split/balances/overview/")

        entries = {
            (e["user_id"], e["contact_id"]): Decimal(e["balance"]) for e in res.json()
        }
        # test_user è creditore di 10.00 (gruppo A) + 20.00 (gruppo B) = 30.00
        assert entries[(test_user.id, None)] == Decimal("30.00")
        assert entries[(second_user.id, None)] == Decimal("-30.00")
        assert third_user.id not in {uid for uid, _ in entries}

    def test_excludes_groups_user_is_not_part_of(
        self, client, test_user, second_user, third_user
    ):
        foreign_group = SplitGroup.objects.create(
            name="Not mine", created_by=second_user
        )
        SplitParticipant.objects.create(
            group=foreign_group, user=second_user, added_by=second_user
        )
        SplitParticipant.objects.create(
            group=foreign_group, user=third_user, added_by=second_user
        )
        expense = SplitExpense.objects.create(
            group=foreign_group,
            description="Not visible",
            amount=Decimal("100.00"),
            date="2026-07-05",
            split_method=SplitExpense.EQUAL,
            created_by=second_user,
        )
        apply_split_shares(
            expense,
            [
                {"user_id": second_user.id, "is_payer": True},
                {"user_id": third_user.id},
            ],
            SplitExpense.EQUAL,
            added_by=second_user,
        )

        res = client.get("/api/split/balances/overview/")

        assert res.status_code == 200
        assert res.json() == []

    def test_includes_settlements_not_tied_to_a_group(
        self, client, test_user, second_user
    ):
        """Un settlement senza alcuna spesa/debito pregresso a fronte:
        second_user (payer) ha versato 15.00 a test_user (payee) senza
        alcun obbligo preesistente — dal punto di vista dei saldi questo
        lascia il payer creditore (+15, "gli è dovuto indietro") e il payee
        debitore (-15, "deve restituire") esattamente come un pagamento
        anticipato senza spesa corrispondente."""
        SplitSettlement.objects.create(
            payer_user=second_user,
            payee_user=test_user,
            amount=Decimal("15.00"),
            date="2026-07-06",
            created_by=second_user,
        )

        res = client.get("/api/split/balances/overview/")

        entries = {
            (e["user_id"], e["contact_id"]): Decimal(e["balance"]) for e in res.json()
        }
        assert entries[(second_user.id, None)] == Decimal("15.00")
        assert entries[(test_user.id, None)] == Decimal("-15.00")
