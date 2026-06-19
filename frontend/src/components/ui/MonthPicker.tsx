import { useState } from "react";
import { useApp } from "../../context/useApp";

type MonthChange = { month: number | null; year: number };

type MonthPickerProps = {
    month?: number;
    year: number;
    viewMode?: "month" | "year";
    onChange?: (next: MonthChange) => void;
    onViewModeChange?: (mode: string) => void;
};

export default function MonthPicker({
    month,
    year,
    viewMode = "month",
    onChange,
    onViewModeChange,
}: MonthPickerProps) {
    const { MONTHS, T } = useApp();
    const [pickerYear, setPickerYear] = useState(year);

    const handleMonthClick = (m: number) => {
        onChange?.({ month: m, year: pickerYear });
    };
    const handleYearOnly = (y: number) => {
        setPickerYear(y);
        if (viewMode === "year") onChange?.({ month: null, year: y });
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
                            onClick={() => onViewModeChange(m.key)}
                            style={{
                                flex: 1,
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
                    onClick={() => handleYearOnly(pickerYear - 1)}
                    aria-label={T("prev_year")}
                    style={{
                        width: 28,
                        height: 28,
                        background: "var(--card-inset)",
                        border: "1px solid var(--rule)",
                        borderRadius: 999,
                        cursor: "pointer",
                        color: "var(--fg-soft)",
                        fontFamily: "inherit",
                    }}
                >
                    ‹
                </button>
                <span
                    style={{
                        font: "var(--w-heading) 16px / 1 var(--font-sans)",
                        color: "var(--fg)",
                    }}
                >
                    {pickerYear}
                </span>
                <button
                    type="button"
                    onClick={() => handleYearOnly(pickerYear + 1)}
                    aria-label={T("next_year")}
                    style={{
                        width: 28,
                        height: 28,
                        background: "var(--card-inset)",
                        border: "1px solid var(--rule)",
                        borderRadius: 999,
                        cursor: "pointer",
                        color: "var(--fg-soft)",
                        fontFamily: "inherit",
                    }}
                >
                    ›
                </button>
            </div>

            {viewMode === "month" && (
                <div
                    style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(3, 1fr)",
                        gap: 6,
                    }}
                >
                    {labels.map((name, idx) => {
                        const m = idx + 1;
                        const isSelected = m === month && pickerYear === year;
                        return (
                            <button
                                key={m}
                                type="button"
                                onClick={() => handleMonthClick(m)}
                                style={{
                                    padding: "8px 4px",
                                    borderRadius: 10,
                                    border: `1px solid ${isSelected ? "var(--accent-ring)" : "var(--rule)"}`,
                                    background: isSelected
                                        ? "var(--accent-soft)"
                                        : "var(--card-inset)",
                                    color: isSelected
                                        ? "var(--accent-deep)"
                                        : "var(--fg)",
                                    fontFamily: "inherit",
                                    fontSize: 13,
                                    fontWeight: isSelected ? 700 : 500,
                                    cursor: "pointer",
                                    transition: "background 0.12s",
                                }}
                            >
                                {name.slice(0, 3)}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
