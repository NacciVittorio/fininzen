"""splitting/tests/test_split_allocations.py — Allocazione derivata
SplitSettlement↔SplitExpenseShare (piano Batch 3, modello A2).

Criterio principale: `rebuild_allocations_for_directed_pair` è un layer di
REPORTING DERIVATO, mai fonte di verità sul saldo netto (quella resta
`splitting/balances.py::compute_balances`, non toccato/duplicato qui).
Mirror di test_split_balances.py per stile: spese/shares/settlement creati
via ORM/apply_split_shares, funzioni chiamate direttamente — più qualche test
a livello API dove serve esercitare il trigger che vive nel serializer
(SplitSettlementSerializer.create → allocate_new_settlement).
"""

from decimal import Decimal

from django.core.management import call_command

from splitting.allocations import (
    allocate_new_settlement,
    rebuild_allocations_for_directed_pair,
)
from splitting.models import (
    SplitExpense,
    SplitParticipant,
    SplitSettlement,
    SplitSettlementAllocation,
)
from splitting.services import apply_split_shares, delete_split_expense


def _make_expense(
    group,
    amount,
    payload,
    created_by,
    *,
    date="2026-07-01",
    split_method=SplitExpense.EQUAL,
    linked_asset=None,
):
    expense = SplitExpense.objects.create(
        group=group,
        description="Spesa",
        amount=Decimal(amount),
        date=date,
        split_method=split_method,
        created_by=created_by,
        linked_asset=linked_asset,
    )
    apply_split_shares(expense, payload, split_method, added_by=created_by)
    return expense


def _make_settlement(*, group=None, payer, payee, amount, date, created_by):
    return SplitSettlement.objects.create(
        group=group,
        payer_user=payer,
        payee_user=payee,
        amount=Decimal(amount),
        date=date,
        created_by=created_by,
    )


def _equal_payload(payer, *others):
    return [{"user_id": payer.id, "is_payer": True}] + [
        {"user_id": other.id} for other in others
    ]


def _allocated(share):
    return sum((a.amount for a in share.allocations.all()), Decimal("0"))


def _allocated_for_settlement(settlement):
    return sum((a.amount for a in settlement.allocations.all()), Decimal("0"))


def _snapshot_allocations():
    return {
        (a.settlement_id, a.share_id, str(a.amount))
        for a in SplitSettlementAllocation.objects.all()
    }


# ── FIFO su più spese/settlement ────────────────────────────────────────


class TestFifoAllocationOrder:
    def test_settlement_consumes_shares_in_expense_date_order(
        self, split_group_with_two_users, test_user, second_user
    ):
        group, owner_p, member_p = split_group_with_two_users
        payload = _equal_payload(test_user, second_user)
        e1 = _make_expense(group, "10.00", payload, test_user, date="2026-07-01")
        e2 = _make_expense(group, "30.00", payload, test_user, date="2026-07-05")
        e3 = _make_expense(group, "10.00", payload, test_user, date="2026-07-10")
        # second_user deve: e1=5.00, e2=15.00, e3=5.00 — totale 25.00.
        settlement = _make_settlement(
            payer=second_user,
            payee=test_user,
            amount="20.00",
            date="2026-07-02",
            created_by=second_user,
        )

        rebuild_allocations_for_directed_pair(
            ("user", second_user.id), ("user", test_user.id)
        )

        share1 = e1.shares.get(participant__user=second_user)
        share2 = e2.shares.get(participant__user=second_user)
        share3 = e3.shares.get(participant__user=second_user)
        # FIFO per data spesa: e1 (5.00) saldata per intero, poi e2 fino ad
        # esaurire i 20.00 (15.00 dei restanti), e3 resta intatta.
        assert _allocated(share1) == Decimal("5.00")
        assert _allocated(share2) == Decimal("15.00")
        assert _allocated(share3) == Decimal("0.00")
        assert _allocated_for_settlement(settlement) == Decimal("20.00")

    def test_rebuild_is_idempotent_when_called_twice(
        self, split_group_with_two_users, test_user, second_user
    ):
        group, owner_p, member_p = split_group_with_two_users
        e1 = _make_expense(
            group, "20.00", _equal_payload(test_user, second_user), test_user
        )
        _make_settlement(
            payer=second_user,
            payee=test_user,
            amount="20.00",
            date="2026-07-02",
            created_by=second_user,
        )

        rebuild_allocations_for_directed_pair(
            ("user", second_user.id), ("user", test_user.id)
        )
        state_1 = _snapshot_allocations()

        rebuild_allocations_for_directed_pair(
            ("user", second_user.id), ("user", test_user.id)
        )
        state_2 = _snapshot_allocations()

        assert state_1 == state_2
        share = e1.shares.get(participant__user=second_user)
        # 2-way equal split di 20.00: second_user deve 10.00 (non l'intero
        # importo) — il settlement da 20.00 satura quella share e i restanti
        # 10.00 restano inutilizzati (nessun'altra share aperta).
        assert _allocated(share) == Decimal("10.00")


