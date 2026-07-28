/**
 * splitIdentity.ts — Small view-layer helpers shared by the Split screens
 * for figuring out *who* a participant/identity actually is on screen.
 *
 * DEVIATION NOTE (flagged in the phase summary, not silently worked
 * around): no Split endpoint — nor `/auth/profile/`
 * (UserProfileSerializer, fininzen/views.py:354-375) — ever returns the
 * CURRENT user's own numeric id; useApp()/useAuth() only ever expose their
 * email. Several Split flows structurally need that id though: adding
 * "yourself" as a participant on a standalone (groupless) expense needs a
 * `user_id`, and SplitSettlementSerializer.validate() (splitting/serializers.py)
 * *requires* `request.user.id` to equal either `payer_user` or `payee_user`.
 *
 * `resolveMySplitUserId` recovers it opportunistically from state the Split
 * tab already loads, without any new endpoint or hook:
 *   1. an active membership in any group we can see — the creator is always
 *      auto-added as a member (SplitGroupViewSet.perform_create), and every
 *      group our queryset can even return already satisfies "we're a
 *      member" (SplitGroupViewSet.get_queryset);
 *   2. failing that, either side of any partner link we're a party of
 *      (SplitPartnerLinkSerializer exposes the numeric id *and* the email
 *      on both `requester`/`recipient`).
 * It returns null only for a brand-new account with zero groups and zero
 * partner links — not a dead end: the same resolver gates every place a
 * "you" participant is added (SplitExpenseFormModal, SplitSettleUpModal), so
 * a user can never end up with a balance that involves themselves without
 * already having gone through a group or a partner link, which is exactly
 * what makes the id resolvable again afterwards.
 */
import type {
    SplitBalanceEntry,
    SplitContact,
    SplitGroup,
    SplitIdentity,
    SplitParticipant,
    SplitPartnerLink,
    SplitSimplifiedTransaction,
} from "../../api/split";
import type { Translator } from "../../types";

export function resolveMySplitUserId(args: {
    myEmail: string | null;
    groups: readonly SplitGroup[];
    groupMembers?: readonly SplitParticipant[];
    partnerLinksSent: readonly SplitPartnerLink[];
    partnerLinksReceived: readonly SplitPartnerLink[];
}): number | null {
    const {
        myEmail,
        groups,
        groupMembers,
        partnerLinksSent,
        partnerLinksReceived,
    } = args;
    if (!myEmail) return null;

    const selfInMembers = (
        members: readonly SplitParticipant[] | undefined,
    ): number | null =>
        members?.find((m) => m.user != null && m.user_email === myEmail)
            ?.user ?? null;

    const fromCurrentGroup = selfInMembers(groupMembers);
    if (fromCurrentGroup != null) return fromCurrentGroup;

    for (const group of groups) {
        const found = selfInMembers(group.members);
        if (found != null) return found;
    }
    for (const link of [...partnerLinksSent, ...partnerLinksReceived]) {
        if (link.requester_email === myEmail) return link.requester;
        if (link.recipient_email === myEmail) return link.recipient;
    }
    return null;
}

// Stable identity key, same convention as splitting/balances.py::_identity_key
// and useSplitExpenseForm.ts's participantKey.
export function splitIdentityKey(identity: {
    user_id?: number | null;
    contact_id?: number | null;
}): string {
    return identity.user_id != null
        ? `user:${identity.user_id}`
        : `contact:${identity.contact_id}`;
}

// Friendlier label for a group member than the raw email: for a linked
// partner, prefer the reciprocal SplitContact's display_name (set from their
// profile name at accept time, splitting/services.py::_display_name_for)
// over the bare email SplitParticipantSerializer returns.
export function splitMemberLabel(
    member: Pick<SplitParticipant, "user" | "user_email" | "contact_name">,
    context: {
        myEmail: string | null;
        contacts: readonly SplitContact[];
        T: Translator;
    },
): string {
    if (member.contact_name) return member.contact_name;
    if (member.user_email === context.myEmail) return context.T("split_you");
    const linked = context.contacts.find(
        (c) => c.linked_user != null && c.linked_user === member.user,
    );
    return linked?.display_name ?? member.user_email ?? "—";
}

export function splitIdentityLabel(
    identity: Pick<SplitIdentity, "display_name" | "email">,
    context: { myEmail: string | null; T: Translator },
): string {
    if (context.myEmail && identity.email === context.myEmail) {
        return context.T("split_you");
    }
    return identity.display_name ?? identity.email ?? "—";
}

export function splitIdentityIsMe(
    identity: Pick<SplitIdentity, "user_id" | "email">,
    context: { mySplitUserId: number | null; myEmail: string | null },
): boolean {
    if (context.mySplitUserId != null && identity.user_id != null) {
        return identity.user_id === context.mySplitUserId;
    }
    return !!context.myEmail && identity.email === context.myEmail;
}

// Turns one "Semplifica debiti" suggested transaction into the same
// `SplitBalanceEntry` shape SplitSettleUpModal expects (other-party identity
// + a balance signed from *my* point of view), so both entry points funnel
// through one modal. Returns null when neither side of the suggestion is me
// — SplitSettlementSerializer.validate() requires `created_by` to be one of
// the two parties (splitting/serializers.py), so I can only ever act on a
// suggested transaction I'm a party of; other members' suggested transfers
// are shown for visibility only.
export function simplifiedTransactionToSettleEntry(
    tx: SplitSimplifiedTransaction,
    context: { mySplitUserId: number | null; myEmail: string | null },
): SplitBalanceEntry | null {
    const meIsDebtor = splitIdentityIsMe(tx.from, context);
    const meIsCreditor = splitIdentityIsMe(tx.to, context);
    if (!meIsDebtor && !meIsCreditor) return null;
    const other = meIsDebtor ? tx.to : tx.from;
    const sign = meIsDebtor ? -1 : 1;
    return { ...other, balance: String(sign * Number(tx.amount)) };
}
