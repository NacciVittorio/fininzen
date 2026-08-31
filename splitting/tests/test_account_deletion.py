"""splitting/tests/test_account_deletion.py — anonimizzazione dell'identità
Split alla cancellazione dell'account (piano "Anonimizza l'identità Split"
sez. 1.2).

`SplitParticipant.user`/`SplitSettlement.payer_user`/`payee_user` sono
SET_NULL ma vincolati da CheckConstraint a "esattamente uno tra
user/contact" — prima di questa fix, DELETE /api/auth/account/ andava in
IntegrityError (500) per qualunque utente che avesse mai toccato Split.
Trovato empiricamente in fase di test anche un secondo colpevole non
previsto dal piano originale: SplitParticipant.added_by era CASCADE e
presente su OGNI riga (chi crea un gruppo è quasi sempre anche chi aggiunge
tutti gli altri membri iniziali) — cancellarlo svuotava l'intero gruppo,
non solo la sua identità.

Test via client.delete("/api/auth/account/") reale (non chiamata diretta al
service layer) per coprire l'intero flusso: permessi, verifica password,
transaction.atomic, e la chiamata a anonymize_split_identity_for_user prima
di user.delete().
"""

from decimal import Decimal

from splitting.models import (
    SplitContact,
    SplitExpense,
    SplitGroup,
    SplitParticipant,
    SplitSettlement,
)
from splitting.services import apply_split_shares


def _delete_account(client):
    return client.delete(
        "/api/auth/account/",
        data={"password": "testpass123", "confirm": "DELETE"},
        content_type="application/json",
    )


class TestAnonymizeOnAccountDeletion:
    def test_shared_group_survives_creator_deletion(
        self, client, split_group_with_contact_and_user, test_user, second_user
    ):
        """test_user created the group, added every member (including
        second_user and the local contact — added_by=test_user on all three
        rows, the realistic case), and is the payer. second_user is a real,
        surviving co-member. Deleting test_user must return 204, and the
        group/expense/second_user's membership must all survive."""
        group, owner_p, member_p, contact_p = split_group_with_contact_and_user
        expense = SplitExpense.objects.create(
            group=group,
            description="Weekend",
            amount=Decimal("90.00"),
            date="2026-07-01",
            split_method=SplitExpense.EQUAL,
            created_by=test_user,
        )
        apply_split_shares(
            expense,
            [
                {"user_id": test_user.id, "is_payer": True},
                {"user_id": second_user.id},
                {"contact_id": contact_p.contact_id},
            ],
            SplitExpense.EQUAL,
            added_by=test_user,
        )

        res = _delete_account(client)

        assert res.status_code == 204
        group.refresh_from_db()
        assert group.created_by_id is None

        remaining = list(SplitParticipant.objects.filter(group=group))
        assert len(remaining) == 3
        second_row = [p for p in remaining if p.user_id == second_user.id]
        assert len(second_row) == 1

        expense.refresh_from_db()
        assert expense.created_by_id is None
        shares = list(expense.shares.all())
        assert sum(s.share_amount for s in shares) == Decimal("90.00")

        placeholder_rows = SplitParticipant.objects.filter(
            group=group, contact__display_name="Utente eliminato"
        )
        assert placeholder_rows.count() == 1
        assert placeholder_rows.first().contact.owner_id == second_user.id
        assert placeholder_rows.first().contact.is_archived is True

        # The local contact ("Mario") survives too, reassigned off test_user
        # since it's still referenced by contact_p in a shared group.
        contact_p.refresh_from_db()
        assert contact_p.contact.owner_id == second_user.id

    def test_solo_group_with_only_local_contacts_deleted_cleanly(
        self, client, test_user, split_contact_local
    ):
        """A group where test_user is the only real user and the rest are
        their own local contacts (nobody else could ever see it). Deleting
        the account must return 204 and the whole group disappears —
        nothing to anonymize on behalf of a nonexistent audience."""
        group = SplitGroup.objects.create(name="Solo bookkeeping", created_by=test_user)
        SplitParticipant.objects.create(group=group, user=test_user, added_by=test_user)
        SplitParticipant.objects.create(
            group=group, contact=split_contact_local, added_by=test_user
        )
        expense = SplitExpense.objects.create(
            group=group,
            description="Solo",
            amount=Decimal("20.00"),
            date="2026-07-01",
            split_method=SplitExpense.EQUAL,
            created_by=test_user,
        )
        apply_split_shares(
            expense,
            [
                {"user_id": test_user.id, "is_payer": True},
                {"contact_id": split_contact_local.id},
            ],
            SplitExpense.EQUAL,
            added_by=test_user,
        )

        res = _delete_account(client)

        assert res.status_code == 204
        assert not SplitGroup.objects.filter(pk=group.pk).exists()
        assert not SplitExpense.objects.filter(pk=expense.pk).exists()
        assert not SplitContact.objects.filter(pk=split_contact_local.pk).exists()

    def test_standalone_expense_between_two_real_users_survives(
        self, client, test_user, second_user, split_contact_linked
    ):
        expense = SplitExpense.objects.create(
            group=None,
            description="Taxi",
            amount=Decimal("20.00"),
            date="2026-07-02",
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

        res = _delete_account(client)

        assert res.status_code == 204
        expense.refresh_from_db()
        shares = list(expense.shares.select_related("participant"))
        assert sum(s.share_amount for s in shares) == Decimal("20.00")
        second_share = [s for s in shares if s.participant.user_id == second_user.id]
        assert len(second_share) == 1

    def test_group_scoped_settlement_with_contact_counterpart_survives(
        self, client, split_group_with_contact_and_user, test_user
    ):
        """The immediate counterpart is a local contact, but the settlement
        is group-scoped, so other group members have a stake in seeing it
        in the group's settlement history — must be anonymized, not
        deleted."""
        group, owner_p, member_p, contact_p = split_group_with_contact_and_user
        settlement = SplitSettlement.objects.create(
            group=group,
            payer_user=test_user,
            payee_contact=contact_p.contact,
            amount=Decimal("15.00"),
            date="2026-07-01",
            created_by=test_user,
        )

        res = _delete_account(client)

        assert res.status_code == 204
        settlement.refresh_from_db()
        assert settlement.payer_user_id is None
        assert settlement.payer_contact_id is not None
        assert settlement.payer_contact.display_name == "Utente eliminato"

    def test_cross_group_settlement_with_contact_counterpart_deleted(
        self, client, test_user, split_contact_local
    ):
        """Cross-group (group=None) settlement between test_user and their
        own local contact: pure private bookkeeping, nobody else has a
        stake — deleted rather than anonymized."""
        settlement = SplitSettlement.objects.create(
            group=None,
            payer_user=test_user,
            payee_contact=split_contact_local,
            amount=Decimal("15.00"),
            date="2026-07-01",
            created_by=test_user,
        )

        res = _delete_account(client)

        assert res.status_code == 204
        assert not SplitSettlement.objects.filter(pk=settlement.pk).exists()

    def test_cross_group_settlement_with_real_user_counterpart_survives(
        self, client, test_user, second_user, split_contact_linked
    ):
        settlement = SplitSettlement.objects.create(
            group=None,
            payer_user=test_user,
            payee_user=second_user,
            amount=Decimal("15.00"),
            date="2026-07-01",
            created_by=test_user,
        )

        res = _delete_account(client)

        assert res.status_code == 204
        settlement.refresh_from_db()
        assert settlement.payer_user_id is None
        assert settlement.payer_contact_id is not None
        assert settlement.payee_user_id == second_user.id
