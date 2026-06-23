import { describe, expect, it } from "vitest";
import { buildCashflowImportRows } from "../utils/csvImport";
import type { ImportAccount, ImportCategory } from "../utils/csvImport";

const categories = [
    { id: 1, name: "Food", category_type: "expense" },
    { id: 2, name: "Salary", category_type: "income" },
    { id: 3, name: "Bonus", category_type: "expense" },
    { id: 4, name: "Bonus", category_type: "income" },
    { id: 5, name: "Father", parent: 2, category_type: "income" },
];

const bankAccounts = [
    { id: 10, name: "Fineco" },
    { id: 11, name: "Trade Republic" },
];

type BuildRowsOverrides = {
    csvMap?: Record<string, string>;
    csvSignConv?: "neg" | "pos";
    categories?: ImportCategory[];
    bankAccounts?: ImportAccount[];
};

function buildRows(overrides: BuildRowsOverrides = {}) {
    return buildCashflowImportRows({
        csvParsed: {
            headers: ["date", "description", "amount", "category", "verified"],
            rows: [
                ["2026-04-10", "Lunch", "-12.50", "Food", "true"],
                ["2026-04-11", "Paycheck", "+2000.00", "Salary", "false"],
            ],
        },
        csvMap: {
            date: "date",
            description: "description",
            amount: "amount",
            category_name: "category",
            is_verified: "verified",
            ...overrides.csvMap,
        },
        csvSignConv: overrides.csvSignConv || "neg",
        categories: overrides.categories || categories,
        bankAccounts: overrides.bankAccounts || bankAccounts,
    })!;
}

describe("buildCashflowImportRows", () => {
    it("maps category column values to categories with the matching type", () => {
        const rows = buildRows();

        expect(rows[0]).toMatchObject({
            description: "Lunch",
            amount: "12.5",
            category_id: "1",
            category_name: "",
            category_type: "expense",
            is_verified: "true",
        });
        expect(rows[1]).toMatchObject({
            description: "Paycheck",
            amount: "2000",
            category_id: "2",
            category_name: "",
            category_type: "income",
            is_verified: "false",
        });
    });

    it("uses the fallback for the row type when the CSV category does not match", () => {
        const rows = buildCashflowImportRows({
            csvParsed: {
                headers: ["date", "description", "amount", "category"],
                rows: [
                    ["2026-04-10", "Freelance", "+500.00", "Food"],
                    ["2026-04-11", "Unknown expense", "-20.00", "Unknown"],
                ],
            },
            csvMap: {
                date: "date",
                description: "description",
                amount: "amount",
                category_name: "category",
                expense_category_id: "1",
                income_category_id: "2",
            },
            categories,
        })!;

        expect(rows[0]).toMatchObject({
            category_id: "2",
            category_name: "",
            category_type: "income",
        });
        expect(rows[1]).toMatchObject({
            category_id: "1",
            category_name: "",
            category_type: "expense",
        });
    });

    it("keeps unmatched category names when no fallback is selected", () => {
        const rows = buildCashflowImportRows({
            csvParsed: {
                headers: ["date", "description", "amount", "category"],
                rows: [["2026-04-10", "Mystery", "-20.00", "Unknown"]],
            },
            csvMap: {
                date: "date",
                description: "description",
                amount: "amount",
                category_name: "category",
            },
            categories,
        })!;

        expect(rows[0]).toMatchObject({
            category_id: "",
            category_name: "Unknown",
            category_type: "expense",
        });
    });

    it("supports positive amounts as expenses when configured", () => {
        const rows = buildRows({ csvSignConv: "pos" });

        expect(rows[0]!.category_type).toBe("income");
        expect(rows[1]!.category_type).toBe("expense");
    });

    it("parses localized amounts with thousands separators and currency text", () => {
        const rows = buildCashflowImportRows({
            csvParsed: {
                headers: ["date", "description", "amount"],
                rows: [["2026-04-10", "Rent", "EUR -1.234,56"]],
            },
            csvMap: {
                date: "date",
                description: "description",
                amount: "amount",
            },
            categories,
        })!;

        expect(rows[0]).toMatchObject({
            amount: "1234.56",
            category_type: "expense",
        });
    });

    it("imports the Income-Income.csv shape with type, empty notes, subcategory, account, and status", () => {
        const rows = buildCashflowImportRows({
            csvParsed: {
                headers: [
                    "Type",
                    "Category",
                    "Notes",
                    "Amount",
                    "Date",
                    "Link To Account",
                    "Status",
                ],
                rows: [
                    [
                        "Income",
                        "Father",
                        "",
                        "100,00 €",
                        "19/08/2022",
                        "Trade Republic",
                        "Unverified",
                    ],
                    [
                        "Income",
                        "Salary",
                        "",
                        "500,00 €",
                        "27/09/2023",
                        "Fineco",
                        "Unverified",
                    ],
                ],
            },
            csvMap: {
                type: "Type",
                category_name: "Category",
                description: "Notes",
                amount: "Amount",
                date: "Date",
                linked_asset_name: "Link To Account",
                is_verified: "Status",
            },
            categories,
            bankAccounts,
        })!;

        expect(rows).toHaveLength(2);
        expect(rows[0]).toMatchObject({
            description: "Father",
            amount: "100",
            category_id: "5",
            category_name: "",
            category_type: "income",
            linked_asset: "11",
            linked_asset_name: "",
            is_verified: "Unverified",
        });
        expect(rows[1]).toMatchObject({
            description: "Salary",
            amount: "500",
            category_id: "2",
            category_type: "income",
            linked_asset: "10",
        });
    });
});
