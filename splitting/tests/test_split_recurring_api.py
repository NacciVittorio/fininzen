"""
splitting/tests/test_split_recurring_api.py — Test per le spese ricorrenti di
gruppo (piano sez. 1.7/3.4/6/8.1): SplitRecurringExpense +
SplitRecurringExpenseParticipant, generate_split_recurring_expenses
(idempotenza), backfill_recurring_split_expense (retroattivo da start_date),
disable_expired_split_recurrings (scoped a gruppi dove l'utente è membro
attivo), e l'API SplitRecurringExpenseViewSet (mirror di
expenses/tests/test_recurring_api.py).
"""

from datetime import date, timedelta
from decimal import Decimal

import pytest
from django.contrib.auth.models import User
from django.test import Client
from django.utils import timezone

from splitting.models import (
    SplitExpense,
    SplitGroup,
    SplitParticipant,
    SplitRecurringExpense,
    SplitRecurringExpenseParticipant,
)
from splitting.services import (
    backfill_recurring_split_expense,
    disable_expired_split_recurrings,
    generate_split_recurring_expenses,
)


def _months_before(d: date, n: int) -> date:
    """Primo giorno del mese `n` mesi prima di `d` (arithmetic robusta ai
    salti di anno, per evitare test fragili legati alla data reale)."""
    year, month = d.year, d.month
    for _ in range(n):
        month -= 1
        if month == 0:
            month = 12
            year -= 1
    return date(year, month, 1)


@pytest.fixture
def group_of_three(db, test_user, second_user, third_user):
    group = SplitGroup.objects.create(name="Casa condivisa", created_by=test_user)
    p1 = SplitParticipant.objects.create(
        group=group, user=test_user, added_by=test_user
    )
    p2 = SplitParticipant.objects.create(
        group=group, user=second_user, added_by=test_user
    )
    p3 = SplitParticipant.objects.create(
        group=group, user=third_user, added_by=test_user
    )
    return group, p1, p2, p3


def _make_equal_recurring(
    group,
    payer_participant,
    *,
    start_date,
    created_by,
    day_of_month=5,
    end_date=None,
    amount="900.00",
):
    rec = SplitRecurringExpense.objects.create(
        group=group,
        description="Affitto",
        amount=amount,
        split_method=SplitRecurringExpense.EQUAL,
        day_of_month=day_of_month,
        start_date=start_date,
        end_date=end_date,
        created_by=created_by,
    )
    SplitRecurringExpenseParticipant.objects.create(
        recurring=rec, participant=payer_participant, is_payer=True
    )
    return rec


# ── Generazione idempotente ──────────────────────────────────────────────


class TestGenerateIdempotent:
    def test_generate_twice_does_not_duplicate(self, group_of_three, test_user):
        group, p1, _p2, _p3 = group_of_three
        rec = _make_equal_recurring(
            group,
            p1,
            start_date=date(2026, 1, 1),
            day_of_month=10,
            created_by=test_user,
        )

        result1 = generate_split_recurring_expenses(test_user, 2026, 3)
        result2 = generate_split_recurring_expenses(test_user, 2026, 3)

        assert result1["created"] == 1
        assert result2["created"] == 0
        assert (
            SplitExpense.objects.filter(
                recurring_source=rec, recurring_occurrence_date=date(2026, 3, 10)
            ).count()
            == 1
        )

    def test_generate_equal_split_uses_live_roster(
        self, group_of_three, test_user, second_user, third_user
    ):
        """Il template EQUAL persiste solo il pagatore — gli altri membri
        arrivano dal roster ATTIVO del gruppo al momento della generazione
        (piano sez. 1.7)."""
        group, p1, _p2, _p3 = group_of_three
        rec = _make_equal_recurring(
            group,
            p1,
            start_date=date(2026, 1, 1),
            day_of_month=10,
            created_by=test_user,
        )

        generate_split_recurring_expenses(test_user, 2026, 4)

        expense = SplitExpense.objects.get(
            recurring_source=rec, recurring_occurrence_date=date(2026, 4, 10)
        )
        shares = list(expense.shares.select_related("participant"))
        assert len(shares) == 3
        assert all(s.share_amount == Decimal("300.00") for s in shares)
        payer_shares = [s for s in shares if s.is_payer]
        assert len(payer_shares) == 1
        assert payer_shares[0].participant.user_id == test_user.id

    def test_generate_ignores_recurring_from_groups_where_user_not_member(
        self, group_of_three, test_user
    ):
        group, p1, _p2, _p3 = group_of_three
        _make_equal_recurring(
            group, p1, start_date=date(2026, 1, 1), created_by=test_user
        )
        outsider = User.objects.create_user(
            username="outsider_rec1", email="outsider_rec1@test.com", password="x"
        )

        result = generate_split_recurring_expenses(outsider, 2026, 5)

        assert result == {"created": 0, "skipped": 0}

    def test_payer_no_longer_active_member_is_skipped_not_fatal(
        self, group_of_three, test_user, second_user
    ):
        """Se il pagatore designato lascia il gruppo dopo la creazione della
        ricorrenza, l'occorrenza viene saltata (SplitServiceError catturata)
        invece di far fallire l'intera generazione mensile dell'utente."""
        group, p1, _p2, _p3 = group_of_three
        rec = _make_equal_recurring(
            group,
            p1,
            start_date=date(2026, 1, 1),
            day_of_month=10,
            created_by=test_user,
        )
        p1.is_active = False
        p1.save(update_fields=["is_active"])

        result = generate_split_recurring_expenses(second_user, 2026, 3)

        assert result == {"created": 0, "skipped": 1}
        assert not SplitExpense.objects.filter(recurring_source=rec).exists()


