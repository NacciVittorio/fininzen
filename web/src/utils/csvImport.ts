import type { ParsedCsv } from "./formatters";
import { parseFlexibleDecimal } from "./formatters";

type ImportDirection = "income" | "expense";
type CsvSignConvention = "neg" | "pos";
type CsvMapping = Record<string, string>;

export type ImportCategory = {
    id: number | string;
    name: string;
    category_type?: string;
    subcategories?: ImportCategory[];
};

export type ImportAccount = {
    id: number | string;
    name: string;
};

export type CashflowImportRow = {
    date: string;
    description: string;
    amount: string;
    category_id: string;
    category_name: string;
    category_type: ImportDirection | "";
    linked_asset: string;
    linked_asset_name: string;
    is_verified: string;
};

type BuildCashflowImportRowsArgs = {
    csvParsed: ParsedCsv | null;
    csvMap: CsvMapping;
    csvSignConv?: CsvSignConvention;
    categories?: ImportCategory[];
    bankAccounts?: ImportAccount[];
};

function colValue(
    csvParsed: ParsedCsv | null,
    row: readonly string[],
    header?: string,
): string {
    if (!csvParsed || !header) return "";
    const idx = csvParsed.headers.indexOf(header);
    return idx >= 0 ? row[idx] || "" : "";
}

function normalizeCategoryName(value: unknown): string {
    return String(value || "")
        .trim()
        .toLowerCase();
}

function normalizeImportType(value: unknown): ImportDirection | "" {
    const normalized = normalizeCategoryName(value);
    if (
        ["income", "entrata", "entrate", "incoming", "in"].includes(normalized)
    ) {
        return "income";
    }
    if (
        [
            "expense",
            "expenses",
            "outcome",
            "outgoing",
            "uscita",
            "uscite",
            "out",
        ].includes(normalized)
    ) {
        return "expense";
    }
    return "";
}

function parseCsvSignedAmount(value: unknown): number {
    if (value == null || value === "") return NaN;
    let raw = String(value)
        .trim()
        .replace(/\u00a0/g, " ")
        .replace(/−/g, "-");
    const negativeByParens = /^\(.*\)$/.test(raw);
    const isNegative = negativeByParens || raw.includes("-");
    raw = raw
        .replace(/[()]/g, "")
        .replace(/[+-]/g, "")
        .replace(/[^0-9,.'\s]/g, "");
    const parsed = parseFlexibleDecimal(raw);
    if (!Number.isFinite(parsed)) return NaN;
    return isNegative ? -Math.abs(parsed) : Math.abs(parsed);
}

function findCategoryByName(
    categories: readonly ImportCategory[],
    name: string,
    categoryType: ImportDirection | "",
): ImportCategory | null {
    const normalizedName = normalizeCategoryName(name);
    if (!normalizedName) return null;
    const flatCategories = categories.flatMap((cat) => [
        cat,
        ...(Array.isArray(cat.subcategories) ? cat.subcategories : []),
    ]);
    return (
        flatCategories.find(
            (cat) =>
                cat.category_type === categoryType &&
                normalizeCategoryName(cat.name) === normalizedName,
        ) || null
    );
}

function findAccountByName(
    bankAccounts: readonly ImportAccount[],
    name: string,
): ImportAccount | null {
    const normalizedName = normalizeCategoryName(name);
    if (!normalizedName) return null;
    return (
        bankAccounts.find(
            (account) => normalizeCategoryName(account.name) === normalizedName,
        ) || null
    );
}

export function buildCashflowImportRows({
    csvParsed,
    csvMap,
    csvSignConv = "neg",
    categories = [],
    bankAccounts = [],
}: BuildCashflowImportRowsArgs): CashflowImportRow[] | null {
    if (!csvParsed || !csvMap?.date || !csvMap.amount) {
        return null;
    }

    return csvParsed.rows
        .map((row) => {
            const rawAmount = parseCsvSignedAmount(
                colValue(csvParsed, row, csvMap.amount),
            );
            const rowType = normalizeImportType(
                colValue(csvParsed, row, csvMap.type),
            );
            const isExpense =
                csvSignConv === "neg" ? rawAmount < 0 : rawAmount > 0;
            const categoryType: ImportDirection | "" =
                rowType ||
                (Number.isFinite(rawAmount)
                    ? isExpense
                        ? "expense"
                        : "income"
                    : "");
            const csvCategoryName = String(
                colValue(csvParsed, row, csvMap.category_name),
            ).trim();
            const description =
                String(colValue(csvParsed, row, csvMap.description)).trim() ||
                csvCategoryName;
            const matchedCategory = findCategoryByName(
                categories,
                csvCategoryName,
                categoryType,
            );
            const fallbackCategoryId =
                categoryType === "expense"
                    ? csvMap.expense_category_id
                    : csvMap.income_category_id;
            const categoryId = matchedCategory?.id || fallbackCategoryId || "";
            const accountName = String(
                colValue(csvParsed, row, csvMap.linked_asset_name),
            ).trim();
            const matchedAccount = findAccountByName(bankAccounts, accountName);

            return {
                date: colValue(csvParsed, row, csvMap.date),
                description,
                amount: Number.isFinite(rawAmount)
                    ? String(Math.abs(rawAmount))
                    : colValue(csvParsed, row, csvMap.amount),
                category_id: categoryId ? String(categoryId) : "",
                category_name: categoryId ? "" : csvCategoryName,
                category_type: categoryType,
                linked_asset: matchedAccount?.id
                    ? String(matchedAccount.id)
                    : "",
                linked_asset_name: matchedAccount ? "" : accountName,
                is_verified: csvMap.is_verified
                    ? colValue(csvParsed, row, csvMap.is_verified)
                    : "",
            };
        })
        .filter(
            (row) =>
                row &&
                (row.description ||
                    row.category_name ||
                    row.amount ||
                    row.date),
        );
}
