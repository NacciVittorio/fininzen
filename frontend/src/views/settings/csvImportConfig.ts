import type { Translator } from "../../types";

export type CsvImportType = "cashflow" | "assets";
export type CsvField = {
    field: string;
    label: string;
    required: boolean;
};
export type CsvMapping = Record<string, string>;

export function getCsvImportFields(
    T: Translator,
): Record<CsvImportType, CsvField[]> {
    return {
        cashflow: [
            { field: "type", label: T("import_field_type"), required: false },
            { field: "date", label: T("import_field_date"), required: true },
            {
                field: "description",
                label: T("import_field_description"),
                required: false,
            },
            {
                field: "amount",
                label: T("import_field_amount"),
                required: true,
            },
            {
                field: "category_name",
                label: T("import_field_category_column"),
                required: true,
            },
            {
                field: "linked_asset_name",
                label: T("import_field_account"),
                required: true,
            },
            {
                field: "is_verified",
                label: T("import_field_verified"),
                required: false,
            },
        ],
        assets: [
            { field: "name", label: T("field_name"), required: false },
            { field: "isin", label: T("field_isin"), required: false },
            {
                field: "transaction_type",
                label: `${T("field_transaction_type")} (buy/sell)`,
                required: true,
            },
            { field: "date", label: T("field_date"), required: true },
            { field: "shares", label: T("field_shares"), required: true },
            {
                field: "price_per_share",
                label: T("field_price_per_share"),
                required: true,
            },
            {
                field: "source_account_id",
                label: T("tx_source_account"),
                required: false,
            },
            {
                field: "contribution_source",
                label: T("label_contribution_source"),
                required: false,
            },
            {
                field: "is_verified",
                label: `${T("verified_filter_label")} (true/false)`,
                required: false,
            },
            { field: "notes", label: T("field_notes"), required: false },
        ],
    };
}

export const REQUIRED_CSV_FIELDS_BY_TYPE = {
    cashflow: ["date", "amount", "linked_asset_name"],
    assets: ["transaction_type", "date", "shares", "price_per_share"],
} satisfies Record<CsvImportType, string[]>;

export const PREVIEW_CSV_FIELDS_BY_TYPE: Partial<
    Record<CsvImportType, string[]>
> = {
    cashflow: [
        "type",
        "category_name",
        "description",
        "amount",
        "date",
        "linked_asset_name",
        "is_verified",
    ],
};

export function hasRequiredCsvMapping(
    csvImportType: CsvImportType,
    csvMap: CsvMapping,
): boolean {
    const required =
        REQUIRED_CSV_FIELDS_BY_TYPE[csvImportType] ||
        REQUIRED_CSV_FIELDS_BY_TYPE.cashflow;
    const hasFallbackCategory =
        csvMap.expense_category_id || csvMap.income_category_id;

    return Boolean(
        required.every((field) => csvMap[field]) &&
        (csvImportType !== "cashflow" ||
            ((csvMap.description || csvMap.category_name) &&
                (csvMap.category_name || hasFallbackCategory))),
    );
}

export function getPreviewCsvFields(
    csvImportType: CsvImportType,
    csvMap: CsvMapping,
): string[] {
    const required =
        REQUIRED_CSV_FIELDS_BY_TYPE[csvImportType] ||
        REQUIRED_CSV_FIELDS_BY_TYPE.cashflow;

    return (
        PREVIEW_CSV_FIELDS_BY_TYPE[csvImportType] || required.slice(0, 4)
    ).filter((field) => csvMap[field]);
}
