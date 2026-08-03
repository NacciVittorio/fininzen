/**
 * web/src/api/split.ts — Typed client for the Split feature (/api/split/...).
 *
 * Same style as expenses.ts/sharing.ts: pure functions of the form
 * `(fetcher, ...) => requestJsonWithFetcher/fetchAllPagesWithFetcher(...)`.
 * `fetcher` is always an `ApiFetcher` (see client.ts) supplied by the caller
 * (SplitProvider, wired to useApp().apiFetch) — never a hardcoded base URL:
 * `requestJsonWithFetcher` prefixes every path with `API` from utils/api.ts,
 * which already resolves to `/fininzen/api` in the browser.
 *
 * DEVIATION NOTE (flagged in the phase summary, not silently worked around):
 * several Split endpoints are custom `@action`s without an `@extend_schema`
 * annotation, so drf-spectacular/openapi-typescript could not derive their
 * real request/response shape — it silently fell back to the ViewSet's main
 * `serializer_class` (e.g. `/groups/{id}/members/` and `/groups/{id}/balances/`
 * both show up in schema.d.ts typed as `SplitGroup`, and `SplitParticipant`
 * never got a component schema at all since it is never a ViewSet's primary
 * serializer). A few others lost their request/response body entirely
 * (typed `never`): `POST /partner-links/` (real body is `{ email }`, the
 * `SplitPartnerLinkCreateSerializer` never got registered) and
 * `GET /balances/overview/` (plain APIView, no serializer_class for
 * spectacular to guess from). For every one of those endpoints this file
 * hand-writes the real shape (verified directly against
 * splitting/views/*.py, splitting/balances.py and splitting/services.py)
 * instead of trusting the generated `operations[...]` type — exactly the
 * same escape hatch expenses.ts already uses for its own custom endpoints
 * (CashflowTrendPoint/ExpenseSummaryResponse/RecurringStatusResponse).
 * Backend is out of scope for this frontend-scaffolding phase, so the fix
 * lives entirely here rather than adding `@extend_schema` decorators.
 */
import type { ApiFetcher, PaginatedResponse } from "./client";
import { fetchAllPagesWithFetcher, requestJsonWithFetcher } from "./client";
import type { components } from "./schema";

type Schemas = components["schemas"];

export type UnknownCollection<TItem = unknown> =
    TItem[] | PaginatedResponse<TItem>;

const withQuery = (path: string, params?: URLSearchParams): `/${string}` => {
    const query = params?.toString();
    return `${path}${query ? `?${query}` : ""}` as `/${string}`;
};

// ── Shared literal unions (kept as hand-rolled string unions rather than
// `Schemas["StatusE95Enum"]`/`Schemas["Frequency5b8Enum"]`: those two names
// are drf-spectacular's collision-disambiguation suffixes — shared verbatim
// with expenses.RecurringExpense's own status/frequency — and can silently
// change on the next `just schema` run touching either app. The values
// themselves are stable (see splitting/models.py). ──
export type SplitMethod = "equal" | "exact" | "percentage" | "shares";
export type SplitPartnerLinkStatus =
    "PENDING" | "ACCEPTED" | "DECLINED" | "CANCELLED";
export type SplitRecurringStatus = "ACTIVE" | "DISABLED" | "DELETED";
export type SplitRecurringFrequency = "MONTHLY" | "YEARLY";

// ── Entities backed by a correctly-generated schema component ──────────────
export type SplitContact = Schemas["SplitContact"];
export type SplitContactPayload = Schemas["SplitContactRequest"];
export type SplitContactPatchPayload = Schemas["PatchedSplitContactRequest"];

export type SplitExpenseShare = Schemas["SplitExpenseShareOutput"];
export type SplitExpense = Schemas["SplitExpense"];
export type SplitExpensePayload = Schemas["SplitExpenseRequest"];
export type SplitExpensePatchPayload = Schemas["PatchedSplitExpenseRequest"];
export type SplitExpenseParticipantInput =
    Schemas["SplitExpenseParticipantInputRequest"];

export type SplitPartnerLink = Schemas["SplitPartnerLink"];

export type SplitSettlement = Schemas["SplitSettlement"];
export type SplitSettlementPayload = Schemas["SplitSettlementRequest"];

export type SplitRecurringExpenseParticipant =
    Schemas["SplitRecurringExpenseParticipantOutput"];
export type SplitRecurringExpensePayload =
    Schemas["SplitRecurringExpenseRequest"];
export type SplitRecurringExpensePatchPayload =
    Schemas["PatchedSplitRecurringExpenseRequest"];

