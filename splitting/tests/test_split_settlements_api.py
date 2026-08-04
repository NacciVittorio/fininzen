"""splitting/tests/test_split_settlements_api.py — API dei pagamenti di saldo
(`/api/split/settlements/`, piano sez. 1.6/6/8.1): create/list/delete,
vincolo "created_by deve essere una delle due parti", divieto
pagatore==beneficiario, importo non positivo, scoping in lettura/cancellazione.
"""

from decimal import Decimal

from portfolio.models import Asset, InvestmentType
from splitting.models import SplitGroup, SplitParticipant, SplitSettlement


class TestCreateSettlement:
    def test_create_settlement_as_payer(
        self, client, test_user, second_user, split_contact_linked
    ):
        res = client.post(
            "/api/split/settlements/",
            data={
                "payer_user": test_user.id,
                "payee_user": second_user.id,
                "amount": "25.00",
                "date": "2026-07-13",
            },
            content_type="application/json",
        )
        assert res.status_code == 201, res.content
        assert res.json()["created_by"] == test_user.id

    def test_create_settlement_as_payee(
        self, client, test_user, second_user, split_contact_linked
    ):
        res = client.post(
            "/api/split/settlements/",
            data={
                "payer_user": second_user.id,
                "payee_user": test_user.id,
                "amount": "25.00",
                "date": "2026-07-13",
            },
            content_type="application/json",
        )
        assert res.status_code == 201, res.content
        assert res.json()["created_by"] == test_user.id

    def test_create_settlement_rejects_uninvolved_third_party(
        self, second_client, test_user, third_user
    ):
        res = second_client.post(
            "/api/split/settlements/",
            data={
                "payer_user": test_user.id,
                "payee_user": third_user.id,
                "amount": "25.00",
                "date": "2026-07-13",
            },
            content_type="application/json",
        )
        assert res.status_code == 400

    def test_create_settlement_rejects_self_payment(self, client, test_user):
        res = client.post(
            "/api/split/settlements/",
            data={
                "payer_user": test_user.id,
                "payee_user": test_user.id,
                "amount": "25.00",
                "date": "2026-07-13",
            },
            content_type="application/json",
        )
        assert res.status_code == 400

    def test_create_settlement_rejects_non_positive_amount(
        self, client, test_user, second_user
    ):
        res = client.post(
            "/api/split/settlements/",
            data={
                "payer_user": test_user.id,
                "payee_user": second_user.id,
                "amount": "0.00",
                "date": "2026-07-13",
            },
            content_type="application/json",
        )
        assert res.status_code == 400

    def test_create_settlement_with_group_scope(
        self,
        client,
        split_group_with_two_users,
        test_user,
        second_user,
        split_contact_linked,
    ):
        group, _owner_p, _member_p = split_group_with_two_users
        res = client.post(
            "/api/split/settlements/",
            data={
                "group": group.id,
                "payer_user": second_user.id,
                "payee_user": test_user.id,
                "amount": "15.00",
                "date": "2026-07-13",
            },
            content_type="application/json",
        )
        assert res.status_code == 201, res.content
        assert res.json()["group"] == group.id

    def test_create_settlement_rejects_inaccessible_group(
        self, client, test_user, second_user
    ):
        foreign_group = SplitGroup.objects.create(
            name="Not mine", created_by=second_user
        )
        SplitParticipant.objects.create(
            group=foreign_group, user=second_user, added_by=second_user
        )
        res = client.post(
            "/api/split/settlements/",
            data={
                "group": foreign_group.id,
                "payer_user": second_user.id,
                "payee_user": test_user.id,
                "amount": "15.00",
                "date": "2026-07-13",
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
            "/api/split/settlements/",
            data={
                "payer_user": test_user.id,
                "payee_user": second_user.id,
                "amount": "25.00",
                "date": "2026-07-13",
                "linked_asset": foreign_account.id,
            },
            content_type="application/json",
        )
        assert res.status_code == 400


class TestListAndDelete:
    def test_list_and_delete_settlement(self, client, test_user, second_user):
        settlement = SplitSettlement.objects.create(
            payer_user=test_user,
            payee_user=second_user,
            amount=Decimal("10.00"),
            date="2026-07-14",
            created_by=test_user,
        )

        res = client.get("/api/split/settlements/")
        assert res.status_code == 200
        ids = [row["id"] for row in res.json()["results"]]
        assert settlement.id in ids

        res = client.delete(f"/api/split/settlements/{settlement.id}/")
        assert res.status_code == 204
        assert not SplitSettlement.objects.filter(id=settlement.id).exists()

    def test_uninvolved_user_cannot_see_or_delete_settlement(
        self, client, third_client, test_user, second_user
    ):
        settlement = SplitSettlement.objects.create(
            payer_user=test_user,
            payee_user=second_user,
            amount=Decimal("10.00"),
            date="2026-07-14",
            created_by=test_user,
        )

        res = third_client.get("/api/split/settlements/")
        ids = [row["id"] for row in res.json()["results"]]
        assert settlement.id not in ids

        res = third_client.delete(f"/api/split/settlements/{settlement.id}/")
        assert res.status_code == 404

    def test_settlement_has_no_update_endpoint(self, client, test_user, second_user):
        """Un settlement è un evento immutabile: niente PUT/PATCH, solo
        create/list/retrieve/delete (piano sez. 6, docstring
        SplitSettlementViewSet)."""
        settlement = SplitSettlement.objects.create(
            payer_user=test_user,
            payee_user=second_user,
            amount=Decimal("10.00"),
            date="2026-07-14",
            created_by=test_user,
        )
        res = client.patch(
            f"/api/split/settlements/{settlement.id}/",
            data={"amount": "20.00"},
            content_type="application/json",
        )
        assert res.status_code == 405

    def test_removed_member_who_is_a_direct_party_keeps_access(
        self, client, second_client, test_user, second_user
    ):
        """Piano Batch 4.5: unlike a bare created_by shortcut, being a direct
        party (payer/payee) is a fact about the transaction itself and must
        survive removal from the group — this must NOT regress."""
        group = SplitGroup.objects.create(name="Weekend", created_by=test_user)
        SplitParticipant.objects.create(group=group, user=test_user, added_by=test_user)
        member_p = SplitParticipant.objects.create(
            group=group, user=second_user, added_by=test_user
        )
        settlement = SplitSettlement.objects.create(
            group=group,
            payer_user=second_user,
            payee_user=test_user,
            amount=Decimal("10.00"),
            date="2026-07-14",
            created_by=second_user,
        )

        client.delete(f"/api/split/groups/{group.id}/members/{member_p.id}/")

        res = second_client.get(f"/api/split/settlements/{settlement.id}/")
        assert res.status_code == 200

    def test_removed_member_loses_created_by_only_access_to_group_settlement(
        self, client, second_client, test_user, second_user, third_user
    ):
        """A group settlement recorded by someone who is neither payer nor
        payee (not reachable through the normal create flow — the serializer
        already requires created_by to be one of the two — but the
        permission function's created_by branch must still respect
        membership on its own, defense in depth)."""
        group = SplitGroup.objects.create(name="Weekend", created_by=test_user)
        SplitParticipant.objects.create(group=group, user=test_user, added_by=test_user)
        SplitParticipant.objects.create(
            group=group, user=second_user, added_by=test_user
        )
        third_p = SplitParticipant.objects.create(
            group=group, user=third_user, added_by=test_user
        )
        settlement = SplitSettlement.objects.create(
            group=group,
            payer_user=test_user,
            payee_user=second_user,
            amount=Decimal("10.00"),
            date="2026-07-14",
            created_by=third_user,
        )

        client.delete(f"/api/split/groups/{group.id}/members/{third_p.id}/")

        from django.test import Client

        third_client = Client()
        third_client.force_login(third_user)
        res = third_client.get(f"/api/split/settlements/{settlement.id}/")
        assert res.status_code == 404
