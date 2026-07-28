"""splitting/tests/test_groups_api.py — CRUD gruppi + sotto-risorse membri
(`/api/split/groups/...`, piano sez. 1.3/1.4/6/8.1): scoping/permessi via
membership (mai ViewAsMixin — piano sez. 0.2), roster membri, endpoint
`balances`/`simplify` a livello di gruppo.
"""

from decimal import Decimal

from splitting.models import SplitContact, SplitGroup, SplitParticipant


# ── CRUD + permessi/membership ──────────────────────────────────────────


class TestGroupCrudAndPermissions:
    def test_create_group_auto_adds_creator_as_member(self, client, test_user):
        res = client.post(
            "/api/split/groups/",
            data={"name": "Viaggio a Roma", "icon": "🏛️"},
            content_type="application/json",
        )

        assert res.status_code == 201, res.content
        data = res.json()
        assert data["created_by"] == test_user.id
        assert len(data["members"]) == 1
        assert data["members"][0]["user"] == test_user.id

    def test_create_group_requires_name(self, client):
        res = client.post(
            "/api/split/groups/",
            data={"name": "   "},
            content_type="application/json",
        )
        assert res.status_code == 400

    def test_list_includes_created_and_member_groups_excludes_others(
        self, client, second_client, test_user, second_user
    ):
        created = SplitGroup.objects.create(name="Mine", created_by=test_user)
        SplitParticipant.objects.create(
            group=created, user=test_user, added_by=test_user
        )
        member_of = SplitGroup.objects.create(name="Shared", created_by=second_user)
        SplitParticipant.objects.create(
            group=member_of, user=second_user, added_by=second_user
        )
        SplitParticipant.objects.create(
            group=member_of, user=test_user, added_by=second_user
        )
        not_mine = SplitGroup.objects.create(name="Not mine", created_by=second_user)
        SplitParticipant.objects.create(
            group=not_mine, user=second_user, added_by=second_user
        )

        res = client.get("/api/split/groups/")

        assert res.status_code == 200
        ids = {g["id"] for g in res.json()["results"]}
        assert created.id in ids
        assert member_of.id in ids
        assert not_mine.id not in ids

    def test_member_can_retrieve_group(self, second_client, split_group_with_two_users):
        group, _owner_p, _member_p = split_group_with_two_users
        # second_user IS an active member of this group (fixture).
        assert second_client.get(f"/api/split/groups/{group.id}/").status_code == 200

    def test_non_member_cannot_retrieve_group(
        self, split_group_with_two_users, third_user
    ):
        # A genuinely uninvolved user gets 404, not the group's data.
        group, _owner_p, _member_p = split_group_with_two_users
        from django.test import Client

        outsider_client = Client()
        outsider_client.force_login(third_user)
        res = outsider_client.get(f"/api/split/groups/{group.id}/")
        assert res.status_code == 404

    def test_non_member_cannot_patch_group(
        self, test_user, split_group_with_two_users, third_user
    ):
        group, _owner_p, _member_p = split_group_with_two_users
        from django.test import Client

        outsider_client = Client()
        outsider_client.force_login(third_user)

        res = outsider_client.patch(
            f"/api/split/groups/{group.id}/",
            data={"name": "Hijacked"},
            content_type="application/json",
        )
        assert res.status_code == 404
        group.refresh_from_db()
        assert group.name != "Hijacked"

    def test_member_can_patch_group_name(
        self, second_client, split_group_with_two_users
    ):
        group, _owner_p, _member_p = split_group_with_two_users
        res = second_client.patch(
            f"/api/split/groups/{group.id}/",
            data={"name": "Nuovo nome"},
            content_type="application/json",
        )
        assert res.status_code == 200
        group.refresh_from_db()
        assert group.name == "Nuovo nome"

    def test_delete_group_with_expense_history_cascades_cleanly(
        self, client, split_group_with_contact_and_user, test_user, second_user
    ):
        """Regressione: cancellare un intero gruppo con storico spese deve
        cascatare su spese/shares/partecipanti senza sollevare
        ProtectedError — stesso deadlock del collector di Django già fissato
        per la cancellazione di una SplitExpense occasionale (vedi
        SplitExpenseShare.participant in splitting/models.py, ora CASCADE
        invece di PROTECT)."""
        from splitting.models import SplitExpense, SplitExpenseShare
        from splitting.services import apply_split_shares

        group, _owner_p, member_p, contact_p = split_group_with_contact_and_user
        expense = SplitExpense.objects.create(
            group=group,
            description="Cena",
            amount=Decimal("90.00"),
            date="2026-07-01",
            split_method=SplitExpense.EQUAL,
            created_by=test_user,
        )
        apply_split_shares(
            expense,
            [
                {"user_id": test_user.id, "is_payer": True},
                {"user_id": member_p.user_id},
                {"contact_id": contact_p.contact_id},
            ],
            SplitExpense.EQUAL,
            added_by=test_user,
        )

        res = client.delete(f"/api/split/groups/{group.id}/")

        assert res.status_code == 204, res.content
        assert not SplitGroup.objects.filter(id=group.id).exists()
        assert not SplitExpense.objects.filter(id=expense.id).exists()
        assert not SplitExpenseShare.objects.filter(expense_id=expense.id).exists()
        assert not SplitParticipant.objects.filter(group_id=group.id).exists()


