"""splitting/tests/test_partner_links_api.py — API di collegamento reciproco
tra utenti fininzen (`/api/split/partner-links/`, piano sez. 1.2/6/8.1):
richiesta per email, email inesistente → 400 user_not_found, richieste
incrociate → auto-accept, doppia richiesta pending → nessun duplicato
(idempotente), accept/decline, contatti reciproci creati all'accettazione.
"""

from django.db import IntegrityError, transaction

import pytest

from splitting.models import SplitContact, SplitPartnerLink
from splitting.services import send_partner_request


class TestSendPartnerRequestServiceLayer:
    """Test diretti su `send_partner_request` (senza passare dalla view),
    per isolare la logica di dominio dal layer HTTP — complementari ai test
    end-to-end via API sotto."""

    def test_cross_partner_request_auto_accepts(self, db, test_user, second_user):
        """Se B invia una richiesta ad A mentre una richiesta PENDING di A
        verso B esiste già, la seconda chiamata auto-accetta invece di
        restare bloccata a metà — e crea i due SplitContact reciproci."""
        link1 = send_partner_request(test_user, second_user.email)
        assert link1.status == "PENDING"

        link2 = send_partner_request(second_user, test_user.email)
        assert link2.id == link1.id
        assert link2.status == "ACCEPTED"

        assert SplitContact.objects.filter(
            owner=test_user, linked_user=second_user
        ).exists()
        assert SplitContact.objects.filter(
            owner=second_user, linked_user=test_user
        ).exists()

    def test_email_lookup_is_case_insensitive(self, db, test_user, second_user):
        link = send_partner_request(test_user, second_user.email.upper())
        assert link.recipient_id == second_user.id


class TestCreateRequest:
    def test_nonexistent_email_returns_400_user_not_found(self, client):
        res = client.post(
            "/api/split/partner-links/",
            data={"email": "ghost@nowhere.test"},
            content_type="application/json",
        )
        assert res.status_code == 400
        assert res.json() == {"error": "user_not_found"}

    def test_self_email_returns_400_cannot_link_self(self, client, test_user):
        res = client.post(
            "/api/split/partner-links/",
            data={"email": test_user.email},
            content_type="application/json",
        )
        assert res.status_code == 400
        assert res.json() == {"error": "cannot_link_self"}

    def test_malformed_email_is_rejected_by_serializer(self, client):
        res = client.post(
            "/api/split/partner-links/",
            data={"email": "not-an-email"},
            content_type="application/json",
        )
        assert res.status_code == 400

    def test_valid_email_creates_pending_link(self, client, test_user, second_user):
        res = client.post(
            "/api/split/partner-links/",
            data={"email": second_user.email},
            content_type="application/json",
        )
        assert res.status_code == 201, res.content
        data = res.json()
        assert data["status"] == "PENDING"
        assert data["requester"] == test_user.id
        assert data["recipient"] == second_user.id
        assert SplitPartnerLink.objects.filter(
            requester=test_user, recipient=second_user, status="PENDING"
        ).exists()

    def test_duplicate_pending_request_does_not_create_a_second_row(
        self, client, test_user, second_user
    ):
        """Due POST identici (stesso mittente/destinatario) mentre una
        richiesta PENDING è già in volo: la seconda chiamata ritorna la
        STESSA riga invece di crearne una seconda in conflitto — evita di
        violare `uniq_pending_split_partner_link` invece di sollevare un
        errore che l'utente non saprebbe risolvere."""
        res1 = client.post(
            "/api/split/partner-links/",
            data={"email": second_user.email},
            content_type="application/json",
        )
        res2 = client.post(
            "/api/split/partner-links/",
            data={"email": second_user.email},
            content_type="application/json",
        )

        assert res1.status_code == 201
        assert res2.status_code == 201
        assert res1.json()["id"] == res2.json()["id"]
        assert (
            SplitPartnerLink.objects.filter(
                requester=test_user, recipient=second_user, status="PENDING"
            ).count()
            == 1
        )

    def test_cross_request_auto_accepts_and_creates_reciprocal_contacts(
        self, client, second_client, test_user, second_user
    ):
        res1 = client.post(
            "/api/split/partner-links/",
            data={"email": second_user.email},
            content_type="application/json",
        )
        assert res1.json()["status"] == "PENDING"
        link_id = res1.json()["id"]

        res2 = second_client.post(
            "/api/split/partner-links/",
            data={"email": test_user.email},
            content_type="application/json",
        )

        assert res2.status_code == 201
        assert res2.json()["id"] == link_id
        assert res2.json()["status"] == "ACCEPTED"
        assert SplitContact.objects.filter(
            owner=test_user, linked_user=second_user
        ).exists()
        assert SplitContact.objects.filter(
            owner=second_user, linked_user=test_user
        ).exists()

    def test_already_accepted_link_is_returned_without_new_pending(
        self, client, second_client, test_user, second_user
    ):
        client.post(
            "/api/split/partner-links/",
            data={"email": second_user.email},
            content_type="application/json",
        )
        second_client.post(
            "/api/split/partner-links/",
            data={"email": test_user.email},
            content_type="application/json",
        )

        res = client.post(
            "/api/split/partner-links/",
            data={"email": second_user.email},
            content_type="application/json",
        )

        assert res.status_code == 201
        assert res.json()["status"] == "ACCEPTED"
        assert (
            SplitPartnerLink.objects.filter(
                requester=test_user, recipient=second_user
            ).count()
            == 1
        )