// `SplitGroup.members` is a `SerializerMethodField` with no type hint on the
// backend, so drf-spectacular fell back to `string` (see the module docblock)
// even though `SplitGroupSerializer.get_members()` always returns a JSON
// array of participants. Re-typed here to the shape actually sent over the
// wire, using the hand-written `SplitParticipant` below (see docblock).
export type SplitGroup = Omit<Schemas["SplitGroup"], "members"> & {
    members: SplitParticipant[];
};
export type SplitGroupPayload = Schemas["SplitGroupRequest"];
export type SplitGroupPatchPayload = Schemas["PatchedSplitGroupRequest"];

export type SplitRecurringExpense = Omit<
    Schemas["SplitRecurringExpense"],
    "participant_templates"
> & {
    participant_templates: SplitRecurringExpenseParticipant[];
};

// ── Hand-written types for endpoints the schema mistypes or drops ──────────

// SplitParticipantSerializer (splitting/serializers.py) — never registered as
// a standalone component schema (see docblock).
export type SplitParticipant = {
    id: number;
    group: number | null;
    standalone_expense: number | null;
    user: number | null;
    user_email: string | null;
    contact: number | null;
    contact_name: string | null;
    contact_color: string | null;
    is_active: boolean;
    created_at: string;
};

export type SplitMemberPayload =
    | { user_id: number; contact_id?: never }
    | { contact_id: number; user_id?: never };

// serialize_balances()/serialize_simplified_transactions() (splitting/balances.py)
export type SplitIdentity = {
    user_id: number | null;
    contact_id: number | null;
    display_name: string | null;
    email: string | null;
    color: string | null;
};
export type SplitBalanceEntry = SplitIdentity & { balance: string };
export type SplitSimplifiedTransaction = {
    from: SplitIdentity;
    to: SplitIdentity;
    amount: string;
};

// SplitPartnerLinkViewSet.list() overrides list() to return this shape
// instead of the router's default paginated list (see docblock).
export type SplitPartnerLinksResponse = {
    sent: SplitPartnerLink[];
    received: SplitPartnerLink[];
};

// split_recurring_status() (splitting/services.py)
export type SplitRecurringStatusItem = {
    id: number;
    group: number;
    group_name: string;
    description: string;
    amount: string;
    frequency: SplitRecurringFrequency;
    day_of_month: number;
    month_of_year: number | null;
    start_date: string;
    end_date: string | null;
    category: { id: number; name: string; color: string; icon: string } | null;
    status: "generated" | "pending";
};
export type SplitRecurringStatusResponse = {
    month: number;
    year: number;
    items: SplitRecurringStatusItem[];
    summary: { generated: number; pending: number; total: number };
};

// generate_split_recurring_expenses() / backfill_recurring_split_expense()
export type SplitRecurringBackfillResult = {
    created: number;
    skipped: number;
};
export type SplitRecurringEnableResponse = SplitRecurringBackfillResult & {
    ok: true;
};
export type SplitRecurringDisableResponse = { ok: true };

// ── Contacts ─────────────────────────────────────────────────────────────

export const fetchSplitContactsList = (
    fetcher: ApiFetcher,
    options?: { includeArchived?: boolean; signal?: AbortSignal },
): Promise<SplitContact[]> => {
    const params = options?.includeArchived
        ? new URLSearchParams({ include_archived: "true" })
        : undefined;
    return fetchAllPagesWithFetcher<SplitContact>(
        fetcher,
        withQuery("/split/contacts/", params),
        { signal: options?.signal },
    );
};

export const createSplitContact = (
    fetcher: ApiFetcher,
    payload: SplitContactPayload,
): Promise<SplitContact> =>
    requestJsonWithFetcher<SplitContact>(fetcher, "/split/contacts/", {
        method: "POST",
        body: payload,
    });

export const updateSplitContact = (
    fetcher: ApiFetcher,
    contactId: number | string,
    payload: SplitContactPatchPayload,
): Promise<SplitContact> =>
    requestJsonWithFetcher<SplitContact>(
        fetcher,
        `/split/contacts/${contactId}/`,
        { method: "PATCH", body: payload },
    );

export const deleteSplitContact = (
    fetcher: ApiFetcher,
    contactId: number | string,
): Promise<unknown> =>
    requestJsonWithFetcher(fetcher, `/split/contacts/${contactId}/`, {
        method: "DELETE",
    });

// ── Partner links ────────────────────────────────────────────────────────

export const fetchSplitPartnerLinks = (
    fetcher: ApiFetcher,
    signal?: AbortSignal,
): Promise<SplitPartnerLinksResponse> =>
    requestJsonWithFetcher<SplitPartnerLinksResponse>(
        fetcher,
        "/split/partner-links/",
        { signal },
    );

export const createSplitPartnerLink = (
    fetcher: ApiFetcher,
    email: string,
): Promise<SplitPartnerLink> =>
    requestJsonWithFetcher<SplitPartnerLink>(fetcher, "/split/partner-links/", {
        method: "POST",
        body: { email },
    });

