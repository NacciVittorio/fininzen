"""splitting/tests/test_split_balances.py — Unit test puri su
`compute_balances`/`simplify_debts` (piano sez. 3.2/3.3/8.1), senza client
HTTP: costruiscono spese/shares/settlement via ORM e chiamano direttamente le
funzioni di `splitting/balances.py`.

I test a livello di endpoint HTTP (`/groups/{id}/balances/`, `/simplify/`,
`/balances/overview/`) vivono in `test_groups_api.py` e
`test_split_balances_overview_api.py`.
"""

from decimal import Decimal

from splitting.balances import compute_balances, simplify_debts
from splitting.models import (
    SplitExpense,
    SplitExpenseShare,
    SplitSettlement,
)
from splitting.services import apply_split_shares


def _make_expense(group, amount, payload, created_by, *, split_method="equal"):
    expense = SplitExpense.objects.create(
        group=group,
        description="Spesa",
        amount=Decimal(amount),
        date="2026-07-10",
        split_method=split_method,
        created_by=created_by,
    )
    apply_split_shares(expense, payload, split_method, added_by=created_by)
    return expense


# ── compute_balances: spese di gruppo, ibrido utente/contatto ──────────────


class TestComputeBalances:
    def test_three_way_equal_split_balances(
        self, split_group_with_contact_and_user, test_user, second_user
    ):
        group, owner_p, member_p, contact_p = split_group_with_contact_and_user
        expense = _make_expense(
            group,
            "90.00",
            [
                {"user_id": test_user.id, "is_payer": True},
                {"user_id": member_p.user_id},
                {"contact_id": contact_p.contact_id},
            ],
            test_user,
        )

        share_qs = SplitExpenseShare.objects.filter(expense=expense)
        balances = compute_balances(share_qs, None)

        assert balances[("user", test_user.id)] == Decimal("60.00")
        assert balances[("user", second_user.id)] == Decimal("-30.00")
        assert balances[("contact", contact_p.contact_id)] == Decimal("-30.00")
        assert sum(balances.values()) == Decimal("0.00")

    def test_settlement_qs_none_and_empty_are_equivalent(
        self, split_group_with_contact_and_user, test_user
    ):
        group, owner_p, member_p, contact_p = split_group_with_contact_and_user
        expense = _make_expense(
            group,
            "90.00",
            [
                {"user_id": test_user.id, "is_payer": True},
                {"user_id": member_p.user_id},
                {"contact_id": contact_p.contact_id},
            ],
            test_user,
        )
        share_qs = SplitExpenseShare.objects.filter(expense=expense)

        assert compute_balances(share_qs, None) == compute_balances(share_qs, [])

    def test_zero_net_balance_is_omitted_from_result(
        self, test_user, second_user, split_contact_linked
    ):
        """Un partecipante il cui saldo netto risulta esattamente zero (ha
        pagato e speso la stessa cifra) non compare affatto nel dict —
        `compute_balances` filtra `v != 0` (piano sez. 3.2).

        `split_contact_linked` stabilisce il collegamento reciproco
        richiesto (fix di sicurezza fase 9) per aggiungere second_user come
        partecipante ad-hoc a una spesa occasionale."""
        expense = SplitExpense.objects.create(
            group=None,
            description="Pareggio",
            amount=Decimal("20.00"),
            date="2026-07-11",
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
        SplitSettlement.objects.create(
            payer_user=second_user,
            payee_user=test_user,
            amount=Decimal("10.00"),
            date="2026-07-12",
            created_by=second_user,
        )

        share_qs = SplitExpenseShare.objects.filter(expense=expense)
        settlement_qs = SplitSettlement.objects.filter(
            payer_user=second_user, payee_user=test_user
        )
        balances = compute_balances(share_qs, settlement_qs)

        assert balances == {}

    def test_settlements_reduce_balances_towards_zero(
        self, split_group_with_two_users, test_user, second_user
    ):
        group, owner_p, member_p = split_group_with_two_users
        expense = _make_expense(
            group,
            "40.00",
            [
                {"user_id": test_user.id, "is_payer": True},
                {"user_id": second_user.id},
            ],
            test_user,
        )
        share_qs = SplitExpenseShare.objects.filter(expense=expense)
        balances_before = compute_balances(share_qs, SplitSettlement.objects.none())
        assert balances_before[("user", test_user.id)] == Decimal("20.00")
        assert balances_before[("user", second_user.id)] == Decimal("-20.00")

        SplitSettlement.objects.create(
            group=group,
            payer_user=second_user,
            payee_user=test_user,
            amount=Decimal("20.00"),
            date="2026-07-11",
            created_by=second_user,
        )

        balances_after = compute_balances(
            share_qs, SplitSettlement.objects.filter(group=group)
        )
        assert balances_after == {}

    def test_three_person_group_settled_by_two_matching_settlements(
        self, test_user, second_user, third_user
    ):
        """Gruppo a 3 persone: test_user anticipa 60€ condivisi in 3 →
        second/third gli devono 20€ ciascuno. Due settlement che pagano
        esattamente il debito residuo di ciascuno azzerano l'intero gruppo,
        non solo la coppia che li ha registrati."""
        from splitting.models import SplitGroup, SplitParticipant

        group = SplitGroup.objects.create(name="Weekend", created_by=test_user)
        SplitParticipant.objects.create(group=group, user=test_user, added_by=test_user)
        SplitParticipant.objects.create(
            group=group, user=second_user, added_by=test_user
        )
        SplitParticipant.objects.create(
            group=group, user=third_user, added_by=test_user
        )
        expense = _make_expense(
            group,
            "60.00",
            [
                {"user_id": test_user.id, "is_payer": True},
                {"user_id": second_user.id},
                {"user_id": third_user.id},
            ],
            test_user,
        )
        share_qs = SplitExpenseShare.objects.filter(expense=expense)
        balances_before = compute_balances(
            share_qs, SplitSettlement.objects.filter(group=group)
        )
        assert balances_before[("user", second_user.id)] == Decimal("-20.00")
        assert balances_before[("user", third_user.id)] == Decimal("-20.00")
        assert balances_before[("user", test_user.id)] == Decimal("40.00")

        SplitSettlement.objects.create(
            group=group,
            payer_user=second_user,
            payee_user=test_user,
            amount=Decimal("20.00"),
            date="2026-07-11",
            created_by=second_user,
        )
        SplitSettlement.objects.create(
            group=group,
            payer_user=third_user,
            payee_user=test_user,
            amount=Decimal("20.00"),
            date="2026-07-11",
            created_by=third_user,
        )

        balances_after = compute_balances(
            share_qs, SplitSettlement.objects.filter(group=group)
        )
        assert balances_after == {}


# ── simplify_debts: algoritmo greedy debtor/creditor ────────────────────────


class TestSimplifyDebtsAlgorithm:
    def test_simplify_reduces_transactions_and_zeroes_balances(self):
        balances = {
            ("user", 1): Decimal("50.00"),
            ("user", 2): Decimal("30.00"),
            ("user", 3): Decimal("-40.00"),
            ("user", 4): Decimal("-40.00"),
        }
        transactions = simplify_debts(balances)
        # n=4 identità con saldo non nullo → al massimo n-1 = 3 transazioni.
        assert len(transactions) <= len(balances) - 1

        residual = dict(balances)
        for tx in transactions:
            residual[tx["from"]] += tx["amount"]
            residual[tx["to"]] -= tx["amount"]
        assert all(v == Decimal("0.00") for v in residual.values())

    def test_simplify_empty_balances_returns_no_transactions(self):
        assert simplify_debts({}) == []

    def test_simplify_single_pair_returns_one_transaction(self):
        balances = {("user", 1): Decimal("15.00"), ("user", 2): Decimal("-15.00")}
        transactions = simplify_debts(balances)
        assert transactions == [
            {"from": ("user", 2), "to": ("user", 1), "amount": Decimal("15.00")}
        ]

    def test_three_way_cross_debt_simplifies_to_at_most_n_minus_1(
        self, split_group_with_two_users, test_user, second_user, third_user
    ):
        group, _p1, _p2 = split_group_with_two_users
        from splitting.models import SplitParticipant

        SplitParticipant.objects.create(
            group=group, user=third_user, added_by=test_user
        )
        # Spesa 1: test_user paga 60, condivisa in 3 → second/third devono 20.
        _make_expense(
            group,
            "60.00",
            [
                {"user_id": test_user.id, "is_payer": True},
                {"user_id": second_user.id},
                {"user_id": third_user.id},
            ],
            test_user,
        )
        # Spesa 2: second_user paga 30, condivisa in 3 → incrocia i debiti.
        _make_expense(
            group,
            "30.00",
            [
                {"user_id": second_user.id, "is_payer": True},
                {"user_id": test_user.id},
                {"user_id": third_user.id},
            ],
            second_user,
        )

        share_qs = SplitExpenseShare.objects.filter(expense__group=group)
        balances = compute_balances(
            share_qs, SplitSettlement.objects.filter(group=group)
        )
        assert sum(balances.values()) == Decimal("0.00")

        transactions = simplify_debts(balances)
        assert len(transactions) <= max(len(balances) - 1, 0)

        residual = dict(balances)
        for tx in transactions:
            residual[tx["from"]] += tx["amount"]
            residual[tx["to"]] -= tx["amount"]
        assert all(v == Decimal("0.00") for v in residual.values())
