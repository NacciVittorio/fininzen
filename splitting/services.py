"""
splitting/services.py — Business logic pura per la feature Split.

Le funzioni qui non dipendono da request/Response — sono testabili senza
Client() (vedi splitting/tests/test_smoke.py), sullo stesso principio di
expenses/services.py.
"""

import calendar
import logging
from datetime import date as date_cls
from decimal import ROUND_HALF_UP, Decimal

from django.contrib.auth.models import User
from django.db import IntegrityError, transaction
from django.db.models import Q
from django.utils import timezone

from .models import (
    SplitContact,
    SplitExpense,
    SplitExpenseShare,
    SplitGroup,
    SplitParticipant,
    SplitPartnerLink,
    SplitRecurringExpense,
    SplitRecurringExpenseParticipant,
    SplitSettlement,
)

logger = logging.getLogger(__name__)

_CENT = Decimal("0.01")


class SplitServiceError(Exception):
    """Domain error with a stable, machine-readable code (mirrors GrantsView's
    ``{"error": "user_not_found"}`` convention) so callers (serializers/views)
    can map it to a 400 response without string-matching free text."""


# ── Partner links (mirror GrantsView.post / GrantDetailView) ───────────────


def send_partner_request(requester, email):
    """Resolve `email` to an existing User exactly like GrantsView.post():
    no real email is ever sent, the request just targets an existing account.

    Raises SplitServiceError("user_not_found") if no such user exists, or
    SplitServiceError("cannot_link_self") for a self-request. A PENDING
    request already sitting in the opposite direction is auto-accepted
    instead of creating a second, symmetrical PENDING request that would
    otherwise deadlock (both sides waiting on the other to accept).
    """
    email = (email or "").strip().lower()
    if not email:
        raise SplitServiceError("email_required")

    recipient = User.objects.filter(email__iexact=email).first()
    if not recipient:
        raise SplitServiceError("user_not_found")
    if recipient.id == requester.id:
        raise SplitServiceError("cannot_link_self")

    opposite_pending = SplitPartnerLink.objects.filter(
        requester=recipient, recipient=requester, status=SplitPartnerLink.PENDING
    ).first()
    if opposite_pending:
        return accept_partner_link(opposite_pending)

    existing_pending = SplitPartnerLink.objects.filter(
        requester=requester, recipient=recipient, status=SplitPartnerLink.PENDING
    ).first()
    if existing_pending:
        return existing_pending

    already_linked = SplitPartnerLink.objects.filter(
        Q(requester=requester, recipient=recipient)
        | Q(requester=recipient, recipient=requester),
        status=SplitPartnerLink.ACCEPTED,
    ).first()
    if already_linked:
        return already_linked

    link = SplitPartnerLink.objects.create(requester=requester, recipient=recipient)
    logger.info(
        "send_partner_request: requester=%s recipient=%s link=%s",
        requester,
        recipient,
        link.id,
    )
    return link


def _display_name_for(user):
    profile = getattr(user, "profile", None)
    name = getattr(profile, "name", "") if profile else ""
    return name or user.email or user.username


def accept_partner_link(link):
    """Accept a PENDING link and create/refresh the reciprocal SplitContact
    for both users, atomically (both writes succeed or neither does)."""
    with transaction.atomic():
        link.status = SplitPartnerLink.ACCEPTED
        link.responded_at = timezone.now()
        link.save(update_fields=["status", "responded_at"])
        for owner, linked in (
            (link.requester, link.recipient),
            (link.recipient, link.requester),
        ):
            SplitContact.objects.update_or_create(
                owner=owner,
                linked_user=linked,
                defaults={
                    "display_name": _display_name_for(linked),
                    "is_archived": False,
                },
            )
    logger.info("accept_partner_link: link=%s accepted", link.id)
    return link


def decline_partner_link(link):
    link.status = SplitPartnerLink.DECLINED
    link.responded_at = timezone.now()
    link.save(update_fields=["status", "responded_at"])
    logger.info("decline_partner_link: link=%s declined", link.id)
    return link


# ── Quote calculation (ROUND_HALF_UP, same convention as expenses/cashflow.py
#    and portfolio/models.py — Decimal's default ROUND_HALF_EVEN would drift
#    cents shown here from the rest of the app). ───────────────────────────


def _q2(value):
    return Decimal(value).quantize(_CENT, rounding=ROUND_HALF_UP)


def _distribute_remainder(total, raw_shares):
    """Round every share to cents, then redistribute the residual cent drift
    (e.g. 100/3 = 33.33+33.33+33.33 = 99.99 → +0.01 to the first) so that
    sum(shares) == total exactly."""
    if not raw_shares:
        raise SplitServiceError("no_participants")
    total = _q2(total)
    quantized = [_q2(s) for s in raw_shares]
    diff_cents = int(((total - sum(quantized)) / _CENT).to_integral_value())
    step = _CENT if diff_cents > 0 else -_CENT
    for i in range(abs(diff_cents)):
        quantized[i % len(quantized)] += step
    if any(q < 0 for q in quantized):
        raise SplitServiceError("shares_too_skewed")
    return quantized