export const acceptSplitPartnerLink = (
    fetcher: ApiFetcher,
    linkId: number | string,
): Promise<SplitPartnerLink> =>
    requestJsonWithFetcher<SplitPartnerLink>(
        fetcher,
        `/split/partner-links/${linkId}/accept/`,
        { method: "POST" },
    );

export const declineSplitPartnerLink = (
    fetcher: ApiFetcher,
    linkId: number | string,
): Promise<SplitPartnerLink> =>
    requestJsonWithFetcher<SplitPartnerLink>(
        fetcher,
        `/split/partner-links/${linkId}/decline/`,
        { method: "POST" },
    );

// ── Groups ───────────────────────────────────────────────────────────────

export const fetchSplitGroupsList = (
    fetcher: ApiFetcher,
    signal?: AbortSignal,
): Promise<SplitGroup[]> =>
    fetchAllPagesWithFetcher<SplitGroup>(fetcher, "/split/groups/", { signal });

export const fetchSplitGroup = (
    fetcher: ApiFetcher,
    groupId: number | string,
    signal?: AbortSignal,
): Promise<SplitGroup> =>
    requestJsonWithFetcher<SplitGroup>(fetcher, `/split/groups/${groupId}/`, {
        signal,
    });

export const createSplitGroup = (
    fetcher: ApiFetcher,
    payload: SplitGroupPayload,
): Promise<SplitGroup> =>
    requestJsonWithFetcher<SplitGroup>(fetcher, "/split/groups/", {
        method: "POST",
        body: payload,
    });

export const updateSplitGroup = (
    fetcher: ApiFetcher,
    groupId: number | string,
    payload: SplitGroupPatchPayload,
): Promise<SplitGroup> =>
    requestJsonWithFetcher<SplitGroup>(fetcher, `/split/groups/${groupId}/`, {
        method: "PATCH",
        body: payload,
    });

export const deleteSplitGroup = (
    fetcher: ApiFetcher,
    groupId: number | string,
): Promise<unknown> =>
    requestJsonWithFetcher(fetcher, `/split/groups/${groupId}/`, {
        method: "DELETE",
    });

export const fetchSplitGroupMembers = (
    fetcher: ApiFetcher,
    groupId: number | string,
    signal?: AbortSignal,
): Promise<SplitParticipant[]> =>
    requestJsonWithFetcher<SplitParticipant[]>(
        fetcher,
        `/split/groups/${groupId}/members/`,
        { signal },
    );

export const addSplitGroupMember = (
    fetcher: ApiFetcher,
    groupId: number | string,
    payload: SplitMemberPayload,
): Promise<SplitParticipant> =>
    requestJsonWithFetcher<SplitParticipant>(
        fetcher,
        `/split/groups/${groupId}/members/`,
        { method: "POST", body: payload },
    );

export const removeSplitGroupMember = (
    fetcher: ApiFetcher,
    groupId: number | string,
    memberId: number | string,
): Promise<unknown> =>
    requestJsonWithFetcher(
        fetcher,
        `/split/groups/${groupId}/members/${memberId}/`,
        { method: "DELETE" },
    );

export const fetchSplitGroupBalances = (
    fetcher: ApiFetcher,
    groupId: number | string,
    signal?: AbortSignal,
): Promise<SplitBalanceEntry[]> =>
    requestJsonWithFetcher<SplitBalanceEntry[]>(
        fetcher,
        `/split/groups/${groupId}/balances/`,
        { signal },
    );

export const simplifySplitGroupDebts = (
    fetcher: ApiFetcher,
    groupId: number | string,
    signal?: AbortSignal,
): Promise<SplitSimplifiedTransaction[]> =>
    requestJsonWithFetcher<SplitSimplifiedTransaction[]>(
        fetcher,
        `/split/groups/${groupId}/simplify/`,
        { signal },
    );

// ── Expenses ─────────────────────────────────────────────────────────────

export const fetchSplitExpensesList = (
    fetcher: ApiFetcher,
    signal?: AbortSignal,
): Promise<SplitExpense[]> =>
    fetchAllPagesWithFetcher<SplitExpense>(fetcher, "/split/expenses/", {
        signal,
    });

export const fetchSplitExpense = (
    fetcher: ApiFetcher,
    expenseId: number | string,
    signal?: AbortSignal,
): Promise<SplitExpense> =>
    requestJsonWithFetcher<SplitExpense>(
        fetcher,
        `/split/expenses/${expenseId}/`,
        { signal },
    );

export const createSplitExpense = (
    fetcher: ApiFetcher,
    payload: SplitExpensePayload,
): Promise<SplitExpense> =>
    requestJsonWithFetcher<SplitExpense>(fetcher, "/split/expenses/", {
        method: "POST",
        body: payload,
    });

