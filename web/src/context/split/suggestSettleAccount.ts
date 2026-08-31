/**
 * suggestSettleAccount.ts — Pure helpers for pre-selecting the settle-up
 * `linked_asset` (piano Batch 4.4). SplitSettleUpModal.tsx used to always
 * open with an empty account field (`setLinkedAsset(null)`), even when every
 * open expense between the two identities being settled was paid from the
 * very same account — this recovers that default without ever guessing when
 * it's ambiguous (any disagreement, or no open expenses at all, falls back
 * to null exactly like today's behaviour).
 *
 * Kept dependency-free (no React, no `useApp`/`useSplit`) so both pieces are
 * trivially unit-testable and reusable regardless of which call site
 * resolves the actual expense list (SplitSettleUpModal.tsx: the group-scoped
 * caller already has it via `groupExpenses`, the cross-group overview caller
 * fetches it itself — see that file for the split).
 */
import type {
    SplitExpense,
    SplitExpenseShare,
    SplitIdentity,
} from "../../api/split";

type SplitExpenseParty = Pick<SplitIdentity, "user_id" | "contact_id">;

function shareMatchesIdentity(
    share: Pick<
        SplitExpenseShare,
        "participant_user_id" | "participant_contact_id"
    >,
    identity: SplitExpenseParty,
): boolean {
    // participant_user_id/participant_contact_id are typed as plain `number`
    // by drf-spectacular (SplitExpenseShareOutputSerializer has no
    // allow_null on either IntegerField — splitting/serializers.py) but DRF
    // still serializes whichever side is unset as `null` at runtime, same
    // mistyped-schema deviation as SplitGroup.members (api/split.ts
    // docblock) — the `!= null` checks below are load-bearing, not redundant.
    if (identity.user_id != null) {
        return share.participant_user_id === identity.user_id;
    }
    if (identity.contact_id != null) {
        return share.participant_contact_id === identity.contact_id;
    }
    return false;
}

/**
 * "Spesa aperta" tra due identità (piano Batch 4.4): una spesa dove una
 * identità ha la share pagatore e l'altra ha una share non-payer, con
 * `settlement_progress.percentage < 100` sull'INTERA spesa — non sulla
 * singola share, quindi una spesa a più partecipanti conta comunque come
 * aperta anche se il residuo non saldato appartenesse in parte a un terzo
 * membro del gruppo estraneo a questa coppia.
 */
export function openSplitExpensesBetween(
    expenses: readonly SplitExpense[],
    identityA: SplitExpenseParty,
    identityB: SplitExpenseParty,
): SplitExpense[] {
    return expenses.filter((expense) => {
        if (expense.settlement_progress.percentage >= 100) return false;
        const payers = expense.shares.filter((share) => share.is_payer);
        const debtors = expense.shares.filter((share) => !share.is_payer);
        const aPaidBOwes =
            payers.some((share) => shareMatchesIdentity(share, identityA)) &&
            debtors.some((share) => shareMatchesIdentity(share, identityB));
        const bPaidAOwes =
            payers.some((share) => shareMatchesIdentity(share, identityB)) &&
            debtors.some((share) => shareMatchesIdentity(share, identityA));
        return aPaidBOwes || bPaidAOwes;
    });
}

/**
 * Pre-selects the settle-up account: only when every open expense between
 * the pair (there must be at least one) shares the very same non-null
 * `linked_asset`. Mixed accounts, or a single expense with none at all,
 * return null — same empty starting point the field already had, never a
 * risky guess.
 */
export function suggestSettleAccount(
    openExpenses: readonly Pick<SplitExpense, "linked_asset">[],
): number | null {
    // Optional-chained index read (not `[first, ...rest] = openExpenses`)
    // so an empty array falls straight through to the `== null` check below
    // instead of needing its own separate early return.
    const first = openExpenses[0]?.linked_asset ?? null;
    if (first == null) return null;
    const allSame = openExpenses.every(
        (expense) => expense.linked_asset === first,
    );
    return allSame ? first : null;
}