def compute_equal_shares(total, n):
    if not n or n <= 0:
        raise SplitServiceError("no_participants")
    total = Decimal(total)
    base = total / n
    return _distribute_remainder(total, [base] * n)


def compute_exact_shares(total, exact_amounts):
    if not exact_amounts:
        raise SplitServiceError("no_participants")
    total = Decimal(total)
    amounts = [Decimal(a) for a in exact_amounts]
    # SECURITY FIX (revisione fase 9, MEDIUM): solo la somma aggregata era
    # validata (== total) — un singolo importo negativo che comunque
    # compensava la somma (es. [150, -50] con total=100) arrivava intatto
    # fino a bulk_create() in apply_split_shares, violando il
    # CheckConstraint DB `split_share_amount_non_negative` con un
    # IntegrityError non gestito (500) invece di un 400 di validazione.
    if any(a < 0 for a in amounts):
        raise SplitServiceError("negative_share_input")
    if _q2(sum(amounts)) != _q2(total):
        raise SplitServiceError("exact_amounts_mismatch")
    return [_q2(a) for a in amounts]


def compute_percentage_shares(total, percentages):
    if not percentages:
        raise SplitServiceError("no_participants")
    total = Decimal(total)
    pcts = [Decimal(p) for p in percentages]
    # SECURITY FIX: vedi nota in compute_exact_shares — stesso problema con
    # una percentuale negativa che compensa un'altra oltre 100 (es. [150,-50]).
    if any(p < 0 for p in pcts):
        raise SplitServiceError("negative_share_input")
    if _q2(sum(pcts)) != Decimal("100.00"):
        raise SplitServiceError("percentages_not_100")
    raw = [total * p / Decimal(100) for p in pcts]
    return _distribute_remainder(total, raw)


def compute_weighted_shares(total, weights):
    if not weights:
        raise SplitServiceError("no_participants")
    total = Decimal(total)
    w = [Decimal(x) for x in weights]
    # SECURITY FIX: vedi nota in compute_exact_shares — un peso negativo
    # combinato con uno maggiore può comunque dare total_weight > 0.
    if any(x < 0 for x in w):
        raise SplitServiceError("negative_share_input")
    total_weight = sum(w)
    if total_weight <= 0:
        raise SplitServiceError("weights_not_positive")
    raw = [total * x / total_weight for x in w]
    return _distribute_remainder(total, raw)


# ── Shares application (delete + bulk_create inside one transaction) ───────


def _resolve_participant(expense, entry, *, added_by):
    """Resolve (and, for standalone expenses, create) the SplitParticipant
    identified by entry["user_id"] xor entry["contact_id"].

    Group expenses only accept participants who are already active members
    of the group — group membership is managed exclusively through the
    groups/{id}/members/ endpoint, never implicitly from an expense payload.
    """
    user_id = entry.get("user_id")
    contact_id = entry.get("contact_id")
    if bool(user_id) == bool(contact_id):
        raise SplitServiceError("participant_identity_invalid")

    identity = {"user_id": user_id} if user_id else {"contact_id": contact_id}

    if expense.group_id:
        participant = SplitParticipant.objects.filter(
            group_id=expense.group_id, is_active=True, **identity
        ).first()
        if participant is None:
            raise SplitServiceError("participant_not_in_group")
        return participant

    # SECURITY FIX (revisione fase 9, HIGH): a differenza del path di gruppo
    # sopra — dove il partecipante è già stato vetted da
    # /groups/{id}/members/ (is_linked_partner / owner=request.user) — qui,
    # per una spesa occasionale, il SplitParticipant viene creato al volo da
    # uno user_id/contact_id grezzo passato dal chiamante. Senza gli stessi
    # controlli di consenso applicati in views/groups.py::members():
    #   - un user_id arbitrario poteva essere agganciato alla spesa senza
    #     alcuna relazione (SplitPartnerLink accettato) con `added_by`,
    #     facendo comparire un debito fabbricato nell'account altrui mai
    #     richiesto né accettato;
    #   - un contact_id poteva referenziare la rubrica PRIVATA di un altro
    #     utente per solo id, senza alcun controllo di ownership;
    #   - uno user_id inesistente arrivava intatto fino a
    #     get_or_create(), sollevando un IntegrityError (FK) non gestito
    #     (500) invece di un errore di validazione pulito (400).
    if user_id:
        is_self = user_id == added_by.id
        is_linked_partner = SplitContact.objects.filter(
            owner=added_by, linked_user_id=user_id, is_archived=False
        ).exists()
        if not (is_self or is_linked_partner):
            raise SplitServiceError("not_a_linked_partner")
    else:
        if not SplitContact.objects.filter(pk=contact_id, owner=added_by).exists():
            raise SplitServiceError("contact_not_found")

    participant, _created = SplitParticipant.objects.get_or_create(
        standalone_expense=expense,
        defaults={"added_by": added_by},
        **identity,
    )
    return participant