# ── exact/percentage/shares usano il template persistito ────────────────


class TestNonEqualMethodsUseTemplate:
    def test_exact_split_uses_persisted_template(
        self, group_of_three, test_user, second_user, third_user
    ):
        group, p1, p2, p3 = group_of_three
        rec = SplitRecurringExpense.objects.create(
            group=group,
            description="Spesa mensile",
            amount="100.00",
            split_method=SplitRecurringExpense.EXACT,
            day_of_month=1,
            start_date=date(2026, 1, 1),
            created_by=test_user,
        )
        SplitRecurringExpenseParticipant.objects.create(
            recurring=rec, participant=p1, is_payer=True, raw_input="50.00"
        )
        SplitRecurringExpenseParticipant.objects.create(
            recurring=rec, participant=p2, raw_input="30.00"
        )
        SplitRecurringExpenseParticipant.objects.create(
            recurring=rec, participant=p3, raw_input="20.00"
        )

        generate_split_recurring_expenses(test_user, 2026, 2)

        expense = SplitExpense.objects.get(
            recurring_source=rec, recurring_occurrence_date=date(2026, 2, 1)
        )
        shares = {s.participant_id: s.share_amount for s in expense.shares.all()}
        assert shares[p1.id] == Decimal("50.00")
        assert shares[p2.id] == Decimal("30.00")
        assert shares[p3.id] == Decimal("20.00")


# ── Backfill retroattivo ──────────────────────────────────────────────────


class TestBackfillRetroactive:
    def test_backfill_creates_missing_months_from_start_date(
        self, group_of_three, test_user
    ):
        start = _months_before(timezone.localdate(), 3)
        group, p1, _p2, _p3 = group_of_three
        rec = _make_equal_recurring(
            group, p1, start_date=start, day_of_month=15, created_by=test_user
        )

        result = backfill_recurring_split_expense(rec)

        # start, start+1, start+2, oggi (mese corrente) → 4 mesi inclusi.
        assert result["created"] == 4
        assert SplitExpense.objects.filter(recurring_source=rec).count() == 4
        assert SplitExpense.objects.filter(
            recurring_source=rec,
            recurring_occurrence_date=date(start.year, start.month, 15),
        ).exists()

    def test_backfill_is_idempotent(self, group_of_three, test_user):
        start = _months_before(timezone.localdate(), 2)
        group, p1, _p2, _p3 = group_of_three
        rec = _make_equal_recurring(
            group, p1, start_date=start, day_of_month=1, created_by=test_user
        )

        first = backfill_recurring_split_expense(rec)
        second = backfill_recurring_split_expense(rec)

        assert first["created"] == 3
        assert second["created"] == 0
        assert SplitExpense.objects.filter(recurring_source=rec).count() == 3


# ── Disabilitazione automatica delle ricorrenze scadute ──────────────────


