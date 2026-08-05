"""splitting/tests/test_split_shadow_transactions.py — Sincronizzazione
SplitExpense/SplitSettlement → AssetTransaction ombra (piano sez. 4/8.1).

Criterio principale: la shadow-tx riflette sempre l'INTERO importo della
spesa/del saldo (mai la quota netta del pagatore) — è l'intero importo che è
realmente uscito/entrato sul conto collegato. Nessun client HTTP: i modelli
sono creati/aggiornati/cancellati via ORM per isolare la sincronizzazione dei
signal dal resto dello stack API.
"""

from decimal import Decimal

from portfolio.models import AssetTransaction
from splitting.models import SplitExpense
from splitting.services import apply_split_shares


def _make_expense(group, amount, created_by, *, linked_asset=None):
    return SplitExpense.objects.create(
        group=group,
        description="Cena di gruppo",
        amount=Decimal(amount),
        date="2026-07-01",
        split_method=SplitExpense.EQUAL,
        created_by=created_by,
        linked_asset=linked_asset,
    )


# ── SplitExpense → shadow-tx ─────────────────────────────────────────────


class TestSplitExpenseShadowTransaction:
    def test_split_expense_with_linked_asset_creates_full_amount_shadow_tx(
        self, split_group_with_contact_and_user, test_user, account
    ):
        group, owner_p, member_p, contact_p = split_group_with_contact_and_user
        expense = _make_expense(group, "90.00", test_user, linked_asset=account)
        payload = [
            {"user_id": test_user.id, "is_payer": True},
            {"user_id": member_p.user_id},
            {"contact_id": contact_p.contact_id},
        ]

        apply_split_shares(expense, payload, SplitExpense.EQUAL, added_by=test_user)

        shadow_qs = AssetTransaction.objects.filter(source_split_expense=expense)
        assert shadow_qs.count() == 1
        shadow = shadow_qs.get()
        # L'INTERO importo (90.00), non la quota netta del pagatore (30.00).
        assert shadow.price_per_share == Decimal("90.00")
        assert shadow.transaction_type == AssetTransaction.CASH_OUT
        assert shadow.owner_id == test_user.id
        assert shadow.is_verified is True

        account.refresh_from_db()
        assert account.current_value == Decimal("910.00")  # 1000.00 - 90.00

    def test_shadow_tx_removed_when_expense_deleted(
        self, split_group_with_contact_and_user, test_user, account
    ):
        group, owner_p, member_p, contact_p = split_group_with_contact_and_user
        expense = _make_expense(group, "90.00", test_user, linked_asset=account)
        payload = [
            {"user_id": test_user.id, "is_payer": True},
            {"user_id": member_p.user_id},
            {"contact_id": contact_p.contact_id},
        ]
        apply_split_shares(expense, payload, SplitExpense.EQUAL, added_by=test_user)
        account.refresh_from_db()
        assert account.current_value == Decimal("910.00")

        expense_id = expense.id
        expense.delete()

        assert not AssetTransaction.objects.filter(
            source_split_expense_id=expense_id
        ).exists()
        account.refresh_from_db()
        assert account.current_value == Decimal("1000.00")

    def test_contact_payer_with_no_user_creates_no_shadow_tx(
        self, split_group_with_contact_and_user, test_user, account
    ):
        """Un pagatore senza account fininzen (solo contatto locale) non ha
        un asset reale da toccare: nessuna AssetTransaction viene creata,
        anche se `linked_asset` è valorizzato (edge case difensivo)."""
        group, owner_p, member_p, contact_p = split_group_with_contact_and_user
        expense = _make_expense(group, "90.00", test_user, linked_asset=account)
        payload = [
            {"contact_id": contact_p.contact_id, "is_payer": True},
            {"user_id": test_user.id},
            {"user_id": member_p.user_id},
        ]

        apply_split_shares(expense, payload, SplitExpense.EQUAL, added_by=test_user)

        assert not AssetTransaction.objects.filter(
            source_split_expense=expense
        ).exists()

    def test_changing_linked_asset_moves_shadow_tx_and_restores_old_asset(
        self, split_group_with_two_users, test_user, account
    ):
        """Cambiare (o rimuovere) il linked_asset di una SplitExpense
        esistente ripulisce la shadow-tx sul vecchio asset e ricalcola il suo
        saldo (`_cleanup_old_shadow_split_tx`), poi ne crea una nuova
        sull'asset corrente."""
        group, owner_p, member_p = split_group_with_two_users
        expense = _make_expense(group, "50.00", test_user, linked_asset=account)
        payload = [
            {"user_id": test_user.id, "is_payer": True},
            {"user_id": member_p.user_id},
        ]
        apply_split_shares(expense, payload, SplitExpense.EQUAL, added_by=test_user)
        account.refresh_from_db()
        assert account.current_value == Decimal("950.00")

        expense.linked_asset = None
        expense.save()

        assert not AssetTransaction.objects.filter(
            source_split_expense=expense
        ).exists()
        account.refresh_from_db()
        assert account.current_value == Decimal("1000.00")

    def test_only_the_full_amount_is_ever_written_never_the_net_share(
        self, split_group_with_contact_and_user, test_user, account
    ):
        """Verifica esplicita del criterio di accettazione fase 8.1: con 3
        partecipanti la quota netta sarebbe 30.00, ma la shadow-tx riporta
        sempre e solo l'intero importo (90.00)."""
        group, owner_p, member_p, contact_p = split_group_with_contact_and_user
        expense = _make_expense(group, "90.00", test_user, linked_asset=account)
        payload = [
            {"user_id": test_user.id, "is_payer": True},
            {"user_id": member_p.user_id},
            {"contact_id": contact_p.contact_id},
        ]

        apply_split_shares(expense, payload, SplitExpense.EQUAL, added_by=test_user)

        shadow = AssetTransaction.objects.get(source_split_expense=expense)
        net_quota = expense.shares.get(is_payer=True).share_amount
        assert net_quota == Decimal("30.00")
        assert shadow.price_per_share == expense.amount
        assert shadow.price_per_share != net_quota