_METHOD_TO_COMPUTE = {
    SplitExpense.EQUAL: None,  # handled separately: needs `n`, not raw_input
    SplitExpense.EXACT: compute_exact_shares,
    SplitExpense.PERCENTAGE: compute_percentage_shares,
    SplitExpense.SHARES: compute_weighted_shares,
}


def apply_split_shares(expense, participants_payload, split_method, *, added_by):
    """Rewrite `expense`'s shares from scratch, atomically.

    `participants_payload`: list of dicts with keys
      - user_id | contact_id (exactly one)
      - raw_input: Decimal|None (required for exact/percentage/shares)
      - is_payer: bool (exactly one entry must be True)

    Resolves/creates the underlying SplitParticipant rows, computes amounts
    for `split_method`, deletes any existing SplitExpenseShare rows for the
    expense and bulk_creates the new ones — same delete+bulk_create pattern
    used elsewhere in the app for full-replace child collections. For
    standalone (non-group) expenses, ad-hoc SplitParticipant rows that fell
    out of the payload are pruned once their shares are gone.
    """
    if not participants_payload:
        raise SplitServiceError("no_participants")

    payer_entries = [e for e in participants_payload if e.get("is_payer")]
    if len(payer_entries) != 1:
        raise SplitServiceError("single_payer_required")

    identity_keys = [
        (e.get("user_id"), e.get("contact_id")) for e in participants_payload
    ]
    if len(identity_keys) != len(set(identity_keys)):
        raise SplitServiceError("duplicate_participant")

    if split_method != SplitExpense.EQUAL:
        if any(e.get("raw_input") is None for e in participants_payload):
            raise SplitServiceError("raw_input_required")

    with transaction.atomic():
        # Piano Batch 4.7: without a row lock, two concurrent edits of the
        # same expense could interleave their delete-then-bulk_create passes
        # — no error, just a silent last-write-wins with no conflict signal.
        # select_for_update() is a no-op on SQLite (dev/test backend) but
        # keeps this correct under PostgreSQL (same pattern as
        # portfolio/services.py::_recompute_asset_locked). `expense` itself
        # has no scalar fields mutated here, so re-pointing every subsequent
        # use at the locked copy is enough — no mirror-back needed.
        expense = SplitExpense.objects.select_for_update().get(pk=expense.pk)

        # Piano Batch 3 (modello A2): cattura le coppie direzionali PRIMA
        # della cancellazione — dopo, le shares (e le loro allocazioni,
        # CASCADE) sono già sparite e non c'è più nulla da leggere.
        from .allocations import (
            _identity_pairs_for_share,
            rebuild_allocations_for_directed_pair,
        )

        old_pairs = {
            pair
            for pair in (
                _identity_pairs_for_share(share)
                for share in expense.shares.filter(is_payer=False).select_related(
                    "expense", "participant"
                )
            )
            if pair is not None
        }

        expense.shares.all().delete()

        resolved = [
            (_resolve_participant(expense, entry, added_by=added_by), entry)
            for entry in participants_payload
        ]

        if split_method == SplitExpense.EQUAL:
            amounts = compute_equal_shares(expense.amount, len(resolved))
        else:
            compute_fn = _METHOD_TO_COMPUTE.get(split_method)
            if compute_fn is None:
                raise SplitServiceError("invalid_split_method")
            amounts = compute_fn(
                expense.amount, [entry.get("raw_input") for _, entry in resolved]
            )

        shares = [
            SplitExpenseShare(
                expense=expense,
                participant=participant,
                share_amount=amount,
                raw_input=entry.get("raw_input"),
                is_payer=bool(entry.get("is_payer")),
            )
            for (participant, entry), amount in zip(resolved, amounts)
        ]
        SplitExpenseShare.objects.bulk_create(shares)

        new_pairs = {
            pair
            for pair in (
                _identity_pairs_for_share(share)
                for share in shares
                if not share.is_payer
            )
            if pair is not None
        }
        for debtor_key, creditor_key in old_pairs | new_pairs:
            rebuild_allocations_for_directed_pair(debtor_key, creditor_key)

        if expense.group_id is None:
            kept_ids = {participant.id for participant, _ in resolved}
            SplitParticipant.objects.filter(standalone_expense=expense).exclude(
                id__in=kept_ids
            ).delete()

        # NOTE (mirror deviation, vedi splitting/signals.py docstring): il
        # post_save su SplitExpense da solo non basta a sincronizzare la
        # shadow-tx dell'asset, perché "chi è il pagatore" vive qui, sulle
        # shares appena scritte, non sul post_save iniziale di
        # SplitExpense.objects.create() (che scatta a shares ancora vuote).
        # Richiamo esplicito, sempre dentro la stessa transazione atomica.
        from .signals import _sync_shadow_for_expense

        _sync_shadow_for_expense(expense)

    return shares