# ── Scope group-scoped + cross-gruppo sulla stessa coppia ──────────────────


class TestGroupScopedThenCrossGroupSamePair:
    def test_cross_group_settlement_never_double_allocates_a_group_scoped_share(
        self, split_group_with_two_users, test_user, second_user
    ):
        """Rischio più a rischio del piano: la passata cross-gruppo usa
        share_qs SENZA filtro di gruppo (per costruzione, deve poter
        raggiungere anche spese occasionali) — deve quindi rileggere dal DB
        il residuo aperto (già azzerato dalla passata group-scoped) invece
        di trattare la share come ancora libera."""
        group, owner_p, member_p = split_group_with_two_users
        payload = _equal_payload(test_user, second_user)
        e1 = _make_expense(group, "20.00", payload, test_user, date="2026-07-01")
        e2 = _make_expense(group, "15.00", payload, test_user, date="2026-07-05")
        # second_user deve: e1=10.00, e2=7.50.
        group_settlement = _make_settlement(
            group=group,
            payer=second_user,
            payee=test_user,
            amount="10.00",
            date="2026-07-02",
            created_by=second_user,
        )
        cross_settlement = _make_settlement(
            group=None,
            payer=second_user,
            payee=test_user,
            amount="7.50",
            date="2026-07-06",
            created_by=second_user,
        )

        rebuild_allocations_for_directed_pair(
            ("user", second_user.id), ("user", test_user.id)
        )

        share1 = e1.shares.get(participant__user=second_user)
        share2 = e2.shares.get(participant__user=second_user)
        # e1 saldata dal settlement group-scoped (passo 1), e2 dal
        # cross-gruppo (passo 2) — mai la stessa share da entrambi.
        assert _allocated(share1) == Decimal("10.00")
        assert _allocated(share2) == Decimal("7.50")
        assert SplitSettlementAllocation.objects.filter(share=share1).count() == 1
        assert SplitSettlementAllocation.objects.filter(share=share2).count() == 1
        assert _allocated_for_settlement(group_settlement) == Decimal("10.00")
        assert _allocated_for_settlement(cross_settlement) == Decimal("7.50")


# ── Edit spesa già parzialmente saldata, cambio partecipanti ───────────────