# ── Membri (/groups/{id}/members/) ──────────────────────────────────────


class TestGroupMembers:
    def test_list_members(self, client, split_group_with_two_users, second_user):
        group, _owner_p, _member_p = split_group_with_two_users
        res = client.get(f"/api/split/groups/{group.id}/members/")
        assert res.status_code == 200
        user_ids = {m["user"] for m in res.json()}
        assert second_user.id in user_ids

    def test_add_linked_partner_as_member(
        self, client, test_user, split_contact_linked, second_user
    ):
        group = SplitGroup.objects.create(name="Weekend", created_by=test_user)
        SplitParticipant.objects.create(group=group, user=test_user, added_by=test_user)

        res = client.post(
            f"/api/split/groups/{group.id}/members/",
            data={"user_id": second_user.id},
            content_type="application/json",
        )

        assert res.status_code == 201, res.content
        assert SplitParticipant.objects.filter(
            group=group, user=second_user, is_active=True
        ).exists()

    def test_cannot_add_unlinked_user_as_member(self, client, test_user, second_user):
        """decisione #1: nessuna aggiunta ad-hoc di user id arbitrari — deve
        esistere prima un SplitPartnerLink accettato (SplitContact
        linked_user)."""
        group = SplitGroup.objects.create(name="Weekend", created_by=test_user)
        SplitParticipant.objects.create(group=group, user=test_user, added_by=test_user)

        res = client.post(
            f"/api/split/groups/{group.id}/members/",
            data={"user_id": second_user.id},
            content_type="application/json",
        )

        assert res.status_code == 400
        assert res.json() == {"error": "not_a_linked_partner"}
        assert not SplitParticipant.objects.filter(
            group=group, user=second_user
        ).exists()

    def test_add_own_local_contact_as_member(
        self, client, test_user, split_contact_local
    ):
        group = SplitGroup.objects.create(name="Weekend", created_by=test_user)
        SplitParticipant.objects.create(group=group, user=test_user, added_by=test_user)

        res = client.post(
            f"/api/split/groups/{group.id}/members/",
            data={"contact_id": split_contact_local.id},
            content_type="application/json",
        )

        assert res.status_code == 201, res.content
        assert SplitParticipant.objects.filter(
            group=group, contact=split_contact_local, is_active=True
        ).exists()

    def test_cannot_add_another_users_contact(self, client, test_user, second_user):
        group = SplitGroup.objects.create(name="Weekend", created_by=test_user)
        SplitParticipant.objects.create(group=group, user=test_user, added_by=test_user)
        foreign_contact = SplitContact.objects.create(
            owner=second_user, display_name="Not mine"
        )

        res = client.post(
            f"/api/split/groups/{group.id}/members/",
            data={"contact_id": foreign_contact.id},
            content_type="application/json",
        )

        assert res.status_code == 404

    def test_members_endpoint_requires_exactly_one_identity(
        self, client, test_user, second_user, split_contact_local
    ):
        group = SplitGroup.objects.create(name="Weekend", created_by=test_user)
        SplitParticipant.objects.create(group=group, user=test_user, added_by=test_user)

        res = client.post(
            f"/api/split/groups/{group.id}/members/",
            data={
                "user_id": second_user.id,
                "contact_id": split_contact_local.id,
            },
            content_type="application/json",
        )
        assert res.status_code == 400

    def test_non_member_cannot_list_or_add_members(
        self, split_group_with_two_users, third_user
    ):
        group, _owner_p, _member_p = split_group_with_two_users
        from django.test import Client

        outsider_client = Client()
        outsider_client.force_login(third_user)

        res_get = outsider_client.get(f"/api/split/groups/{group.id}/members/")
        assert res_get.status_code == 404

        res_post = outsider_client.post(
            f"/api/split/groups/{group.id}/members/",
            data={"user_id": third_user.id},
            content_type="application/json",
        )
        assert res_post.status_code == 404

    def test_remove_member_is_soft_deactivate(
        self, client, split_group_with_two_users, second_user
    ):
        group, _owner_p, member_p = split_group_with_two_users

        res = client.delete(f"/api/split/groups/{group.id}/members/{member_p.id}/")

        assert res.status_code == 204
        member_p.refresh_from_db()
        assert member_p.is_active is False
        # Soft-deactivate, not a hard delete: the row still exists.
        assert SplitParticipant.objects.filter(id=member_p.id).exists()

    def test_removed_member_no_longer_appears_in_active_list(
        self, client, split_group_with_two_users, second_user
    ):
        group, _owner_p, member_p = split_group_with_two_users
        client.delete(f"/api/split/groups/{group.id}/members/{member_p.id}/")

        res = client.get(f"/api/split/groups/{group.id}/members/")
        user_ids = {m["user"] for m in res.json()}
        assert second_user.id not in user_ids


