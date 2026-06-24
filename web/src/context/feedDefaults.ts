import { getCurrentAccountingMonthDateRange } from "./appContextHelpers";
import type { CashflowItemType } from "./feedTypes";

export type AssetTransactionFilterType = "buy" | "sell" | "adjustment";

export const ALL_ASSET_TX_TYPES: AssetTransactionFilterType[] = [
    "buy",
    "sell",
    "adjustment",
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

export const buildCashflowFilters = (
    overrides: Partial<CashflowFilters> = {},
): CashflowFilters => {
    const { from, to } = getCurrentMonthDateRange();
    return {
        types: ["income", "outcome", "transfer", "adjustment"],
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
        types: ["buy", "sell", "adjustment"],
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
