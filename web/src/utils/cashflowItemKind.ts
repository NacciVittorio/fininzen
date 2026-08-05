import type { CfItem } from "../components/cashflow/CfTransactionRow";

// Shared derivation for CashFlow row/detail-sheet logic that used to be
// duplicated (and drift out of sync — see commit 2a2cdd8) across
// CfTransactionRow.tsx, CfDetailSheet.tsx and CashflowFeed.tsx. Backend
// counterpart: expenses/cashflow.py's FeedSource registry / splitting
// models' is_verified property (piano "unificazione astrazione" step 2-3).

export const SPLIT_TYPES = ["split", "split_reimbursement"] as const;

// "split" is a shared expense's net personal quota — real outcome money
// (piano sez. 5, decision #3), so it counts as outcome exactly like a plain
// expense row. "split_reimbursement" (a settle-up) stays neutral: it moves
// money between people, not in/out of the budget.
export function isOutcomeMoney(
    item: Pick<CfItem, "type"> | null | undefined,
): boolean {
    return item?.type === "outcome" || item?.type === "split";
}

export type SplitRowActions = {
    isSplitExpense: boolean;
    isSplitSettlement: boolean;
    splitSettlementHasGroup: boolean;
    openInSplit: boolean;
    showEditAction: boolean;
    showDeleteAction: boolean;
};

// Neither a shared expense nor a settlement can be edited in place here (a
// split expense's real edit form lives in Split; a settlement has no update
// endpoint at all, splitting/views/settlements.py) and only a settlement
// with a known group has anywhere to land in Split — for the rest (a
// cross-group settlement), the row/detail actions fall back to deleting it
// in place instead of offering a dead-end navigation.
export function splitRowActions(
    item: Pick<CfItem, "source_type" | "group_id"> | null | undefined,
): SplitRowActions {
    const isSplitExpense = item?.source_type === "split_expense";
    const isSplitSettlement = item?.source_type === "split_settlement";
    const splitSettlementHasGroup = isSplitSettlement && item?.group_id != null;
    const openInSplit = isSplitExpense || splitSettlementHasGroup;
    return {
        isSplitExpense,
        isSplitSettlement,
        splitSettlementHasGroup,
        openInSplit,
        showEditAction: !isSplitSettlement || splitSettlementHasGroup,
        showDeleteAction: !openInSplit,
    };
}

// Split rows are always is_verified=True from creation (no "pending"
// concept in the Split domain, see SplitExpense.is_verified/
// SplitSettlement.is_verified in splitting/models.py) and the bulk endpoint
// has no editable fields for split/split_reimbursement even after the
// abstraction-unification pass (expenses/bulk.py FIELDS_BY_KIND is an empty
// set for both) — hide the toggle rather than wire it to an action the
// backend will always reject.
export function canVerifyRow(
    item: Pick<CfItem, "source_type"> | null | undefined,
): boolean {
    const { isSplitExpense, isSplitSettlement } = splitRowActions(item);
    return (
        item?.source_type !== "adjustment" &&
        !isSplitExpense &&
        !isSplitSettlement
    );
}
