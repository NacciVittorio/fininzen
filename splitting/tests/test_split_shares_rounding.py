"""splitting/tests/test_split_shares_rounding.py — Unit test puri sulle 4
funzioni di calcolo quote (`compute_equal_shares`/`compute_exact_shares`/
`compute_percentage_shares`/`compute_weighted_shares`) e su
`apply_split_shares` (piano sez. 3.1/8.1), senza client HTTP.

Copre in particolare l'arrotondamento ROUND_HALF_UP con ridistribuzione del
resto (`_distribute_remainder`) e le validazioni di dominio (percentuali che
non sommano a 100, importi esatti che non sommano al totale, pesi non
positivi, nessun partecipante).
"""

from decimal import Decimal

import pytest

from splitting.models import SplitExpense
from splitting.services import (
    SplitServiceError,
    _distribute_remainder,
    apply_split_shares,
    compute_equal_shares,
    compute_exact_shares,
    compute_percentage_shares,
    compute_weighted_shares,
)


# ── _distribute_remainder / compute_equal_shares ────────────────────────────


class TestDistributeRemainder:
    def test_100_over_3_puts_remainder_on_first_share(self):
        shares = compute_equal_shares(Decimal("100"), 3)
        assert sum(shares) == Decimal("100.00")
        assert shares == [Decimal("33.34"), Decimal("33.33"), Decimal("33.33")]

    def test_negative_remainder_is_subtracted(self):
        # 3 raw shares that round UP to 0.01 more than the total each →
        # negative diff_cents branch (step = -_CENT).
        shares = _distribute_remainder(
            Decimal("10.00"),
            [Decimal("3.336"), Decimal("3.336"), Decimal("3.336")],
        )
        assert sum(shares) == Decimal("10.00")

    def test_equal_split_exact_division_needs_no_redistribution(self):
        shares = compute_equal_shares(Decimal("90.00"), 3)
        assert shares == [Decimal("30.00"), Decimal("30.00"), Decimal("30.00")]

    def test_equal_shares_rejects_zero_participants(self):
        with pytest.raises(SplitServiceError):
            compute_equal_shares(Decimal("100"), 0)

    def test_distribute_remainder_rejects_empty_list(self):
        with pytest.raises(SplitServiceError):
            _distribute_remainder(Decimal("10"), [])

    def test_two_person_odd_cent_split(self):
        """1 centesimo dispari su 2 persone: 0.01/2 non è rappresentabile
        esattamente in centesimi, uno dei due riceve il centesimo extra."""
        shares = compute_equal_shares(Decimal("0.01"), 2)
        assert sum(shares) == Decimal("0.01")
        assert sorted(shares) == [Decimal("0.00"), Decimal("0.01")]


# ── compute_exact_shares ─────────────────────────────────────────────────


class TestComputeExactShares:
    def test_matches_total_exactly(self):
        shares = compute_exact_shares(
            Decimal("100"), [Decimal("40"), Decimal("35"), Decimal("25")]
        )
        assert shares == [Decimal("40.00"), Decimal("35.00"), Decimal("25.00")]

    def test_mismatch_raises(self):
        with pytest.raises(SplitServiceError):
            compute_exact_shares(Decimal("100"), [Decimal("40"), Decimal("40")])

    def test_rejects_empty(self):
        with pytest.raises(SplitServiceError):
            compute_exact_shares(Decimal("100"), [])


# ── compute_percentage_shares ────────────────────────────────────────────


class TestComputePercentageShares:
    def test_sums_to_total_with_remainder_redistributed(self):
        # 33.33% x3 = 99.99% ≠ 100 would fail; use a mix that sums to 100 but
        # produces a rounding remainder against the total (100/3-style).
        shares = compute_percentage_shares(
            Decimal("100"), [Decimal("33.34"), Decimal("33.33"), Decimal("33.33")]
        )
        assert sum(shares) == Decimal("100.00")

    def test_not_summing_to_100_raises(self):
        with pytest.raises(SplitServiceError):
            compute_percentage_shares(Decimal("100"), [Decimal("40"), Decimal("40")])

    def test_rejects_empty(self):
        with pytest.raises(SplitServiceError):
            compute_percentage_shares(Decimal("100"), [])


# ── compute_weighted_shares ──────────────────────────────────────────────


class TestComputeWeightedShares:
    def test_proportional_to_weights(self):
        shares = compute_weighted_shares(Decimal("90"), [Decimal("2"), Decimal("1")])
        assert shares == [Decimal("60.00"), Decimal("30.00")]

    def test_uneven_weights_rounding(self):
        # 100 split 1:1:1 → same remainder-distribution case as equal split.
        shares = compute_weighted_shares(
            Decimal("100"), [Decimal("1"), Decimal("1"), Decimal("1")]
        )
        assert sum(shares) == Decimal("100.00")

    def test_zero_total_weight_raises(self):
        with pytest.raises(SplitServiceError):
            compute_weighted_shares(Decimal("100"), [Decimal("0"), Decimal("0")])

    def test_negative_total_weight_raises(self):
        with pytest.raises(SplitServiceError):
            compute_weighted_shares(Decimal("100"), [Decimal("-1"), Decimal("-1")])

    def test_rejects_empty(self):
        with pytest.raises(SplitServiceError):
            compute_weighted_shares(Decimal("100"), [])


