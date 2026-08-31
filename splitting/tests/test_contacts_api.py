"""splitting/tests/test_contacts_api.py — CRUD API della rubrica Split
(`/api/split/contacts/`, piano sez. 6/8.1): scoping per owner, soft-archive
on delete quando referenziato, read-only fields, filtro include_archived.
"""

from splitting.models import SplitContact, SplitGroup, SplitParticipant


class TestListAndCreate:
    def test_list_scoped_to_owner(self, client, split_contact_local, second_user):
        SplitContact.objects.create(owner=second_user, display_name="Not mine")

        res = client.get("/api/split/contacts/")

        assert res.status_code == 200
        names = [c["display_name"] for c in res.json()["results"]]
        assert "Mario (offline)" in names
        assert "Not mine" not in names

    def test_create_local_contact(self, client):
        res = client.post(
            "/api/split/contacts/",
            data={"display_name": "Luca", "color": "#ff0000"},
            content_type="application/json",
        )

        assert res.status_code == 201, res.content
        data = res.json()
        assert data["display_name"] == "Luca"
        assert data["color"] == "#ff0000"
        assert data["linked_user"] is None
        assert data["is_archived"] is False

    def test_create_requires_display_name(self, client):
        res = client.post(
            "/api/split/contacts/",
            data={"display_name": "   "},
            content_type="application/json",
        )
        assert res.status_code == 400

    def test_linked_user_and_is_archived_are_read_only_on_create(
        self, client, second_user
    ):
        """Passare linked_user/is_archived nel payload di creazione viene
        ignorato: sono valorizzati solo dal flusso accept_partner_link /
        destroy() soft-archive, mai da scrittura diretta."""
        res = client.post(
            "/api/split/contacts/",
            data={
                "display_name": "Prova",
                "linked_user": second_user.id,
                "is_archived": True,
            },
            content_type="application/json",
        )

        assert res.status_code == 201, res.content
        data = res.json()
        assert data["linked_user"] is None
        assert data["is_archived"] is False


class TestUpdate:
    def test_patch_display_name_and_color(self, client, split_contact_local):
        res = client.patch(
            f"/api/split/contacts/{split_contact_local.id}/",
            data={"display_name": "Mario aggiornato", "color": "#00ff00"},
            content_type="application/json",
        )
        assert res.status_code == 200
        split_contact_local.refresh_from_db()
        assert split_contact_local.display_name == "Mario aggiornato"
        assert split_contact_local.color == "#00ff00"

    def test_other_user_cannot_patch(self, second_client, split_contact_local):
        res = second_client.patch(
            f"/api/split/contacts/{split_contact_local.id}/",
            data={"display_name": "Hijack"},
            content_type="application/json",
        )
        assert res.status_code == 404
        split_contact_local.refresh_from_db()
        assert split_contact_local.display_name == "Mario (offline)"


class TestDestroySoftArchive:
    def test_delete_unreferenced_contact_is_hard_delete(
        self, client, split_contact_local
    ):
        res = client.delete(f"/api/split/contacts/{split_contact_local.id}/")
        assert res.status_code == 204
        assert not SplitContact.objects.filter(id=split_contact_local.id).exists()

    def test_delete_referenced_contact_soft_archives(
        self, client, test_user, split_contact_local
    ):
        group = SplitGroup.objects.create(name="Gita", created_by=test_user)
        SplitParticipant.objects.create(
            group=group, contact=split_contact_local, added_by=test_user
        )

        res = client.delete(f"/api/split/contacts/{split_contact_local.id}/")

        assert res.status_code == 204
        split_contact_local.refresh_from_db()
        assert split_contact_local.is_archived is True

    def test_archived_contact_hidden_by_default_visible_with_flag(
        self, client, test_user, split_contact_local
    ):
        group = SplitGroup.objects.create(name="Gita", created_by=test_user)
        SplitParticipant.objects.create(
            group=group, contact=split_contact_local, added_by=test_user
        )
        client.delete(f"/api/split/contacts/{split_contact_local.id}/")

        res_default = client.get("/api/split/contacts/")
        ids_default = [c["id"] for c in res_default.json()["results"]]
        assert split_contact_local.id not in ids_default

        res_all = client.get("/api/split/contacts/?include_archived=true")
        ids_all = [c["id"] for c in res_all.json()["results"]]
        assert split_contact_local.id in ids_all

    def test_other_user_cannot_delete(self, second_client, split_contact_local):
        res = second_client.delete(f"/api/split/contacts/{split_contact_local.id}/")
        assert res.status_code == 404
        assert SplitContact.objects.filter(id=split_contact_local.id).exists()


class TestLinkedContact:
    def test_linked_contact_exposes_partner_email(
        self, client, split_contact_linked, second_user
    ):
        res = client.get(f"/api/split/contacts/{split_contact_linked.id}/")
        assert res.status_code == 200
        data = res.json()
        assert data["linked_user"] == second_user.id
        assert data["linked_user_email"] == second_user.email