# ── SplitSettlement → shadow-tx ─────────────────────────────────────────


class TestSettlementShadowTransaction:
    def test_settlement_created_by_payer_creates_cash_out(
        self, test_user, second_user, account
    ):
        from splitting.models import SplitSettlement

        settlement = SplitSettlement.objects.create(
            payer_user=test_user,
            payee_user=second_user,
            amount=Decimal("50.00"),
            date="2026-07-12",
            created_by=test_user,
            linked_asset=account,
        )
        shadow = AssetTransaction.objects.get(source_split_settlement=settlement)
        assert shadow.transaction_type == AssetTransaction.CASH_OUT
        assert shadow.price_per_share == Decimal("50.00")
        assert shadow.owner_id == test_user.id
        assert shadow.is_verified is True

        account.refresh_from_db()
        assert account.current_value == Decimal("950.00")

    def test_settlement_created_by_payee_creates_cash_in(
        self, test_user, second_user, second_account
    ):
        from splitting.models import SplitSettlement

        settlement = SplitSettlement.objects.create(
            payer_user=test_user,
            payee_user=second_user,
            amount=Decimal("50.00"),
            date="2026-07-12",
            created_by=second_user,
            linked_asset=second_account,
        )
        shadow = AssetTransaction.objects.get(source_split_settlement=settlement)
        assert shadow.transaction_type == AssetTransaction.CASH_IN
        assert shadow.owner_id == second_user.id

        second_account.refresh_from_db()
        assert second_account.current_value == Decimal("550.00")

    def test_settlement_shadow_tx_removed_on_delete(
        self, test_user, second_user, account
    ):
        from splitting.models import SplitSettlement

        settlement = SplitSettlement.objects.create(
            payer_user=test_user,
            payee_user=second_user,
            amount=Decimal("50.00"),
            date="2026-07-12",
            created_by=test_user,
            linked_asset=account,
        )
        account.refresh_from_db()
        assert account.current_value == Decimal("950.00")

        settlement_id = settlement.id
        settlement.delete()

        assert not AssetTransaction.objects.filter(
            source_split_settlement_id=settlement_id
        ).exists()
        account.refresh_from_db()
        assert account.current_value == Decimal("1000.00")

    def test_settlement_without_valid_direction_creates_no_shadow_tx(
        self, test_user, second_user, third_user, account
    ):
        """created_by non coincide né con payer_user né con payee_user (riga
        scritta fuori dal serializer, es. admin/fixture/dati storici):
        nessuna shadow-tx, niente direzione indovinata (difensivo)."""
        from splitting.models import SplitSettlement

        settlement = SplitSettlement.objects.create(
            payer_user=test_user,
            payee_user=second_user,
            amount=Decimal("50.00"),
            date="2026-07-12",
            created_by=third_user,
            linked_asset=account,
        )
        assert not AssetTransaction.objects.filter(
            source_split_settlement=settlement
        ).exists()

    def test_settlement_without_linked_asset_creates_no_shadow_tx(
        self, test_user, second_user
    ):
        from splitting.models import SplitSettlement

        settlement = SplitSettlement.objects.create(
            payer_user=test_user,
            payee_user=second_user,
            amount=Decimal("50.00"),
            date="2026-07-12",
            created_by=test_user,
        )
        assert not AssetTransaction.objects.filter(
            source_split_settlement=settlement
        ).exists()