# ── apply_split_shares: end-to-end sui 4 metodi (con partecipanti reali) ──


def _make_expense(group, amount, split_method, created_by):
    return SplitExpense.objects.create(
        group=group,
        description="Cena di gruppo",
        amount=Decimal(amount),
        date="2026-07-01",
        split_method=split_method,
        created_by=created_by,
    )


class TestApplySplitSharesFourMethods:
    def test_equal_split_across_local_contact_and_registered_user(
        self, split_group_with_contact_and_user, test_user
    ):
        group, owner_p, member_p, contact_p = split_group_with_contact_and_user
        expense = _make_expense(group, "90.00", SplitExpense.EQUAL, test_user)
        payload = [
            {"user_id": test_user.id, "is_payer": True},
            {"user_id": member_p.user_id},
            {"contact_id": contact_p.contact_id},
        ]

        apply_split_shares(expense, payload, SplitExpense.EQUAL, added_by=test_user)

        shares = list(expense.shares.select_related("participant"))
        assert len(shares) == 3
        assert sum(s.share_amount for s in shares) == Decimal("90.00")
        assert all(s.share_amount == Decimal("30.00") for s in shares)
        payer_shares = [s for s in shares if s.is_payer]
        assert len(payer_shares) == 1
        assert payer_shares[0].participant.user_id == test_user.id

    def test_four_split_methods_shares_sum_to_total(
        self, split_group_with_contact_and_user, test_user
    ):
        group, owner_p, member_p, contact_p = split_group_with_contact_and_user
        cases = [
            (
                SplitExpense.EQUAL,
                [
                    {"user_id": test_user.id, "is_payer": True},
                    {"user_id": member_p.user_id},
                    {"contact_id": contact_p.contact_id},
                ],
            ),
            (
                SplitExpense.EXACT,
                [
                    {"user_id": test_user.id, "is_payer": True, "raw_input": "40.00"},
                    {"user_id": member_p.user_id, "raw_input": "30.00"},
                    {"contact_id": contact_p.contact_id, "raw_input": "20.00"},
                ],
            ),
            (
                SplitExpense.PERCENTAGE,
                [
                    {"user_id": test_user.id, "is_payer": True, "raw_input": "50"},
                    {"user_id": member_p.user_id, "raw_input": "25"},
                    {"contact_id": contact_p.contact_id, "raw_input": "25"},
                ],
            ),
            (
                SplitExpense.SHARES,
                [
                    {"user_id": test_user.id, "is_payer": True, "raw_input": "2"},
                    {"user_id": member_p.user_id, "raw_input": "1"},
                    {"contact_id": contact_p.contact_id, "raw_input": "1"},
                ],
            ),
        ]

        for method, payload in cases:
            expense = _make_expense(group, "90.00", method, test_user)
            apply_split_shares(expense, payload, method, added_by=test_user)
            shares = list(expense.shares.all())
            assert sum(s.share_amount for s in shares) == Decimal("90.00"), method
            assert len([s for s in shares if s.is_payer]) == 1

    def test_equal_split_rounding_100_over_3(
        self, split_group_with_contact_and_user, test_user
    ):
        """Caso canonico 100€/3: 33.33+33.33+33.33=99.99 → il resto (0.01) va
        al primo partecipante così sum(shares) == 100.00 esattamente."""
        group, owner_p, member_p, contact_p = split_group_with_contact_and_user
        expense = _make_expense(group, "100.00", SplitExpense.EQUAL, test_user)
        payload = [
            {"user_id": test_user.id, "is_payer": True},
            {"user_id": member_p.user_id},
            {"contact_id": contact_p.contact_id},
        ]

        apply_split_shares(expense, payload, SplitExpense.EQUAL, added_by=test_user)

        amounts = sorted(s.share_amount for s in expense.shares.all())
        assert sum(amounts) == Decimal("100.00")
        assert amounts == [Decimal("33.33"), Decimal("33.33"), Decimal("33.34")]

    def test_percentages_not_summing_to_100_raises(
        self, split_group_with_two_users, test_user, second_user
    ):
        group, owner_p, member_p = split_group_with_two_users
        expense = _make_expense(group, "100.00", SplitExpense.PERCENTAGE, test_user)
        payload = [
            {"user_id": test_user.id, "is_payer": True, "raw_input": "60"},
            {"user_id": second_user.id, "raw_input": "30"},
        ]

        with pytest.raises(SplitServiceError):
            apply_split_shares(
                expense, payload, SplitExpense.PERCENTAGE, added_by=test_user
            )

    def test_exact_not_summing_to_total_raises(
        self, split_group_with_two_users, test_user, second_user
    ):
        group, owner_p, member_p = split_group_with_two_users
        expense = _make_expense(group, "100.00", SplitExpense.EXACT, test_user)
        payload = [
            {"user_id": test_user.id, "is_payer": True, "raw_input": "40.00"},
            {"user_id": second_user.id, "raw_input": "40.00"},
        ]

        with pytest.raises(SplitServiceError):
            apply_split_shares(expense, payload, SplitExpense.EXACT, added_by=test_user)

    def test_zero_payers_raises_single_payer_required(
        self, split_group_with_two_users, test_user, second_user
    ):
        group, owner_p, member_p = split_group_with_two_users
        expense = _make_expense(group, "50.00", SplitExpense.EQUAL, test_user)
        payload = [{"user_id": test_user.id}, {"user_id": second_user.id}]

        with pytest.raises(SplitServiceError):
            apply_split_shares(expense, payload, SplitExpense.EQUAL, added_by=test_user)

    def test_two_payers_raises_single_payer_required(
        self, split_group_with_two_users, test_user, second_user
    ):
        group, owner_p, member_p = split_group_with_two_users
        expense = _make_expense(group, "50.00", SplitExpense.EQUAL, test_user)
        payload = [
            {"user_id": test_user.id, "is_payer": True},
            {"user_id": second_user.id, "is_payer": True},
        ]

        with pytest.raises(SplitServiceError):
            apply_split_shares(expense, payload, SplitExpense.EQUAL, added_by=test_user)

    def test_duplicate_participant_raises(self, split_group_with_two_users, test_user):
        group, owner_p, member_p = split_group_with_two_users
        expense = _make_expense(group, "50.00", SplitExpense.EQUAL, test_user)
        payload = [
            {"user_id": test_user.id, "is_payer": True},
            {"user_id": test_user.id},
        ]

        with pytest.raises(SplitServiceError):
            apply_split_shares(expense, payload, SplitExpense.EQUAL, added_by=test_user)

    def test_participant_not_in_group_raises(
        self, split_group_with_two_users, test_user, third_user
    ):
        """Un utente NON membro del gruppo non può essere aggiunto
        implicitamente come partecipante di una spesa di gruppo — la
        membership si gestisce solo via /groups/{id}/members/."""
        group, owner_p, member_p = split_group_with_two_users
        expense = _make_expense(group, "50.00", SplitExpense.EQUAL, test_user)
        payload = [
            {"user_id": test_user.id, "is_payer": True},
            {"user_id": third_user.id},
        ]

        with pytest.raises(SplitServiceError):
            apply_split_shares(expense, payload, SplitExpense.EQUAL, added_by=test_user)

    def test_raw_input_required_for_non_equal_methods(
        self, split_group_with_two_users, test_user, second_user
    ):
        group, owner_p, member_p = split_group_with_two_users
        expense = _make_expense(group, "50.00", SplitExpense.EXACT, test_user)
        payload = [
            {"user_id": test_user.id, "is_payer": True, "raw_input": "50.00"},
            {"user_id": second_user.id},  # raw_input mancante
        ]

        with pytest.raises(SplitServiceError):
            apply_split_shares(expense, payload, SplitExpense.EXACT, added_by=test_user)

    def test_reapplying_shares_replaces_old_rows(
        self, split_group_with_two_users, test_user, second_user
    ):
        """Riscrittura shares (delete + bulk_create): una seconda chiamata
        con partecipanti diversi sostituisce interamente le righe precedenti,
        non le somma/duplica."""
        group, owner_p, member_p = split_group_with_two_users
        expense = _make_expense(group, "40.00", SplitExpense.EQUAL, test_user)
        apply_split_shares(
            expense,
            [
                {"user_id": test_user.id, "is_payer": True},
                {"user_id": second_user.id},
            ],
            SplitExpense.EQUAL,
            added_by=test_user,
        )
        assert expense.shares.count() == 2

        apply_split_shares(
            expense,
            [{"user_id": test_user.id, "is_payer": True}],
            SplitExpense.EQUAL,
            added_by=test_user,
        )

        shares = list(expense.shares.all())
        assert len(shares) == 1
        assert shares[0].share_amount == Decimal("40.00")

    def test_standalone_expense_creates_adhoc_participants(
        self, test_user, second_user, split_contact_linked
    ):
        """Per una spesa occasionale (group=None) i SplitParticipant ad-hoc
        vengono creati al volo, non richiedono un roster preesistente
        (ma richiedono comunque che second_user sia un partner collegato —
        fix di sicurezza fase 9 — da cui `split_contact_linked`)."""
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

        assert expense.adhoc_participants.count() == 2
        shares = {s.participant.user_id: s.share_amount for s in expense.shares.all()}
        assert shares[test_user.id] == Decimal("10.00")
        assert shares[second_user.id] == Decimal("10.00")