def delete_split_expense(expense):
    """Cancella `expense` e ricostruisce le allocazioni A2 delle coppie
    direzionali coinvolte (piano Batch 3).

    Funzione di servizio esplicita, NON un signal pre_delete puro — stesso
    motivo di fragilità già documentato in splitting/signals.py per
    SplitExpense (un post_save/pre_delete da solo non è sempre sufficiente a
    catturare lo stato "giusto" nel momento giusto; qui serve leggere le
    coppie PRIMA della cancellazione e ricostruire DOPO, nello stesso posto,
    non affidato all'ordine implicito dei signal). Va chiamata al posto di
    `expense.delete()` ovunque una SplitExpense debba essere rimossa
    singolarmente (SplitExpenseViewSet.perform_destroy) — la cancellazione a
    cascata di un intero SplitGroup passa invece da
    SplitGroupViewSet.destroy(), che non transita da qui.
    """
    with transaction.atomic():
        from .allocations import (
            _identity_pairs_for_share,
            rebuild_allocations_for_directed_pair,
        )

        pairs = {
            pair
            for pair in (
                _identity_pairs_for_share(share)
                for share in expense.shares.filter(is_payer=False).select_related(
                    "expense", "participant"
                )
            )
            if pair is not None
        }

        expense.delete()

        for debtor_key, creditor_key in pairs:
            rebuild_allocations_for_directed_pair(debtor_key, creditor_key)


# ── Ricorrenze (piano sez. 1.7/3.4) — mirror di expenses/services.py ────────
#
# Stessa struttura di generate_recurring_expenses/backfill_recurring_expense/
# _create_occurrence_if_missing/disable_expired_recurrings, adattata a
# SplitRecurringExpense: qui non esiste un `owner` diretto (piano sez. 0.1),
# quindi ogni funzione che nell'originale filtra su `owner=user` filtra qui
# sui gruppi dove `user` è membro ATTIVO (`group__participants__user=user,
# group__participants__is_active=True`).


def _is_split_recurring_active_on(
    rec: SplitRecurringExpense, target_date: date_cls
) -> bool:
    if rec.status != SplitRecurringExpense.STATUS_ACTIVE or not rec.is_active:
        return False
    if target_date < rec.start_date:
        return False
    if rec.end_date and target_date > rec.end_date:
        return False
    return True


def _split_occurrence_date(
    rec: SplitRecurringExpense, year: int, month: int
) -> date_cls | None:
    if rec.frequency == SplitRecurringExpense.FREQUENCY_YEARLY:
        due_month = rec.month_of_year or rec.start_date.month
        if month != due_month:
            return None
    day = min(rec.day_of_month, calendar.monthrange(year, month)[1])
    return date_cls(year, month, day)


def _split_recurring_already_generated(
    rec: SplitRecurringExpense, occurrence_date: date_cls
) -> bool:
    return SplitExpense.objects.filter(
        recurring_source=rec, recurring_occurrence_date=occurrence_date
    ).exists()


def _next_month(current: date_cls) -> date_cls:
    if current.month == 12:
        return date_cls(current.year + 1, 1, 1)
    return date_cls(current.year, current.month + 1, 1)


def disable_expired_split_recurrings(user) -> int:
    """Disable active split recurrings whose end_date is before today,
    scoped to groups where `user` is an active member (piano sez. 3.4: qui
    non esiste un owner diretto come in expenses.RecurringExpense)."""
    today = timezone.localdate()
    now = timezone.now()
    updated = SplitRecurringExpense.objects.filter(
        group__participants__user=user,
        group__participants__is_active=True,
        status=SplitRecurringExpense.STATUS_ACTIVE,
        is_active=True,
        end_date__isnull=False,
        end_date__lt=today,
    ).update(
        status=SplitRecurringExpense.STATUS_DISABLED,
        is_active=False,
        disabled_at=now,
    )
    return updated