export const updateSplitExpense = (
    fetcher: ApiFetcher,
    expenseId: number | string,
    payload: SplitExpensePatchPayload,
): Promise<SplitExpense> =>
    requestJsonWithFetcher<SplitExpense>(
        fetcher,
        `/split/expenses/${expenseId}/`,
        { method: "PATCH", body: payload },
    );

export const deleteSplitExpense = (
    fetcher: ApiFetcher,
    expenseId: number | string,
): Promise<unknown> =>
    requestJsonWithFetcher(fetcher, `/split/expenses/${expenseId}/`, {
        method: "DELETE",
    });

// ── Settlements (list/create/delete only — no update, see SplitSettlementViewSet) ──

export const fetchSplitSettlementsList = (
    fetcher: ApiFetcher,
    signal?: AbortSignal,
): Promise<SplitSettlement[]> =>
    fetchAllPagesWithFetcher<SplitSettlement>(fetcher, "/split/settlements/", {
        signal,
    });

export const createSplitSettlement = (
    fetcher: ApiFetcher,
    payload: SplitSettlementPayload,
): Promise<SplitSettlement> =>
    requestJsonWithFetcher<SplitSettlement>(fetcher, "/split/settlements/", {
        method: "POST",
        body: payload,
    });

export const deleteSplitSettlement = (
    fetcher: ApiFetcher,
    settlementId: number | string,
): Promise<unknown> =>
    requestJsonWithFetcher(fetcher, `/split/settlements/${settlementId}/`, {
        method: "DELETE",
    });

// ── Recurring ────────────────────────────────────────────────────────────

export const fetchSplitRecurringList = (
    fetcher: ApiFetcher,
    signal?: AbortSignal,
): Promise<SplitRecurringExpense[]> =>
    fetchAllPagesWithFetcher<SplitRecurringExpense>(
        fetcher,
        "/split/recurring/",
        { signal },
    );

export const createSplitRecurring = (
    fetcher: ApiFetcher,
    payload: SplitRecurringExpensePayload,
): Promise<SplitRecurringExpense> =>
    requestJsonWithFetcher<SplitRecurringExpense>(
        fetcher,
        "/split/recurring/",
        {
            method: "POST",
            body: payload,
        },
    );

export const updateSplitRecurring = (
    fetcher: ApiFetcher,
    recurringId: number | string,
    payload: SplitRecurringExpensePatchPayload,
): Promise<SplitRecurringExpense> =>
    requestJsonWithFetcher<SplitRecurringExpense>(
        fetcher,
        `/split/recurring/${recurringId}/`,
        { method: "PATCH", body: payload },
    );

export const deleteSplitRecurring = (
    fetcher: ApiFetcher,
    recurringId: number | string,
): Promise<unknown> =>
    requestJsonWithFetcher(fetcher, `/split/recurring/${recurringId}/`, {
        method: "DELETE",
    });

export const enableSplitRecurring = (
    fetcher: ApiFetcher,
    recurringId: number | string,
): Promise<SplitRecurringEnableResponse> =>
    requestJsonWithFetcher<SplitRecurringEnableResponse>(
        fetcher,
        `/split/recurring/${recurringId}/enable/`,
        { method: "POST" },
    );

export const disableSplitRecurring = (
    fetcher: ApiFetcher,
    recurringId: number | string,
): Promise<SplitRecurringDisableResponse> =>
    requestJsonWithFetcher<SplitRecurringDisableResponse>(
        fetcher,
        `/split/recurring/${recurringId}/disable/`,
        { method: "POST" },
    );

export const generateSplitRecurring = (
    fetcher: ApiFetcher,
    payload: { month: number; year: number },
): Promise<SplitRecurringBackfillResult> =>
    requestJsonWithFetcher<SplitRecurringBackfillResult>(
        fetcher,
        "/split/recurring/generate/",
        { method: "POST", body: payload },
    );

export const fetchSplitRecurringStatus = (
    fetcher: ApiFetcher,
    params: { month: number; year: number },
    signal?: AbortSignal,
): Promise<SplitRecurringStatusResponse> =>
    requestJsonWithFetcher<SplitRecurringStatusResponse>(
        fetcher,
        withQuery(
            "/split/recurring/status/",
            new URLSearchParams({
                month: String(params.month),
                year: String(params.year),
            }),
        ),
        { signal },
    );

// ── Balances overview (cross-group, per person) ─────────────────────────

export const fetchSplitBalancesOverview = (
    fetcher: ApiFetcher,
    signal?: AbortSignal,
): Promise<SplitBalanceEntry[]> =>
    requestJsonWithFetcher<SplitBalanceEntry[]>(
        fetcher,
        "/split/balances/overview/",
        { signal },
    );
