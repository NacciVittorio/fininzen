import { describe, it, expect } from "vitest";
import {
    deriveDirectionFilter,
    rowDirection,
    sameMonthYear,
} from "../utils/directionFilter";

describe("deriveDirectionFilter", () => {
    it("returns 'all' when showAllDirections is true regardless of cashflowDir", () => {
        expect(
            deriveDirectionFilter({
                showAllDirections: true,
                cashflowDir: "income",
            }),
        ).toBe("all");
        expect(
            deriveDirectionFilter({
                showAllDirections: true,
                cashflowDir: "expense",
            }),
        ).toBe("all");
    });

    it("returns cashflowDir when showAllDirections is false", () => {
        expect(
            deriveDirectionFilter({
                showAllDirections: false,
                cashflowDir: "income",
            }),
        ).toBe("income");
        expect(
            deriveDirectionFilter({
                showAllDirections: false,
                cashflowDir: "expense",
            }),
        ).toBe("expense");
    });

    it("defaults to 'expense' for unknown cashflowDir values", () => {
        expect(
            deriveDirectionFilter({
                showAllDirections: false,
                cashflowDir: undefined,
            }),
        ).toBe("expense");
        expect(
            deriveDirectionFilter({
                showAllDirections: false,
                cashflowDir: "garbage",
            }),
        ).toBe("expense");
    });
});

describe("rowDirection", () => {
    it("returns income for category with income type", () => {
        expect(rowDirection({ category_type: "income" })).toBe("income");
    });

    it("returns expense for category with expense type", () => {
        expect(rowDirection({ category_type: "expense" })).toBe("expense");
    });

    it("returns expense for missing or unknown category", () => {
        expect(rowDirection(null)).toBe("expense");
        expect(rowDirection(undefined)).toBe("expense");
        expect(rowDirection({})).toBe("expense");
    });
});

describe("sameMonthYear", () => {
    it("matches ISO date inside the given month/year", () => {
        expect(sameMonthYear("2026-05-14", 5, 2026)).toBe(true);
    });

    it("rejects different month", () => {
        expect(sameMonthYear("2026-04-30", 5, 2026)).toBe(false);
    });

    it("rejects different year", () => {
        expect(sameMonthYear("2025-05-14", 5, 2026)).toBe(false);
    });

    it("returns false for empty input", () => {
        expect(sameMonthYear("", 5, 2026)).toBe(false);
        expect(sameMonthYear(null, 5, 2026)).toBe(false);
    });

    it("year-only match when month is falsy", () => {
        expect(sameMonthYear("2026-08-01", null, 2026)).toBe(true);
        expect(sameMonthYear("2025-08-01", null, 2026)).toBe(false);
    });
});