def _disable_split_recurring_if_expired(rec: SplitRecurringExpense) -> None:
    """Equivalente mirato, per un SOLO `rec`, del passo iniziale di
    expenses/services.py::backfill_recurring_expense
    ("disable_expired_recurrings(rec.owner)").

    DEVIAZIONE MINORE (segnalata nel riepilogo finale): l'originale fa uno
    sweep su TUTTE le ricorrenze di `rec.owner`, perché owner è un campo
    diretto sempre valido. Qui non esiste un owner singolo (piano sez. 0.1):
    `disable_expired_split_recurrings(user)` filtra sui gruppi dove `user` è
    membro ATTIVO, quindi se il creatore della ricorrenza avesse nel
    frattempo lasciato il gruppo uno sweep-per-utente non la troverebbe più.
    Il controllo diretto sul singolo `rec` è quindi più corretto oltre che
    più semplice — nessuna perdita di copertura rispetto all'originale.
    """
    today = timezone.localdate()
    if (
        rec.status == SplitRecurringExpense.STATUS_ACTIVE
        and rec.is_active
        and rec.end_date
        and rec.end_date < today
    ):
        now = timezone.now()
        SplitRecurringExpense.objects.filter(pk=rec.pk).update(
            status=SplitRecurringExpense.STATUS_DISABLED,
            is_active=False,
            disabled_at=now,
        )
        rec.status = SplitRecurringExpense.STATUS_DISABLED
        rec.is_active = False
        rec.disabled_at = now


def _identity_entry(participant: SplitParticipant, **extra):
    entry = dict(extra)
    if participant.user_id:
        entry["user_id"] = participant.user_id
    else:
        entry["contact_id"] = participant.contact_id
    return entry


def _resolve_recurring_participants_payload(rec: SplitRecurringExpense) -> list[dict]:
    """Costruisce il payload per apply_split_shares() di UNA occorrenza
    generata di `rec` (piano sez. 1.7/3.4).

    exact/percentage/shares: ogni SplitRecurringExpenseParticipant
    persistita diventa una entry del payload (raw_input incluso).
    equal: sul template è persistita SOLO la riga del pagatore — il resto
    del payload è il roster ATTUALE (attivo ora, non congelato alla
    creazione) del gruppo, ciascuna entry senza raw_input (non richiesto per
    una divisione equa).
    """
    templates = list(
        rec.participant_templates.select_related(
            "participant__user", "participant__contact"
        )
    )
    payer_template = next((t for t in templates if t.is_payer), None)
    if payer_template is None:
        raise SplitServiceError("payer_required")

    if rec.split_method == SplitExpense.EQUAL:
        active_members = list(rec.group.participants.filter(is_active=True))
        if payer_template.participant_id not in {m.id for m in active_members}:
            raise SplitServiceError("payer_not_active_member")
        return [
            _identity_entry(
                member, is_payer=(member.id == payer_template.participant_id)
            )
            for member in active_members
        ]

    return [
        _identity_entry(t.participant, raw_input=t.raw_input, is_payer=t.is_payer)
        for t in templates
    ]


def apply_split_recurring_participants(
    rec: SplitRecurringExpense, participants_payload
) -> list[SplitRecurringExpenseParticipant]:
    """Riscrive da zero, atomicamente, il template dei partecipanti di
    `rec` (stesso pattern delete+bulk_create di apply_split_shares).

    Ogni partecipante deve già essere un membro ATTIVO del gruppo di `rec`
    (`rec.group`) — niente aggiunta implicita di membri da qui, esattamente
    come per apply_split_shares sulle spese di gruppo.

    Per split_method=EQUAL viene persistita SOLO la riga del pagatore (vedi
    _resolve_recurring_participants_payload): il resto del roster è dedotto
    dal gruppo al momento della generazione, non congelato qui.
    """
    if not participants_payload:
        raise SplitServiceError("no_participants")

    payer_entries = [e for e in participants_payload if e.get("is_payer")]
    if len(payer_entries) != 1:
        raise SplitServiceError("single_payer_required")

    identity_keys = [
        (e.get("user_id"), e.get("contact_id")) for e in participants_payload
    ]
    if len(identity_keys) != len(set(identity_keys)):
        raise SplitServiceError("duplicate_participant")

    if rec.split_method != SplitExpense.EQUAL:
        if any(e.get("raw_input") is None for e in participants_payload):
            raise SplitServiceError("raw_input_required")
        entries = participants_payload
    else:
        entries = payer_entries

    with transaction.atomic():
        rec.participant_templates.all().delete()

        templates = []
        for entry in entries:
            user_id = entry.get("user_id")
            contact_id = entry.get("contact_id")
            if bool(user_id) == bool(contact_id):
                raise SplitServiceError("participant_identity_invalid")
            identity = {"user_id": user_id} if user_id else {"contact_id": contact_id}
            participant = SplitParticipant.objects.filter(
                group_id=rec.group_id, is_active=True, **identity
            ).first()
            if participant is None:
                raise SplitServiceError("participant_not_in_group")
            templates.append(
                SplitRecurringExpenseParticipant(
                    recurring=rec,
                    participant=participant,
                    raw_input=entry.get("raw_input"),
                    is_payer=bool(entry.get("is_payer")),
                )
            )
        SplitRecurringExpenseParticipant.objects.bulk_create(templates)

    return templates