class TestExpenseEditReallocatesRemainingShares:
    def test_editing_participants_reallocates_settlement_on_remaining_shares(
        self, split_group_with_two_users, test_user, second_user, third_user
    ):
        group, owner_p, member_p = split_group_with_two_users
        SplitParticipant.objects.create(
            group=group, user=third_user, added_by=test_user
        )
        payload = _equal_payload(test_user, second_user)
        expense_a = _make_expense(group, "40.00", payload, test_user, date="2026-07-01")
        expense_b = _make_expense(group, "30.00", payload, test_user, date="2026-07-05")

        settlement = _make_settlement(
            payer=second_user,
            payee=test_user,
            amount="20.00",
            date="2026-07-02",
            created_by=second_user,
        )
        rebuild_allocations_for_directed_pair(
            ("user", second_user.id), ("user", test_user.id)
        )
        share_a_before = expense_a.shares.get(participant__user=second_user)
        assert _allocated(share_a_before) == Decimal("20.00")

        # Un edit reale passa da SplitExpenseSerializer.update(), che salva
        # `amount` PRIMA di richiamare apply_split_shares (vedi
        # serializers.py) — replica qui lo stesso ordine.
        expense_a.amount = Decimal("30.00")
        expense_a.save(update_fields=["amount"])

        # apply_split_shares richiama internamente rebuild per l'unione
        # delle coppie vecchie/nuove — nessuna chiamata esplicita qui.
        apply_split_shares(
            expense_a,
            [
                {"user_id": test_user.id, "is_payer": True},
                {"user_id": second_user.id},
                {"user_id": third_user.id},
            ],
            SplitExpense.EQUAL,
            added_by=test_user,
        )

        share_a_second = expense_a.shares.get(participant__user=second_user)
        share_a_third = expense_a.shares.get(participant__user=third_user)
        share_b_second = expense_b.shares.get(participant__user=second_user)

        assert share_a_second.share_amount == Decimal("10.00")
        assert _allocated(share_a_second) == Decimal("10.00")  # riallocata per intero

        assert share_b_second.share_amount == Decimal("15.00")
        # I 20.00 del settlement: 10.00 restano su expense_a (nuovo importo),
        # i restanti 10.00 fluiscono su expense_b via FIFO.
        assert _allocated(share_b_second) == Decimal("10.00")

        assert share_a_third.share_amount == Decimal("10.00")
        assert _allocated(share_a_third) == Decimal(
            "0.00"
        )  # nessun settlement con third_user

        assert _allocated_for_settlement(settlement) == Decimal("20.00")


# ── Cancellazione spesa parzialmente saldata ────────────────────────────────


class TestExpenseDeletionRebuildsOtherOpenExpenses:
    def test_deleting_partially_settled_expense_frees_settlement_for_other_expenses(
        self, split_group_with_two_users, test_user, second_user
    ):
        group, owner_p, member_p = split_group_with_two_users
        payload = _equal_payload(test_user, second_user)
        # 2-way equal: second_user deve la metà dell'importo di ogni spesa.
        expense_a = _make_expense(group, "20.00", payload, test_user, date="2026-07-01")
        expense_b = _make_expense(group, "16.00", payload, test_user, date="2026-07-05")
        settlement = _make_settlement(
            payer=second_user,
            payee=test_user,
            amount="10.00",  # esattamente la quota di expense_a (10.00)
            date="2026-07-02",
            created_by=second_user,
        )
        rebuild_allocations_for_directed_pair(
            ("user", second_user.id), ("user", test_user.id)
        )
        share_a = expense_a.shares.get(participant__user=second_user)
        share_b = expense_b.shares.get(participant__user=second_user)
        assert _allocated(share_a) == Decimal("10.00")
        assert _allocated(share_b) == Decimal("0.00")

        delete_split_expense(expense_a)

        assert not SplitExpense.objects.filter(pk=expense_a.pk).exists()
        share_b.refresh_from_db()
        # expense_a (e la sua allocazione) sono spariti: i 10.00 del
        # settlement vengono riallocati da zero, ora trovano solo expense_b
        # (8.00 di quota) ancora aperta — 2.00 restano inutilizzati (nessuna
        # share aperta residua per questa coppia).
        assert _allocated(share_b) == Decimal("8.00")
        assert _allocated_for_settlement(settlement) == Decimal("8.00")


# ── Cancellazione settlement: CASCADE, nessuna azione esplicita ────────────