# ── Balances / simplify a livello di gruppo ─────────────────────────────


class TestGroupBalancesAndSimplifyEndpoints:
    def test_group_balances_endpoint(
        self, client, split_group_with_contact_and_user, test_user, second_user
    ):
        from splitting.services import apply_split_shares
        from splitting.models import SplitExpense

        group, _owner_p, member_p, contact_p = split_group_with_contact_and_user
        expense = SplitExpense.objects.create(
            group=group,
            description="Cena",
            amount=Decimal("90.00"),
            date="2026-07-01",
            split_method=SplitExpense.EQUAL,
            created_by=test_user,
        )
        apply_split_shares(
            expense,
            [
                {"user_id": test_user.id, "is_payer": True},
                {"user_id": member_p.user_id},
                {"contact_id": contact_p.contact_id},
            ],
            SplitExpense.EQUAL,
            added_by=test_user,
        )

        res = client.get(f"/api/split/groups/{group.id}/balances/")

        assert res.status_code == 200
        entries = {
            (e["user_id"], e["contact_id"]): Decimal(e["balance"]) for e in res.json()
        }
        assert entries[(test_user.id, None)] == Decimal("60.00")
        assert entries[(second_user.id, None)] == Decimal("-30.00")
        assert entries[(None, contact_p.contact_id)] == Decimal("-30.00")

    def test_group_balances_endpoint_reflects_settlement(
        self, client, split_group_with_two_users, test_user, second_user
    ):
        from splitting.services import apply_split_shares
        from splitting.models import SplitExpense, SplitSettlement

        group, _owner_p, _member_p = split_group_with_two_users
        expense = SplitExpense.objects.create(
            group=group,
            description="Cena",
            amount=Decimal("40.00"),
            date="2026-07-01",
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
            group=group,
            payer_user=second_user,
            payee_user=test_user,
            amount=Decimal("20.00"),
            date="2026-07-02",
            created_by=second_user,
        )

        res = client.get(f"/api/split/groups/{group.id}/balances/")

        assert res.status_code == 200
        assert res.json() == []

    def test_simplify_endpoint(self, client, test_user, second_user, third_user):
        from splitting.services import apply_split_shares
        from splitting.models import SplitExpense

        group = SplitGroup.objects.create(name="Weekend", created_by=test_user)
        SplitParticipant.objects.create(group=group, user=test_user, added_by=test_user)
        SplitParticipant.objects.create(
            group=group, user=second_user, added_by=test_user
        )
        SplitParticipant.objects.create(
            group=group, user=third_user, added_by=test_user
        )
        expense = SplitExpense.objects.create(
            group=group,
            description="Spesa",
            amount=Decimal("60.00"),
            date="2026-07-10",
            split_method=SplitExpense.EQUAL,
            created_by=test_user,
        )
        apply_split_shares(
            expense,
            [
                {"user_id": test_user.id, "is_payer": True},
                {"user_id": second_user.id},
                {"user_id": third_user.id},
            ],
            SplitExpense.EQUAL,
            added_by=test_user,
        )

        res = client.get(f"/api/split/groups/{group.id}/simplify/")

        assert res.status_code == 200
        data = res.json()
        assert len(data) == 2
        amounts = {
            (tx["from"]["user_id"], tx["to"]["user_id"]): Decimal(tx["amount"])
            for tx in data
        }
        assert amounts[(second_user.id, test_user.id)] == Decimal("20.00")
        assert amounts[(third_user.id, test_user.id)] == Decimal("20.00")

    def test_non_member_cannot_call_balances_or_simplify(
        self, split_group_with_two_users, third_user
    ):
        group, _owner_p, _member_p = split_group_with_two_users
        from django.test import Client

        outsider_client = Client()
        outsider_client.force_login(third_user)

        assert (
            outsider_client.get(f"/api/split/groups/{group.id}/balances/").status_code
            == 404
        )
        assert (
            outsider_client.get(f"/api/split/groups/{group.id}/simplify/").status_code
            == 404
        )