def _create_split_occurrence_if_missing(
    rec: SplitRecurringExpense, occurrence_date: date_cls
) -> bool:
    """Mirror di expenses/services.py::_create_occurrence_if_missing: crea
    la SplitExpense dell'occorrenza (get_or_create su recurring_source +
    recurring_occurrence_date, protetto dalla UniqueConstraint
    `uniq_split_rec_occ`) e le sue shares, nella STESSA transazione — mai
    un'occorrenza senza quote.

    IntegrityError = race tra generatori concorrenti sulla stessa occorrenza
    (stesso significato dell'originale). SplitServiceError = template/roster
    non più valido (es. il pagatore ha lasciato il gruppo dopo la creazione
    della ricorrenza): l'occorrenza viene saltata invece di bloccare la
    generazione dell'intero batch mensile dell'utente.
    """
    try:
        with transaction.atomic():
            expense, created = SplitExpense.objects.get_or_create(
                recurring_source=rec,
                recurring_occurrence_date=occurrence_date,
                defaults={
                    "group": rec.group,
                    "description": rec.description,
                    "amount": rec.amount,
                    "date": occurrence_date,
                    "split_method": rec.split_method,
                    "category": rec.category,
                    "linked_asset": rec.linked_asset,
                    "created_by": rec.created_by,
                },
            )
            if not created:
                return False
            participants_payload = _resolve_recurring_participants_payload(rec)
            apply_split_shares(
                expense,
                participants_payload,
                rec.split_method,
                added_by=rec.created_by,
            )
            return True
    except IntegrityError:
        logger.warning(
            "_create_split_occurrence_if_missing: race su rec=%s occurrence=%s",
            rec.id,
            occurrence_date,
        )
        return False
    except SplitServiceError:
        logger.exception(
            "_create_split_occurrence_if_missing: template non valido per "
            "rec=%s occurrence=%s",
            rec.id,
            occurrence_date,
        )
        return False


def generate_split_recurring_expenses(user, year: int, month: int) -> dict:
    """Mirror di expenses/services.py::generate_recurring_expenses: genera le
    SplitExpense per le SplitRecurringExpense attive dei gruppi dove `user`
    è membro attivo, per il mese/anno indicato. Salta le occorrenze già
    esistenti. Ritorna {"created", "skipped"}."""
    logger.info(
        "generate_split_recurring_expenses: user=%s year=%s month=%s",
        user,
        year,
        month,
    )
    disable_expired_split_recurrings(user)
    recurrings = (
        SplitRecurringExpense.objects.filter(
            group__participants__user=user,
            group__participants__is_active=True,
            status=SplitRecurringExpense.STATUS_ACTIVE,
            is_active=True,
        )
        .select_related("group", "category", "linked_asset")
        .distinct()
    )
    created_count = 0
    skipped_count = 0

    for rec in recurrings:
        exp_date = _split_occurrence_date(rec, year, month)
        if exp_date is None:
            skipped_count += 1
            continue
        if not _is_split_recurring_active_on(rec, exp_date):
            skipped_count += 1
            continue
        if _create_split_occurrence_if_missing(rec, exp_date):
            created_count += 1
        else:
            skipped_count += 1

    logger.info(
        "generate_split_recurring_expenses: done — created=%s skipped=%s",
        created_count,
        skipped_count,
    )
    return {"created": created_count, "skipped": skipped_count}


def backfill_recurring_split_expense(rec: SplitRecurringExpense) -> dict:
    """Mirror di expenses/services.py::backfill_recurring_expense: crea le
    occorrenze mancanti da `start_date` al mese corrente."""
    _disable_split_recurring_if_expired(rec)
    today = timezone.localdate()
    if rec.status != SplitRecurringExpense.STATUS_ACTIVE or not rec.is_active:
        return {"created": 0, "skipped": 0}

    start_month = date_cls(rec.start_date.year, rec.start_date.month, 1)
    end_cap = rec.end_date if rec.end_date else today
    end_month = date_cls(end_cap.year, end_cap.month, 1)
    if start_month > end_month:
        return {"created": 0, "skipped": 0}

    created = 0
    skipped = 0
    current = start_month
    while current <= end_month:
        occurrence_date = _split_occurrence_date(rec, current.year, current.month)
        if occurrence_date is None:
            skipped += 1
            current = _next_month(current)
            continue
        if _is_split_recurring_active_on(rec, occurrence_date):
            if _create_split_occurrence_if_missing(rec, occurrence_date):
                created += 1
            else:
                skipped += 1
        else:
            skipped += 1
        current = _next_month(current)
    return {"created": created, "skipped": skipped}