class TestSettlementDeletionCascadeOnlyOwnAllocations:
    def test_deleting_one_settlement_leaves_other_allocations_untouched(
        self, split_group_with_two_users, test_user, second_user
    ):
        group, owner_p, member_p = split_group_with_two_users
        expense = _make_expense(
            group, "20.00", _equal_payload(test_user, second_user), test_user
        )
        settlement_1 = _make_settlement(
            payer=second_user,
            payee=test_user,
            amount="5.00",
            date="2026-07-02",
            created_by=second_user,
        )
        settlement_2 = _make_settlement(
            payer=second_user,
            payee=test_user,
            amount="5.00",
            date="2026-07-03",
            created_by=second_user,
        )
        rebuild_allocations_for_directed_pair(
            ("user", second_user.id), ("user", test_user.id)
        )
        share = expense.shares.get(participant__user=second_user)
        assert _allocated(share) == Decimal("10.00")

        settlement_1_id = settlement_1.id
        settlement_1.delete()

        assert not SplitSettlementAllocation.objects.filter(
            settlement_id=settlement_1_id
        ).exists()
        assert SplitSettlementAllocation.objects.filter(
            settlement=settlement_2
        ).exists()
        share.refresh_from_db()
        assert _allocated(share) == Decimal("5.00")


# ── Backfill: idempotenza ───────────────────────────────────────────────


class TestBackfillIdempotency:
    def test_apply_twice_yields_identical_allocation_state(
        self, split_group_with_two_users, test_user, second_user
    ):
        group, owner_p, member_p = split_group_with_two_users
        payload = _equal_payload(test_user, second_user)
        _make_expense(group, "20.00", payload, test_user, date="2026-07-01")
        _make_expense(group, "15.00", payload, test_user, date="2026-07-05")
        # Settlement creato via ORM diretto — non passa dal serializer, non
        # ha ancora nessuna allocazione: esattamente lo scenario che il
        # backfill deve coprire (dati storici pre-modello A2).
        _make_settlement(
            payer=second_user,
            payee=test_user,
            amount="20.00",
            date="2026-07-02",
            created_by=second_user,
        )
        assert SplitSettlementAllocation.objects.count() == 0

        call_command("backfill_split_allocations", "--apply")
        state_1 = _snapshot_allocations()
        assert state_1

        call_command("backfill_split_allocations", "--apply")
        state_2 = _snapshot_allocations()

        assert state_1 == state_2

    def test_dry_run_makes_no_changes(
        self, split_group_with_two_users, test_user, second_user
    ):
        group, owner_p, member_p = split_group_with_two_users
        _make_expense(group, "20.00", _equal_payload(test_user, second_user), test_user)
        _make_settlement(
            payer=second_user,
            payee=test_user,
            amount="20.00",
            date="2026-07-02",
            created_by=second_user,
        )

        call_command("backfill_split_allocations")  # niente --apply

        assert SplitSettlementAllocation.objects.count() == 0


# ── allocate_new_settlement: passo incrementale alla creazione ─────────────


class TestAllocateNewSettlementIncrementalStep:
    def test_direct_call_allocates_against_currently_open_shares(
        self, split_group_with_two_users, test_user, second_user
    ):
        group, owner_p, member_p = split_group_with_two_users
        expense = _make_expense(
            group, "20.00", _equal_payload(test_user, second_user), test_user
        )
        settlement = _make_settlement(
            payer=second_user,
            payee=test_user,
            amount="10.00",
            date="2026-07-02",
            created_by=second_user,
        )

        allocate_new_settlement(settlement)

        share = expense.shares.get(participant__user=second_user)
        assert _allocated(share) == Decimal("10.00")


# ── settlement_progress via API (trigger reale nel serializer) ─────────────


