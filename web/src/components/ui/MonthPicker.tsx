"use client";

import { useEffect, useState } from "react";
import { useApp } from "../../context/useApp";

type MonthChange = { month: number | null; year: number };

type MonthPickerProps = {
    month?: number;
    year: number;
    viewMode?: "month" | "year";
    onChange?: (next: MonthChange) => void;
    onViewModeChange?: (mode: string) => void;
};

// Year mode shows a grid of years, the same way month mode shows a grid of
// months. It used to render nothing but the ‹ year › header, which made the
// arrows the only control able to emit onChange — so picking "Anno" appeared to
// do nothing until you stepped away and back.
const YEAR_PAGE_SIZE = 12;

// Aligned to fixed blocks so stepping by YEAR_PAGE_SIZE moves exactly one page.
const yearPageStart = (year: number) => year - (year % YEAR_PAGE_SIZE);

export default function MonthPicker({
    month,
    year,
    viewMode = "month",
    onChange,
    onViewModeChange,
}: MonthPickerProps) {
    const { MONTHS, T } = useApp();
    const [pickerYear, setPickerYear] = useState(year);

    // The picker stays mounted while the surrounding sheet is open, so the
    // range can move underneath it (the "Sempre" chip, or switching mode).
    // Without this the header would keep showing a stale year.
    useEffect(() => setPickerYear(year), [year]);

    // The arrows only move the grid; committing a period is always an explicit
    // click on a month or year cell.
    const handleMonthClick = (m: number) => {
        onChange?.({ month: m, year: pickerYear });
    };
    const handleYearClick = (y: number) => {
        setPickerYear(y);
        onChange?.({ month: null, year: y });
    };

    const labels = MONTHS || [
        "Jan",
        "Feb",
        "Mar",
        "Apr",
        "May",
        "Jun",
        "Jul",
        "Aug",
        "Sep",
        "Oct",
        "Nov",
        "Dec",
    ];

    // In month mode the arrows step one year at a time; in year mode they page
    // through the year grid.
    const isYearMode = viewMode === "year";
    const pageStart = yearPageStart(pickerYear);
    const step = isYearMode ? YEAR_PAGE_SIZE : 1;
    const headerLabel = isYearMode
        ? `${pageStart}–${pageStart + YEAR_PAGE_SIZE - 1}`
        : String(pickerYear);

    const arrowStyle = {
        width: 28,
        height: 28,
        background: "var(--card-inset)",
        border: "1px solid var(--rule)",
        borderRadius: 999,
        cursor: "pointer",
        color: "var(--fg-soft)",
        fontFamily: "inherit",
    } as const;

    const cellStyle = (isSelected: boolean) =>
        ({
            padding: "8px 4px",
            borderRadius: 10,
            border: `1px solid ${isSelected ? "var(--accent-ring)" : "var(--rule)"}`,
            background: isSelected ? "var(--accent-soft)" : "var(--card-inset)",
            color: isSelected ? "var(--accent-deep)" : "var(--fg)",
            fontFamily: "inherit",
            fontSize: 13,
            fontWeight: isSelected ? 700 : 500,
            cursor: "pointer",
            transition: "background 0.12s",
        }) as const;

    return (
        <div style={{ minWidth: 260 }}>
            {onViewModeChange && (
                <div
                    style={{
                        display: "flex",
                        background: "var(--card-inset)",
                        border: "1px solid var(--rule)",
                        borderRadius: "var(--r-pill)",
                        padding: 3,
                        marginBottom: 12,
                    }}
                >
                    {[
                        { key: "month", label: T("month") },
                        { key: "year", label: T("year") },
                    ].map((m) => (
                        <button
                            key={m.key}
                            type="button"
                            data-testid={`period-mode-${m.key}`}
                            aria-pressed={viewMode === m.key}
                            onClick={() => onViewModeChange(m.key)}
                            style={{
                                flex: 1,
                                minHeight: 36,
                                padding: "6px 10px",
                                borderRadius: "var(--r-pill)",
                                border: 0,
                                background:
                                    viewMode === m.key
                                        ? "var(--card)"
                                        : "transparent",
                                color:
                                    viewMode === m.key
                                        ? "var(--fg)"
                                        : "var(--fg-soft)",
                                fontFamily: "inherit",
                                fontSize: 12,
                                fontWeight: 600,
                                cursor: "pointer",
                                boxShadow:
                                    viewMode === m.key
                                        ? "0 1px 2px rgba(0,0,0,0.08)"
                                        : "none",
                            }}
                        >
                            {m.label}
                        </button>
                    ))}
                </div>
            )}

            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 10,
                }}
            >
                <button
                    type="button"
                    onClick={() => setPickerYear(pickerYear - step)}
                    aria-label={T("prev_year")}
                    style={arrowStyle}
                >
                    ‹
                </button>
                <span
                    style={{
                        font: "var(--w-heading) 16px / 1 var(--font-sans)",
                        color: "var(--fg)",
                    }}
                >
                    {headerLabel}
                </span>
                <button
                    type="button"
                    onClick={() => setPickerYear(pickerYear + step)}
                    aria-label={T("next_year")}
                    style={arrowStyle}
                >
                    ›
                </button>
            </div>

            <div
                style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(3, 1fr)",
                    gap: 6,
                }}
            >
                {isYearMode
                    ? Array.from(
                          { length: YEAR_PAGE_SIZE },
                          (_, idx) => pageStart + idx,
                      ).map((y) => (
                          <button
                              key={y}
                              type="button"
                              data-testid={`period-year-${y}`}
                              onClick={() => handleYearClick(y)}
                              style={cellStyle(y === year)}
                          >
                              {y}
                          </button>
                      ))
                    : labels.map((name, idx) => {
                          const m = idx + 1;
                          return (
                              <button
                                  key={m}
                                  type="button"
                                  onClick={() => handleMonthClick(m)}
                                  style={cellStyle(
                                      m === month && pickerYear === year,
                                  )}
                              >
                                  {name.slice(0, 3)}
                              </button>
                          );
                      })}
            </div>
        </div>
    );
}