def split_recurring_status(user, year: int, month: int) -> dict:
    """Mirror di expenses/services.py::recurring_status, per il widget
    ricorrenze del tab Split: per ogni ricorrente attiva dei gruppi dove
    `user` è membro attivo, indica se l'occorrenza del mese target è già
    stata generata o è in attesa."""
    disable_expired_split_recurrings(user)
    recurrings = (
        SplitRecurringExpense.objects.filter(
            group__participants__user=user,
            group__participants__is_active=True,
            status=SplitRecurringExpense.STATUS_ACTIVE,
            is_active=True,
        )
        .select_related("category", "group")
        .distinct()
        .order_by("day_of_month", "id")
    )
    items = []
    generated = 0
    for rec in recurrings:
        occurrence_date = _split_occurrence_date(rec, year, month)
        if occurrence_date is None:
            continue
        if not _is_split_recurring_active_on(rec, occurrence_date):
            continue
        is_generated = _split_recurring_already_generated(rec, occurrence_date)
        if is_generated:
            generated += 1
        items.append(
            {
                "id": rec.id,
                "group": rec.group_id,
                "group_name": rec.group.name,
                "description": rec.description,
                "amount": str(rec.amount),
                "frequency": rec.frequency,
                "day_of_month": rec.day_of_month,
                "month_of_year": rec.month_of_year,
                "start_date": rec.start_date.isoformat(),
                "end_date": rec.end_date.isoformat() if rec.end_date else None,
                "category": (
                    {
                        "id": rec.category_id,
                        "name": rec.category.name,
                        "color": rec.category.color,
                        "icon": rec.category.icon,
                    }
                    if rec.category
                    else None
                ),
                "status": "generated" if is_generated else "pending",
            }
        )
    total = len(items)
    return {
        "month": month,
        "year": year,
        "items": items,
        "summary": {
            "generated": generated,
            "pending": total - generated,
            "total": total,
        },
    }


# ── Account deletion: anonimizzazione identità Split ────────────────────────
#
# SplitParticipant.user e SplitSettlement.payer_user/payee_user sono
# SET_NULL, ma vincolati da CheckConstraint a "esattamente uno tra
# user/contact" — un SET_NULL nudo lascia la riga con entrambi None,
# violando il constraint (IntegrityError/500 sull'endpoint di self-delete
# esistente). anonymize_split_identity_for_user() va chiamata da
# AccountView.delete PRIMA di user.delete(), nella stessa transazione:
# sostituisce l'identità di `user` con un SplitContact placeholder anonimo
# (nessuna email/nome originale) ovunque esista un altro utente ancora
# presente con un interesse reale sui dati, cosicché saldi e storico degli
# ALTRI partecipanti restino intatti. Dove `user` non ha mai condiviso Split
# con nessun altro utente (solo bookkeeping personale con propri contatti
# locali — quei SplitContact sono owner=user, CASCADE, e cascaterebbero
# comunque), non c'è nulla da preservare per conto terzi: gruppi/spese/
# settlement coinvolti vengono eliminati esplicitamente qui.


def _find_split_anchor_user_id(user):
    """Trova un altro utente ancora esistente che condivide con `user` un
    gruppo, una spesa occasionale o un settlement — userà il suo id come
    owner del SplitContact placeholder. Deterministico (id più basso) così
    chiamate ripetute concordano. None se `user` non ha mai condiviso Split
    con un altro utente registrato."""
    own = SplitParticipant.objects.filter(user=user).values_list(
        "group_id", "standalone_expense_id"
    )
    group_ids = {g for g, _ in own if g is not None}
    expense_ids = {e for _, e in own if e is not None}

    if group_ids or expense_ids:
        other = (
            SplitParticipant.objects.filter(
                Q(group_id__in=group_ids) | Q(standalone_expense_id__in=expense_ids)
            )
            .filter(user__isnull=False)
            .exclude(user=user)
            .order_by("user_id")
            .values_list("user_id", flat=True)
            .first()
        )
        if other:
            return other

    other = (
        SplitSettlement.objects.filter(payer_user=user, payee_user__isnull=False)
        .order_by("payee_user_id")
        .values_list("payee_user_id", flat=True)
        .first()
    )
    if other:
        return other
    return (
        SplitSettlement.objects.filter(payee_user=user, payer_user__isnull=False)
        .order_by("payer_user_id")
        .values_list("payer_user_id", flat=True)
        .first()
    )


