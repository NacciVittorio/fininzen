"""splitting/tests/conftest.py — fixture riusabili per l'intera suite Split.

`test_user` e `client` (Django test Client, force_login) vengono dal
conftest.py di root. Qui: un secondo/terzo utente pronti per gli scenari
multi-persona, i loro Client() già autenticati, un contatto locale, un
contatto collegato (via il flusso reale richiesta+accettazione, non creato a
mano), due varianti di gruppo (2 utenti / 2 utenti + 1 contatto locale) e i
conti bancari manuali usati dai test di shadow-transaction.
"""

from decimal import Decimal

import pytest
from django.contrib.auth.models import User
from django.test import Client

from expenses.models import Category
from portfolio.models import Asset, AssetTransaction, InvestmentType
from splitting.models import SplitContact, SplitGroup, SplitParticipant
from splitting.services import accept_partner_link, send_partner_request


@pytest.fixture
def second_user(db):
    return User.objects.create_user(
        username="seconduser", email="second@test.com", password="testpass123"
    )


@pytest.fixture
def third_user(db):
    return User.objects.create_user(
        username="thirduser", email="third@test.com", password="testpass123"
    )


@pytest.fixture
def second_client(second_user):
    c = Client()
    c.force_login(second_user)
    return c


@pytest.fixture
def third_client(third_user):
    c = Client()
    c.force_login(third_user)
    return c


@pytest.fixture
def split_contact_local(test_user):
    """Contatto locale: solo nome, nessun account fininzen collegato."""
    return SplitContact.objects.create(owner=test_user, display_name="Mario (offline)")


@pytest.fixture
def split_contact_linked(test_user, second_user):
    """SplitContact di `test_user` collegato a `second_user`, creato dal
    flusso reale richiesta → accettazione (non a mano) — garantisce che
    esista anche il contatto reciproco su `second_user`."""
    link = send_partner_request(test_user, second_user.email)
    accept_partner_link(link)
    return SplitContact.objects.get(owner=test_user, linked_user=second_user)


@pytest.fixture
def split_group_with_two_users(test_user, second_user):
    """Gruppo con `test_user` (creatore) e `second_user` come membri attivi."""
    group = SplitGroup.objects.create(name="Viaggio a Roma", created_by=test_user)
    owner_p = SplitParticipant.objects.create(
        group=group, user=test_user, added_by=test_user
    )
    member_p = SplitParticipant.objects.create(
        group=group, user=second_user, added_by=test_user
    )
    return group, owner_p, member_p


@pytest.fixture
def split_group_with_contact_and_user(test_user, second_user, split_contact_local):
    """Gruppo a 3 partecipanti: creatore, un utente registrato, un contatto
    locale — lo scenario "ibrido" ricorrente in tutta la suite."""
    group = SplitGroup.objects.create(name="Weekend", created_by=test_user)
    owner_p = SplitParticipant.objects.create(
        group=group, user=test_user, added_by=test_user
    )
    member_p = SplitParticipant.objects.create(
        group=group, user=second_user, added_by=test_user
    )
    contact_p = SplitParticipant.objects.create(
        group=group, contact=split_contact_local, added_by=test_user
    )
    return group, owner_p, member_p, contact_p


@pytest.fixture
def expense_cat(test_user):
    return Category.objects.create(
        name="Food", category_type=Category.EXPENSE, owner=test_user
    )


@pytest.fixture
def bank_type(test_user):
    return InvestmentType.objects.create(
        name="Bank", is_bank_account=True, supports_ticker=False, owner=test_user
    )


@pytest.fixture
def account(test_user, bank_type):
    """Conto manuale di `test_user`, saldo iniziale 1000.00 (CASH_IN
    verificato) — usato dai test di shadow-transaction/settlement."""
    acc = Asset.objects.create(
        name="Checking",
        tracking_type=Asset.MANUAL,
        investment_type=bank_type,
        owner=test_user,
    )
    AssetTransaction.objects.create(
        asset=acc,
        transaction_type=AssetTransaction.CASH_IN,
        date="2026-01-01",
        shares=Decimal("1"),
        price_per_share=Decimal("1000.00"),
        is_verified=True,
        owner=test_user,
    )
    acc.recompute_from_transactions()
    return acc


@pytest.fixture
def second_bank_type(second_user):
    return InvestmentType.objects.create(
        name="Bank2", is_bank_account=True, supports_ticker=False, owner=second_user
    )


@pytest.fixture
def second_account(second_user, second_bank_type):
    """Conto manuale di `second_user`, saldo iniziale 500.00."""
    acc = Asset.objects.create(
        name="Checking2",
        tracking_type=Asset.MANUAL,
        investment_type=second_bank_type,
        owner=second_user,
    )
    AssetTransaction.objects.create(
        asset=acc,
        transaction_type=AssetTransaction.CASH_IN,
        date="2026-01-01",
        shares=Decimal("1"),
        price_per_share=Decimal("500.00"),
        is_verified=True,
        owner=second_user,
    )
    acc.recompute_from_transactions()
    return acc
