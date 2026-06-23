import type { ParsedCsv } from "../utils/formatters";
import type { Translator } from "../types";
import {
    buildCashflowImportRows,
    type CashflowImportRow,
    type ImportAccount,
    type ImportCategory,
} from "../utils/csvImport";
import type {
    CsvImportType,
    CsvMapping,
} from "../views/settings/csvImportConfig";

export const normalizeCsvHeader = (value: unknown): string =>
    String(value || "")
        .trim()
        .toLowerCase()
        .replace(/[_-]+/g, " ")
        .replace(/\s+/g, " ");

export const findCsvHeader = (
    headers: readonly string[],
    aliases: readonly string[],
): string =>
    headers.find((header) => aliases.includes(normalizeCsvHeader(header))) ||
    "";

export const inferCashflowCsvMap = (
    headers: readonly string[],
): CsvMapping => ({
    type: findCsvHeader(headers, ["type", "tipo"]),
    date: findCsvHeader(headers, ["date", "data"]),
    description: findCsvHeader(headers, [
        "description",
        "descrizione",
        "notes",
        "note",
    ]),
    amount: findCsvHeader(headers, ["amount", "importo", "value", "valore"]),
    category_name: findCsvHeader(headers, ["category", "categoria"]),
    linked_asset_name: findCsvHeader(headers, [
        "link to account",
        "linked account",
        "account",
        "conto",
        "collega a conto",
    ]),
    is_verified: findCsvHeader(headers, ["status", "stato", "verified"]),
});

export const getCsvColumnValue = (
    csvParsed: ParsedCsv | null,
    row: readonly string[],
    header?: string,
): string => {
    if (!csvParsed || !header) return "";
    const index = csvParsed.headers.indexOf(header);
    return index >= 0 ? row[index] || "" : "";
};

export const normalizeCsvImportErrors = (
    errors: unknown,
    T: Translator,
): string[] => {
    if (!Array.isArray(errors)) return [];
    return errors
        .map((err: unknown) => {
            if (typeof err === "string") return err;
            if (!err || typeof err !== "object") return String(err || "");
            const record = err as Record<string, unknown>;
            const row = Number.isInteger(record.row)
                ? Number(record.row)
                : null;
            const message = String(record.error || record.message || "").trim();
            if (!message) {
                return row
                    ? `${T("csv_row_label")} ${row}: ${T("csv_import_error")}`
                    : T("csv_import_error");
            }
            return row ? `${T("csv_row_label")} ${row}: ${message}` : message;
        })
        .filter(Boolean);
};

type AssetImportRow = {
    name: string;
    isin: string;
    transaction_type: string;
    date: string;
    shares: string;
    price_per_share: string;
    source_account_id: string;
    contribution_source: string;
    is_verified: string;
    notes: string;
};

type CsvImportPayload = {
    endpoint: string;
    rows: CashflowImportRow[] | AssetImportRow[];
};

type BuildCsvImportPayloadArgs = {
    apiBase: string;
    csvImportType: CsvImportType;
    csvParsed: ParsedCsv | null;
    csvMap: CsvMapping;
    csvSignConv: "neg" | "pos";
    categories: ImportCategory[];
    bankAccounts: ImportAccount[];
};

export const buildCsvImportPayload = ({
    apiBase,
    csvImportType,
    csvParsed,
    csvMap,
    csvSignConv,
    categories,
    bankAccounts,
}: BuildCsvImportPayloadArgs): CsvImportPayload | null => {
    if (!csvParsed) return null;

    if (csvImportType === "cashflow") {
        if (!csvMap.date || !csvMap.amount) return null;
        const rows = buildCashflowImportRows({
            csvParsed,
            csvMap,
            csvSignConv,
            categories,
            bankAccounts,
        });
        if (!rows) return null;
        return { endpoint: `${apiBase}/expenses/import-csv/`, rows };
    }

    if (csvImportType === "assets") {
        if (
            !csvMap.transaction_type ||
            !csvMap.date ||
            !csvMap.shares ||
            !csvMap.price_per_share
        ) {
            return null;
        }
        if (!csvMap.isin && !csvMap.name) return null;
        const rows = csvParsed.rows.map((row) => ({
            name: getCsvColumnValue(csvParsed, row, csvMap.name),
            isin: getCsvColumnValue(csvParsed, row, csvMap.isin),
            transaction_type: getCsvColumnValue(
                csvParsed,
                row,
                csvMap.transaction_type,
            ),
            date: getCsvColumnValue(csvParsed, row, csvMap.date),
            shares: getCsvColumnValue(csvParsed, row, csvMap.shares),
            price_per_share: getCsvColumnValue(
                csvParsed,
                row,
                csvMap.price_per_share,
            ),
            source_account_id: getCsvColumnValue(
                csvParsed,
                row,
                csvMap.source_account_id,
            ),
            contribution_source: getCsvColumnValue(
                csvParsed,
                row,
                csvMap.contribution_source,
            ),
            is_verified: csvMap.is_verified
                ? getCsvColumnValue(csvParsed, row, csvMap.is_verified)
                : "",
            notes: getCsvColumnValue(csvParsed, row, csvMap.notes),
        }));
        return { endpoint: `${apiBase}/portfolio/import-assets/`, rows };
    }

    return null;
};