def anonymize_split_identity_for_user(user):
    """Prepara i dati Split di `user` per la cancellazione dell'account. Vedi
    il commento di sezione sopra per il ragionamento completo."""
    own = SplitParticipant.objects.filter(user=user).values_list(
        "group_id", "standalone_expense_id"
    )
    group_ids = {g for g, _ in own if g is not None}
    expense_ids = {e for _, e in own if e is not None}

    anchor_id = _find_split_anchor_user_id(user)

    if anchor_id is None:
        # Nessun altro utente reale in vista in nessuno scope: niente da
        # preservare. Elimina esplicitamente gruppi/spese occasionali/
        # settlement coinvolti (cascata pulita su participants/shares/
        # shadow-tx) prima che user.delete() possa violare un constraint
        # tramite la cascata dei suoi stessi SplitContact (owner=user).
        if group_ids:
            SplitGroup.objects.filter(id__in=group_ids).delete()
        if expense_ids:
            SplitExpense.objects.filter(id__in=expense_ids, group__isnull=True).delete()
        SplitSettlement.objects.filter(Q(payer_user=user) | Q(payee_user=user)).delete()
        logger.info(
            "anonymize_split_identity_for_user: user=%s nessun anchor, "
            "eliminati group_ids=%s expense_ids=%s",
            user.id,
            sorted(group_ids),
            sorted(expense_ids),
        )
        return

    placeholder = SplitContact.objects.create(
        owner_id=anchor_id,
        display_name="Utente eliminato",
        is_archived=True,
    )

    # Per-scope: un gruppo/spesa senza NESSUN altro utente reale è "solo"
    # anche se esiste un anchor globale trovato altrove — va eliminato, non
    # anonimizzato (altrimenti resterebbe un gruppo fantasma inaccessibile a
    # chiunque: user_can_access_group richiede created_by o una
    # partecipazione attiva di un utente reale).
    groups_with_other_user = set(
        SplitParticipant.objects.filter(group_id__in=group_ids, user__isnull=False)
        .exclude(user=user)
        .values_list("group_id", flat=True)
        .distinct()
    )
    expenses_with_other_user = set(
        SplitParticipant.objects.filter(
            standalone_expense_id__in=expense_ids, user__isnull=False
        )
        .exclude(user=user)
        .values_list("standalone_expense_id", flat=True)
        .distinct()
    )
    solo_group_ids = group_ids - groups_with_other_user
    solo_expense_ids = expense_ids - expenses_with_other_user

    if solo_group_ids:
        SplitGroup.objects.filter(id__in=solo_group_ids).delete()
    if solo_expense_ids:
        SplitExpense.objects.filter(
            id__in=solo_expense_ids, group__isnull=True
        ).delete()

    # Le righe "solo" sono già sparite via cascata sopra: quel che resta di
    # SplitParticipant.filter(user=user) è per costruzione tutto condiviso.
    SplitParticipant.objects.filter(user=user).update(user=None, contact=placeholder)

    # Settlement: se `group` è valorizzato, altri membri del gruppo possono
    # avere interesse allo storico saldi anche se la loro controparte
    # diretta era un contatto locale di `user` — anonimizza sempre in quel
    # caso. Se invece è cross-gruppo (group=None) e la controparte non è un
    # secondo utente reale, il settlement è bookkeeping privato di `user`:
    # eliminalo, stessa logica dei gruppi/spese "solo" sopra.
    solo_settlement_ids = []
    payer_ids = []
    payee_ids = []
    for s in SplitSettlement.objects.filter(Q(payer_user=user) | Q(payee_user=user)):
        counterpart_is_real_other_user = (
            s.payer_user_id == user.id
            and s.payee_user_id
            and s.payee_user_id != user.id
        ) or (
            s.payee_user_id == user.id
            and s.payer_user_id
            and s.payer_user_id != user.id
        )
        if s.group_id or counterpart_is_real_other_user:
            (payer_ids if s.payer_user_id == user.id else payee_ids).append(s.id)
        else:
            solo_settlement_ids.append(s.id)

    if solo_settlement_ids:
        SplitSettlement.objects.filter(id__in=solo_settlement_ids).delete()
    if payer_ids:
        SplitSettlement.objects.filter(id__in=payer_ids).update(
            payer_user=None, payer_contact=placeholder
        )
    if payee_ids:
        SplitSettlement.objects.filter(id__in=payee_ids).update(
            payee_user=None, payee_contact=placeholder
        )

    # Safety net: qualunque SplitContact ancora posseduto da `user` e ancora
    # referenziato da una partecipazione/settlement (anche in uno scope dove
    # `user` stesso non compariva come identità diretta, es. una spesa tra
    # due SUOI contatti di cui non è mai stato partecipante) sopravvive
    # reintestandolo all'anchor, invece di cascare via con lui.
    still_referenced_contact_ids = (
        set(
            SplitParticipant.objects.filter(contact__owner_id=user.id).values_list(
                "contact_id", flat=True
            )
        )
        | set(
            SplitSettlement.objects.filter(payer_contact__owner_id=user.id).values_list(
                "payer_contact_id", flat=True
            )
        )
        | set(
            SplitSettlement.objects.filter(payee_contact__owner_id=user.id).values_list(
                "payee_contact_id", flat=True
            )
        )
    )
    if still_referenced_contact_ids:
        SplitContact.objects.filter(id__in=still_referenced_contact_ids).update(
            owner_id=anchor_id
        )

    logger.info(
        "anonymize_split_identity_for_user: user=%s anchor=%s placeholder_contact=%s "
        "solo_group_ids=%s solo_expense_ids=%s solo_settlement_ids=%s",
        user.id,
        anchor_id,
        placeholder.id,
        sorted(solo_group_ids),
        sorted(solo_expense_ids),
        sorted(solo_settlement_ids),
    )