class TestAutoDisableExpired:
    def test_disable_expired_split_recurrings_disables_past_end_date(
        self, group_of_three, test_user
    ):
        group, p1, _p2, _p3 = group_of_three
        yesterday = timezone.localdate() - timedelta(days=1)
        rec = _make_equal_recurring(
            group,
            p1,
            start_date=date(2025, 1, 1),
            end_date=yesterday,
            created_by=test_user,
        )

        updated = disable_expired_split_recurrings(test_user)
        rec.refresh_from_db()

        assert updated == 1
        assert rec.status == SplitRecurringExpense.STATUS_DISABLED
        assert rec.is_active is False
        assert rec.disabled_at is not None

    def test_disable_expired_scoped_to_active_group_members(
        self, group_of_three, test_user
    ):
        """Un utente estraneo al gruppo (piano sez. 3.4: filtro su
        `group__participants__user=user, is_active=True`) non innesca la
        disabilitazione della ricorrenza scaduta di un altro gruppo."""
        group, p1, _p2, _p3 = group_of_three
        yesterday = timezone.localdate() - timedelta(days=1)
        rec = _make_equal_recurring(
            group,
            p1,
            start_date=date(2025, 1, 1),
            end_date=yesterday,
            created_by=test_user,
        )
        outsider = User.objects.create_user(
            username="outsider_rec2", email="outsider_rec2@test.com", password="x"
        )

        updated = disable_expired_split_recurrings(outsider)
        rec.refresh_from_db()

        assert updated == 0
        assert rec.status == SplitRecurringExpense.STATUS_ACTIVE

    def test_backfill_auto_disables_expired_before_generating(
        self, group_of_three, test_user
    ):
        group, p1, _p2, _p3 = group_of_three
        yesterday = timezone.localdate() - timedelta(days=1)
        rec = _make_equal_recurring(
            group,
            p1,
            start_date=date(2025, 1, 1),
            end_date=yesterday,
            created_by=test_user,
        )

        result = backfill_recurring_split_expense(rec)
        rec.refresh_from_db()

        assert rec.status == SplitRecurringExpense.STATUS_DISABLED
        assert result == {"created": 0, "skipped": 0}


# ── API SplitRecurringExpenseViewSet (mirror test_recurring_api.py) ──────