class TestSettlementProgressField:
    def test_settlement_progress_reflects_allocation_state(
        self,
        client,
        split_group_with_two_users,
        test_user,
        second_user,
        split_contact_linked,
    ):
        group, owner_p, member_p = split_group_with_two_users
        expense = _make_expense(
            group, "40.00", _equal_payload(test_user, second_user), test_user
        )

        res = client.get(f"/api/split/expenses/{expense.id}/")
        assert res.status_code == 200
        assert res.json()["settlement_progress"] == {
            "total_owed": "20.00",
            "total_settled": "0.00",
            "percentage": 0,
        }

        res = client.post(
            "/api/split/settlements/",
            data={
                "payer_user": second_user.id,
                "payee_user": test_user.id,
                "amount": "20.00",
                "date": "2026-07-02",
            },
            content_type="application/json",
        )
        assert res.status_code == 201, res.content

        res = client.get(f"/api/split/expenses/{expense.id}/")
        assert res.json()["settlement_progress"] == {
            "total_owed": "20.00",
            "total_settled": "20.00",
            "percentage": 100,
        }

    def test_solo_participant_who_is_also_payer_is_fully_settled_by_definition(
        self, client, test_user
    ):
        """Nessuna quota altrui su questa spesa (unico partecipante = il
        pagatore): total_owed=0, percentage=100 per convenzione (nulla da
        saldare), non un ZeroDivisionError."""
        expense = SplitExpense.objects.create(
            group=None,
            description="Solo io",
            amount=Decimal("20.00"),
            date="2026-07-01",
            split_method=SplitExpense.EQUAL,
            created_by=test_user,
        )
        apply_split_shares(
            expense,
            [{"user_id": test_user.id, "is_payer": True}],
            SplitExpense.EQUAL,
            added_by=test_user,
        )

        res = client.get(f"/api/split/expenses/{expense.id}/")
        assert res.status_code == 200
        assert res.json()["settlement_progress"] == {
            "total_owed": "0.00",
            "total_settled": "0.00",
            "percentage": 100,
        }


# ── A2 + saldo conto reale nello stesso scenario ────────────────────────


class TestAllocationTogetherWithRealAccountBalance:
    def test_allocation_progress_and_asset_balance_move_together(
        self,
        client,
        split_group_with_two_users,
        test_user,
        second_user,
        account,
        split_contact_linked,
    ):
        """Copre insieme i due lati della feature Split, in un solo
        scenario: (a) il saldo REALE del conto collegato (shadow-tx, piano
        sez. 4) e (b) il layer di reporting derivato A2 — oggi
        test_split_shadow_transactions.py copre solo (a)."""
        group, owner_p, member_p = split_group_with_two_users
        expense = _make_expense(
            group,
            "90.00",
            _equal_payload(test_user, second_user),
            test_user,
            linked_asset=account,
        )
        account.refresh_from_db()
        assert account.current_value == Decimal("910.00")  # 1000.00 - 90.00 (CASH_OUT)

        res = client.post(
            "/api/split/settlements/",
            data={
                "payer_user": second_user.id,
                "payee_user": test_user.id,
                "amount": "45.00",
                "date": "2026-07-02",
                "linked_asset": account.id,
            },
            content_type="application/json",
        )
        assert res.status_code == 201, res.content

        # (a) saldo reale: test_user è il payee, il pagamento ricevuto è un
        # CASH_IN sul SUO conto collegato.
        account.refresh_from_db()
        assert account.current_value == Decimal("955.00")  # 910.00 + 45.00

        # (b) reporting derivato: la quota di second_user (45.00, l'intera
        # quota su una spesa 2-way di 90.00) risulta saldata al 100%.
        share = expense.shares.get(participant__user=second_user)
        assert share.share_amount == Decimal("45.00")
        assert _allocated(share) == Decimal("45.00")

        res = client.get(f"/api/split/expenses/{expense.id}/")
        assert res.json()["settlement_progress"] == {
            "total_owed": "45.00",
            "total_settled": "45.00",
            "percentage": 100,
        }