# ── _bulk_state.skip_recompute rispettato anche lato Split ──────────────
#
# Prima dell'estrazione in portfolio.ledger_sync, solo expenses/signals.py
# controllava _bulk_state.skip_recompute; splitting/signals.py ricalcolava
# sempre sincronamente. sync_shadow_tx/remove_shadow_tx lo controllano ora
# una volta sola, per entrambe le sorgenti — questi test lo verificano
# esplicitamente lato Split (assente prima, perché il controllo non c'era).


class TestSkipRecomputeRespectedForSplit:
    def test_split_expense_sync_defers_recompute_when_skip_recompute_set(
        self, split_group_with_two_users, test_user, account
    ):
        from portfolio.services import _refresh_manual_asset_strict
        from portfolio.signals import _bulk_state

        group, owner_p, member_p = split_group_with_two_users
        expense = _make_expense(group, "50.00", test_user, linked_asset=account)
        payload = [
            {"user_id": test_user.id, "is_payer": True},
            {"user_id": member_p.user_id},
        ]

        _bulk_state.skip_recompute = True
        try:
            apply_split_shares(expense, payload, SplitExpense.EQUAL, added_by=test_user)
        finally:
            _bulk_state.skip_recompute = False

        # La shadow-tx viene comunque scritta subito...
        shadow = AssetTransaction.objects.get(source_split_expense=expense)
        assert shadow.price_per_share == Decimal("50.00")
        # ...ma il saldo cache dell'asset non è stato ricalcolato sincronamente.
        account.refresh_from_db()
        assert account.current_value == Decimal("1000.00")

        _refresh_manual_asset_strict(account)
        account.refresh_from_db()
        assert account.current_value == Decimal("950.00")

    def test_settlement_removal_defers_recompute_when_skip_recompute_set(
        self, test_user, second_user, account
    ):
        from portfolio.services import _refresh_manual_asset_strict
        from portfolio.signals import _bulk_state
        from splitting.models import SplitSettlement

        settlement = SplitSettlement.objects.create(
            payer_user=test_user,
            payee_user=second_user,
            amount=Decimal("50.00"),
            date="2026-07-12",
            created_by=test_user,
            linked_asset=account,
        )
        account.refresh_from_db()
        assert account.current_value == Decimal("950.00")

        settlement_id = settlement.id
        _bulk_state.skip_recompute = True
        try:
            settlement.delete()
        finally:
            _bulk_state.skip_recompute = False

        assert not AssetTransaction.objects.filter(
            source_split_settlement_id=settlement_id
        ).exists()
        # Shadow-tx già rimossa, ma il saldo cache non è stato ricalcolato.
        account.refresh_from_db()
        assert account.current_value == Decimal("950.00")

        _refresh_manual_asset_strict(account)
        account.refresh_from_db()
        assert account.current_value == Decimal("1000.00")