class TestSplitRecurringApi:
    def test_create_recurring_via_api_backfills_immediately(
        self, group_of_three, test_user
    ):
        group, _p1, _p2, _p3 = group_of_three
        client = Client()
        client.force_login(test_user)
        res = client.post(
            "/api/split/recurring/",
            data={
                "group": group.id,
                "description": "Netflix condiviso",
                "amount": "12.00",
                "split_method": "equal",
                "day_of_month": 5,
                "start_date": "2026-01-01",
                "participants": [{"user_id": test_user.id, "is_payer": True}],
            },
            content_type="application/json",
        )
        assert res.status_code == 201, res.content
        rec = SplitRecurringExpense.objects.get(id=res.json()["id"])
        assert SplitExpense.objects.filter(recurring_source=rec).exists()

    def test_create_recurring_requires_start_date(self, group_of_three, test_user):
        group, _p1, _p2, _p3 = group_of_three
        client = Client()
        client.force_login(test_user)
        res = client.post(
            "/api/split/recurring/",
            data={
                "group": group.id,
                "description": "Netflix",
                "amount": "12.00",
                "split_method": "equal",
                "day_of_month": 5,
                "participants": [{"user_id": test_user.id, "is_payer": True}],
            },
            content_type="application/json",
        )
        assert res.status_code == 400
        assert "start_date" in res.json()

    def test_destroy_is_soft_delete(self, group_of_three, test_user):
        group, p1, _p2, _p3 = group_of_three
        rec = _make_equal_recurring(
            group, p1, start_date=date(2026, 1, 1), created_by=test_user
        )
        client = Client()
        client.force_login(test_user)

        res = client.delete(f"/api/split/recurring/{rec.id}/")

        assert res.status_code == 204
        rec.refresh_from_db()
        assert rec.status == SplitRecurringExpense.STATUS_DELETED
        assert rec.is_active is False

    def test_enable_disable_endpoints(self, group_of_three, test_user):
        group, p1, _p2, _p3 = group_of_three
        rec = _make_equal_recurring(
            group, p1, start_date=date(2026, 1, 1), created_by=test_user
        )
        client = Client()
        client.force_login(test_user)

        res_disable = client.post(f"/api/split/recurring/{rec.id}/disable/")
        assert res_disable.status_code == 200
        rec.refresh_from_db()
        assert rec.status == SplitRecurringExpense.STATUS_DISABLED
        assert rec.is_active is False

        res_enable = client.post(f"/api/split/recurring/{rec.id}/enable/")
        assert res_enable.status_code == 200
        rec.refresh_from_db()
        assert rec.status == SplitRecurringExpense.STATUS_ACTIVE
        assert rec.is_active is True

    def test_generate_and_status_endpoints(self, group_of_three, test_user):
        group, p1, _p2, _p3 = group_of_three
        rec = _make_equal_recurring(
            group,
            p1,
            start_date=date(2026, 1, 1),
            day_of_month=10,
            created_by=test_user,
        )
        client = Client()
        client.force_login(test_user)

        res_generate = client.post(
            "/api/split/recurring/generate/",
            data={"month": 6, "year": 2026},
            content_type="application/json",
        )
        assert res_generate.status_code == 200
        assert res_generate.json()["created"] == 1

        res_status = client.get("/api/split/recurring/status/?month=6&year=2026")
        assert res_status.status_code == 200
        items = res_status.json()["items"]
        assert any(
            item["id"] == rec.id and item["status"] == "generated" for item in items
        )

    def test_uninvolved_user_cannot_access_recurring(self, group_of_three, test_user):
        group, p1, _p2, _p3 = group_of_three
        rec = _make_equal_recurring(
            group, p1, start_date=date(2026, 1, 1), created_by=test_user
        )
        outsider = User.objects.create_user(
            username="outsider_rec3", email="outsider_rec3@test.com", password="x"
        )
        client = Client()
        client.force_login(outsider)

        res = client.get(f"/api/split/recurring/{rec.id}/")
        assert res.status_code == 404

        res_list = client.get("/api/split/recurring/")
        assert res.status_code == 404
        ids = [row["id"] for row in res_list.json()["results"]]
        assert rec.id not in ids

    def test_create_recurring_rejects_past_end_date(self, group_of_three, test_user):
        group, _p1, _p2, _p3 = group_of_three
        client = Client()
        client.force_login(test_user)
        past = (timezone.localdate() - timedelta(days=1)).isoformat()

        res = client.post(
            "/api/split/recurring/",
            data={
                "group": group.id,
                "description": "Netflix",
                "amount": "12.00",
                "split_method": "equal",
                "day_of_month": 5,
                "start_date": "2026-01-01",
                "end_date": past,
                "participants": [{"user_id": test_user.id, "is_payer": True}],
            },
            content_type="application/json",
        )
        assert res.status_code == 400
        assert "end_date" in res.json()

    def test_create_recurring_rejects_inaccessible_group(self, test_user, second_user):
        foreign_group = SplitGroup.objects.create(
            name="Not mine", created_by=second_user
        )
        SplitParticipant.objects.create(
            group=foreign_group, user=second_user, added_by=second_user
        )
        client = Client()
        client.force_login(test_user)

        res = client.post(
            "/api/split/recurring/",
            data={
                "group": foreign_group.id,
                "description": "Netflix",
                "amount": "12.00",
                "split_method": "equal",
                "day_of_month": 5,
                "start_date": "2026-01-01",
                "participants": [{"user_id": test_user.id, "is_payer": True}],
            },
            content_type="application/json",
        )
        assert res.status_code == 400
        assert "group" in res.json()

    def test_patch_amount_without_participants_is_rejected(
        self, group_of_three, test_user
    ):
        """Mirror del fix su SplitExpenseSerializer: cambiare `amount` senza
        rispecificare `participants` lascerebbe il template incoerente col
        nuovo importo (piano sez. 1.7/3.4 — vedi anche
        test_split_expenses_api.py::TestUpdate)."""
        group, p1, _p2, _p3 = group_of_three
        rec = _make_equal_recurring(
            group, p1, start_date=date(2026, 1, 1), created_by=test_user
        )
        client = Client()
        client.force_login(test_user)

        res = client.patch(
            f"/api/split/recurring/{rec.id}/",
            data={"amount": "999.00"},
            content_type="application/json",
        )

        assert res.status_code == 400
        rec.refresh_from_db()
        assert rec.amount == Decimal("900.00")
