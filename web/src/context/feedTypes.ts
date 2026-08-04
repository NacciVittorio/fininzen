export type EntityId = number | string;
// BUG FIX (found while writing web/e2e/split.spec.ts, piano sez. 5/8.2): the
// backend feed (expenses/cashflow.py::_ALL_TYPES) has returned "split" and
// "split_reimbursement" items since the CashFlow integration phase, but this
// union never grew to match — `item.type === "outcome"` in CfTransactionRow
// silently never matched a split expense's net-quota row, so every such row
// rendered with the neutral "±" grey styling of a transfer/adjustment instead
// of the red "-" outcome styling a real expense gets, even though decision #3
// (piano sez. 5) means it IS real outcome money from the user's perspective.
export type CashflowItemType =
    | "income"
    | "outcome"
    | "transfer"
    | "adjustment"
    | "split"
    | "split_reimbursement";

export type CashflowAccountRef = { id: EntityId; name: string };

export type CashflowFeedItem = {
    id: EntityId;
    source_type?: string;
    source_id?: EntityId;
    paired_id?: EntityId | null;
    type: CashflowItemType;
    date: string;
    description: string;
    amount: string;
    category?: {
        id: EntityId;
        name: string;
        color?: string;
        icon?: string;
        category_type?: string;
        parent_id?: EntityId | null;
    } | null;
    account?: CashflowAccountRef | null;
    from_account?: CashflowAccountRef | null;
    to_account?: CashflowAccountRef | null;
    is_verified: boolean;
    // Additive fields for "split"/"split_reimbursement" rows only (see
    // expenses/cashflow.py::_split_expense_to_item /
    // _split_reimbursement_to_item). `gross_amount` is the full expense
    // charged to the account (`amount` above stays the payer's net personal
    // quota); `group_id` is the settlement's Split group, null for a
    // cross-group settlement — used to decide between navigating to Split
    // and an in-place delete (see CfDetailSheet/CashflowDeleteConfirmModal).
    gross_amount?: string;
    group_id?: EntityId | null;
};

export type CashflowSummary = {
    income: string;
    outcome: string;
    net: string;
};

export type CashflowFeedPage = {
    count: number;
    next_page: number | null;
    results: CashflowFeedItem[];
    summary?: CashflowSummary;
};

export const parseCashflowFeedPage = (
    payload: unknown,
): CashflowFeedPage | null => {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        return null;
    }
    const record = payload as Record<string, unknown>;
    if (!Array.isArray(record.results)) return null;
    const summary =
        record.summary &&
        typeof record.summary === "object" &&
        !Array.isArray(record.summary)
            ? (record.summary as CashflowSummary)
            : undefined;
    return {
        count: Number(record.count) || 0,
        next_page:
            record.next_page == null ? null : Number(record.next_page) || null,
        results: record.results as CashflowFeedItem[],
        summary,
    };
};
