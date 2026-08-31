import type { Translator } from "../../types";
import type { CashflowItemType } from "../../context/feedTypes";

// Single source of truth for how a CashflowItemType maps to a translated
// label — was duplicated across CfFiltersSheet (chip labels) and
// CfTransactionRow/CfDetailSheet (row/detail fallback titles), which let
// "split"/"split_reimbursement" and the fallback-title path for
// split_reimbursement (Settlement) drift out of sync. "split"/
// "split_reimbursement" keep the pre-existing "cashflow_type_" prefix
// instead of "cf_" (unlike the other four types) since renaming them would
// touch every locale file for no behavioral gain.
export const CASHFLOW_TYPE_LABEL_KEYS: Record<CashflowItemType, string> = {
    income: "cf_income",
    outcome: "cf_outcome",
    transfer: "cf_transfer",
    adjustment: "cf_adjustment",
    split: "cashflow_type_split",
    split_reimbursement: "cashflow_type_split_reimbursement",
};

type CashflowTitledItem = {
    description?: string | null;
    type?: string;
    from_account?: { name?: string } | null;
    category?: { name?: string } | null;
};

// Resolves the title shown for a row/detail/delete-confirm: the user's own
// note if there is one, otherwise a translated per-type default, otherwise
// the category name, otherwise an em dash. The backend used to bake an
// English word ("Transfer"/"Adjustment"/"Settlement") into `description`
// whenever notes were blank, which always won this chain before the T(...)
// branches were ever reached — expenses/cashflow.py now leaves `description`
// null in that case so the translation actually applies.
export function getCashflowItemTitle(
    item: CashflowTitledItem,
    T: Translator,
): string {
    if (item.description) return item.description;
    if (item.type === "adjustment") return T("cf_adjustment_default");
    if (item.type === "transfer") {
        return T("cf_transfer_default_in").replace(
            "{account}",
            item.from_account?.name ?? "",
        );
    }
    if (item.type === "split_reimbursement") return T("cf_settlement_default");
    return item.category?.name || "—";
}
