"use client";

import { useState } from "react";
import { MonthPicker } from "../ui";
import type { Translator } from "../../types";

export type PeriodRange = { from: string; to: string };

/** What the user acted on — lets the caller decide whether to close the sheet. */
export type PeriodPick = "all" | "month" | "year" | "mode";

// "YYYY-MM-DD" split by parts on purpose: new Date("2026-07-01") is parsed as
// UTC, so getMonth()/getFullYear() land on the previous day in negative
// offsets. Same hazard documented in context/appContextHelpers.ts.
const parseIsoDate = (value: string) => {
    const parts = value.split("-");
    const year = Number(parts[0]);
    const month = Number(parts[1]);
    return Number.isFinite(year) && Number.isFinite(month)
        ? { year, month }
        : null;
};

const yearRange = (year: number): PeriodRange => ({
    from: `${year}-01-01`,
    to: `${year}-12-31`,
});

/** Plain calendar month — the Investments feed's notion of a month. */
export const calendarMonthRange = (
    year: number,
    month: number,
): PeriodRange => {
    const pad = String(month).padStart(2, "0");
    const lastDay = new Date(year, month, 0).getDate();
    return {
        from: `${year}-${pad}-01`,
        to: `${year}-${pad}-${String(lastDay).padStart(2, "0")}`,
    };
};

const isYearRange = (from: string, to: string) => {
    const parsed = from ? parseIsoDate(from) : null;
    if (!parsed) return false;
    const range = yearRange(parsed.year);
    return from === range.from && to === range.to;
};

/**
 * The "Periodo" block shared by the Cash Flow and Investments filter sheets and
 * by the Cash Flow header period sheet, so the three cannot drift apart.
 *
 * `monthRange` is the single intended difference between the pages: Cash Flow
 * passes the accounting-month range (configurable start day), Investments passes
 * `calendarMonthRange`.
 */
export default function PeriodFilterSection({
    T,
    dateFrom,
    dateTo,
    onRangeChange,
    monthRange,
    allChipTestId,
}: {
    T: Translator;
    dateFrom: string;
    dateTo: string;
    onRangeChange: (range: PeriodRange, pick: PeriodPick) => void;
    monthRange: (year: number, month: number) => PeriodRange;
    allChipTestId?: string;
}) {
    const now = new Date();
    const parsed = dateFrom ? parseIsoDate(dateFrom) : null;
    const year = parsed?.year ?? now.getFullYear();
    const month = parsed?.month ?? now.getMonth() + 1;

    // Seeded from the active range at mount. The sheet only mounts its children
    // while open, so this re-derives on every open — which is what the
    // Investments panel was missing (its mode lived in the page and stayed on
    // "Mese" even with a year selected).
    const [mode, setMode] = useState<"month" | "year">(() =>
        isYearRange(dateFrom, dateTo) ? "year" : "month",
    );

    const handleModeChange = (next: string) => {
        const nextMode = next === "year" ? "year" : "month";
        setMode(nextMode);
        // Writing the range immediately is what makes "Anno" take effect on the
        // first tap instead of waiting for a year-arrow click.
        onRangeChange(
            nextMode === "year" ? yearRange(year) : monthRange(year, month),
            "mode",
        );
    };

    const allActive = !dateFrom;

    return (
        <div>
            <button
                type="button"
                data-testid={allChipTestId}
                onClick={() => onRangeChange({ from: "", to: "" }, "all")}
                aria-pressed={allActive}
                className="pressable"
                style={{
                    background: allActive
                        ? "var(--accent-soft)"
                        : "var(--card-inset)",
                    color: allActive ? "var(--accent-deep)" : "var(--fg)",
                    border: `1px solid ${allActive ? "var(--accent-ring)" : "var(--rule)"}`,
                    borderRadius: 999,
                    minHeight: 38,
                    padding: "8px 16px",
                    marginBottom: 12,
                    fontSize: 13,
                    fontWeight: allActive ? 700 : 500,
                    cursor: "pointer",
                    fontFamily: "inherit",
                }}
            >
                {T("time_all")}
            </button>
            <MonthPicker
                month={month}
                year={year}
                viewMode={mode}
                onChange={({ month: pickedMonth, year: pickedYear }) =>
                    pickedMonth
                        ? onRangeChange(
                              monthRange(pickedYear, pickedMonth),
                              "month",
                          )
                        : onRangeChange(yearRange(pickedYear), "year")
                }
                onViewModeChange={handleModeChange}
            />
        </div>
    );
}
