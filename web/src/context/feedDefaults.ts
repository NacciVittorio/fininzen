import { getCurrentAccountingMonthDateRange } from "./appContextHelpers";
import type { CashflowItemType } from "./feedTypes";

export type AssetTransactionFilterType = "buy" | "sell" | "adjustment";

export const ALL_ASSET_TX_TYPES: AssetTransactionFilterType[] = [
    "buy",
    "sell",
    "adjustment",
];

// BUG FIX (piano Batch 1): the backend feed accepts/returns "split" and
// "split_reimbursement" too (expenses/cashflow.py::_ALL_TYPES) — omitting
// them here meant a filter reset ("Tutti") silently excluded both types from
// every request, and the "Tipo" filter sheet never showed them as options
// (CfFiltersSheet.tsx maps over this exact array).
export const ALL_CASHFLOW_TYPES: CashflowItemType[] = [
    "income",
    "outcome",
    "transfer",
    "adjustment",
    "split",
    "split_reimbursement",
];

export interface CashflowFilters {
    types: CashflowItemType[];
    verified: boolean | null;
    category_ids: Array<string | number>;
    account_ids: Array<string | number>;
    date_from: string;
    date_to: string;
    search: string;
    ordering: string;
}

export interface AssetTransactionFilters {
    asset_ids: Array<string | number>;
    types: AssetTransactionFilterType[];
    date_from: string;
    date_to: string;
    verified: boolean | null;
    search: string;
    ordering: string;
}

export interface CsvColumnMap {
    type: string;
    date: string;
    description: string;
    amount: string;
    category_name: string;
    linked_asset_name: string;
    expense_category_id: string;
    income_category_id: string;
    is_verified: string;
}

export const getCurrentMonthDateRange = () => {
    const { from, to } = getCurrentAccountingMonthDateRange(1);
    return { from, to };
};

// Shared by the cashflow and asset-transaction type chips (both the live
// context togglers and the filter sheets' draft state): from "all types",
// picking one focuses to that single type; otherwise it toggles, never
// leaving the selection empty.
export function nextTypeSelection<T extends string>(
    prev: readonly T[],
    type: T,
    all: readonly T[],
): T[] {
    let types: T[];
    if (prev.length === all.length) {
        types = [type];
    } else if (prev.includes(type)) {
        types = prev.filter((t) => t !== type);
    } else {
        types = [...prev, type];
    }
    return types.length === 0 ? [type] : types;
}

export const buildCashflowFilters = (
    overrides: Partial<CashflowFilters> = {},
): CashflowFilters => {
    const { from, to } = getCurrentMonthDateRange();
    return {
        types: [...ALL_CASHFLOW_TYPES],
        verified: null,
        category_ids: [],
        account_ids: [],
        date_from: from,
        date_to: to,
        search: "",
        ordering: "-date",
        ...overrides,
    };
};

export const buildAssetTxFilters = (
    overrides: Partial<AssetTransactionFilters> = {},
): AssetTransactionFilters => {
    const { from, to } = getCurrentMonthDateRange();
    return {
        asset_ids: [],
        types: [...ALL_ASSET_TX_TYPES],
        date_from: from,
        date_to: to,
        verified: null,
        search: "",
        ordering: "-date",
        ...overrides,
    };
};

export const buildCsvMap = (
    overrides: Partial<CsvColumnMap> = {},
): CsvColumnMap => ({
    type: "",
    date: "",
    description: "",
    amount: "",
    category_name: "",
    linked_asset_name: "",
    expense_category_id: "",
    income_category_id: "",
    is_verified: "",
    ...overrides,
});
