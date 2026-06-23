export type EntityId = number | string;
export type CashflowItemType = "income" | "outcome" | "transfer" | "adjustment";

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