class TestListSentReceived:
    def test_list_splits_sent_and_received(
        self, client, second_client, test_user, second_user
    ):
        client.post(
            "/api/split/partner-links/",
            data={"email": second_user.email},
            content_type="application/json",
        )

        res_requester = client.get("/api/split/partner-links/")
        assert res_requester.status_code == 200
        body = res_requester.json()
        assert len(body["sent"]) == 1
        assert body["sent"][0]["recipient_email"] == second_user.email
        assert body["received"] == []

        res_recipient = second_client.get("/api/split/partner-links/")
        body2 = res_recipient.json()
        assert body2["sent"] == []
        assert len(body2["received"]) == 1
        assert body2["received"][0]["requester_email"] == test_user.email


class TestAcceptDecline:
    def test_recipient_accepts_pending_link(
        self, client, second_client, test_user, second_user
    ):
        res = client.post(
            "/api/split/partner-links/",
            data={"email": second_user.email},
            content_type="application/json",
        )
        link_id = res.json()["id"]

        res_accept = second_client.post(f"/api/split/partner-links/{link_id}/accept/")

        assert res_accept.status_code == 200
        data = res_accept.json()
        assert data["status"] == "ACCEPTED"
        assert data["responded_at"] is not None
        assert SplitContact.objects.filter(
            owner=test_user, linked_user=second_user
        ).exists()
        assert SplitContact.objects.filter(
            owner=second_user, linked_user=test_user
        ).exists()

    def test_requester_cannot_accept_own_request(self, client, test_user, second_user):
        res = client.post(
            "/api/split/partner-links/",
            data={"email": second_user.email},
            content_type="application/json",
        )
        link_id = res.json()["id"]

        res_accept = client.post(f"/api/split/partner-links/{link_id}/accept/")

        assert res_accept.status_code == 404

    def test_recipient_declines_pending_link(
        self, client, second_client, test_user, second_user
    ):
        res = client.post(
            "/api/split/partner-links/",
            data={"email": second_user.email},
            content_type="application/json",
        )
        link_id = res.json()["id"]

        res_decline = second_client.post(f"/api/split/partner-links/{link_id}/decline/")

        assert res_decline.status_code == 200
        assert res_decline.json()["status"] == "DECLINED"
        assert not SplitContact.objects.filter(
            owner=test_user, linked_user=second_user
        ).exists()

    def test_cannot_accept_already_accepted_link(
        self, client, second_client, test_user, second_user
    ):
        res = client.post(
            "/api/split/partner-links/",
            data={"email": second_user.email},
            content_type="application/json",
        )
        link_id = res.json()["id"]
        second_client.post(f"/api/split/partner-links/{link_id}/accept/")

        res_second_accept = second_client.post(
            f"/api/split/partner-links/{link_id}/accept/"
        )
        assert res_second_accept.status_code == 404


class TestPartnerLinkModelConstraints:
    def test_db_unique_constraint_blocks_duplicate_pending_pair(
        self, db, test_user, second_user
    ):
        """Test a livello DB (bypassando il service layer, che già evita
        questo scenario a monte): la UniqueConstraint
        `uniq_pending_split_partner_link` impedisce comunque due righe
        PENDING per la stessa coppia richiedente/destinatario."""
        SplitPartnerLink.objects.create(requester=test_user, recipient=second_user)

        with pytest.raises(IntegrityError):
            with transaction.atomic():
                SplitPartnerLink.objects.create(
                    requester=test_user, recipient=second_user
                )

    def test_db_check_constraint_blocks_self_link(self, db, test_user):
        with pytest.raises(IntegrityError):
            with transaction.atomic():
                SplitPartnerLink.objects.create(
                    requester=test_user, recipient=test_user
                )
