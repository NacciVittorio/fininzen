import type { CSSProperties } from "react";
import type { MnwMonthRange, MnwToolbarProps } from "./mnwTypes";

const MONTH_RANGES: MnwMonthRange[] = [3, 6, 9, 12];

export function MnwToolbar({
    mode,
    setMode,
    monthRange,
    changeRange,
    yearA,
    yearB,
    updatePrefs,
    year,
    changeYear,
    availableYears,
    T,
}: MnwToolbarProps) {
    const chevronBtn = (disabled: boolean): CSSProperties => ({
        background: "var(--card-inset)",
        border: "1px solid var(--rule)",
        color: disabled ? "var(--fg-faint)" : "var(--fg-soft)",
        borderRadius: 999,
        width: 32,
        height: 32,
        cursor: disabled ? "not-allowed" : "pointer",
        fontSize: 14,
        fontFamily: "inherit",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
    });

    const yearsList = Array.isArray(availableYears) ? availableYears : [];
    const minYear = yearsList.length ? Math.min(...yearsList) : null;
    const maxYear = yearsList.length ? Math.max(...yearsList) : null;
    const canGoPrev = minYear == null || year > minYear;
    const canGoNext = maxYear == null || year < maxYear;

    return (
        <div
            style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "14px 18px",
                borderBottom: "1px solid var(--rule)",
                flexWrap: "wrap",
            }}
        >
            <div
                style={{
                    font: "var(--w-heading) var(--t-h5) / 1 var(--font-sans)",
                    letterSpacing: "var(--ls-h-small)",
                    color: "var(--fg)",
                }}
            >
                {T("dash_monthly_overview")}
            </div>

            <div className="segmented" style={{ marginLeft: 4 }}>
                <button
                    onClick={() => setMode("single")}
                    aria-pressed={mode === "single"}
                >
                    {T("single_mode")}
                </button>
                <button
                    onClick={() => setMode("compare")}
                    aria-pressed={mode === "compare"}
                >
                    {T("compare_mode")}
                </button>
            </div>

            {mode === "single" ? (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <button
                        data-testid="mnw-prev-year"
                        onClick={() => canGoPrev && changeYear(-1)}
                        disabled={!canGoPrev}
                        style={chevronBtn(!canGoPrev)}
                        className="touch-target"
                        aria-label={T("prev_year")}
                    >
                        {"\u2039"}
                    </button>
                    <span
                        style={{
                            color: "var(--fg)",
                            minWidth: 44,
                            textAlign: "center",
                            fontSize: 13,
                            fontWeight: 700,
                            letterSpacing: "var(--ls-label)",
                            fontFamily: "var(--font-sans)",
                        }}
                    >
                        {year}
                    </span>
                    <button
                        data-testid="mnw-next-year"
                        onClick={() => canGoNext && changeYear(1)}
                        disabled={!canGoNext}
                        style={chevronBtn(!canGoNext)}
                        className="touch-target"
                        aria-label={T("next_year")}
                    >
                        {"\u203a"}
                    </button>
                </div>
            ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <YearSelect
                        value={yearA}
                        onChange={(v) => updatePrefs({ yearA: v })}
                        color="var(--chart-4)"
                        availableYears={availableYears}
                    />
                    <span
                        style={{
                            color: "var(--fg-soft)",
                            fontSize: 11,
                            fontWeight: 700,
                        }}
                    >
                        vs
                    </span>
                    <YearSelect
                        value={yearB}
                        onChange={(v) => updatePrefs({ yearB: v })}
                        color="var(--success)"
                        availableYears={availableYears}
                    />
                </div>
            )}

            <div className="segmented" style={{ marginLeft: "auto" }}>
                {MONTH_RANGES.map((r) => (
                    <button
                        key={r}
                        onClick={() => changeRange(r)}
                        aria-pressed={monthRange === r}
                    >
                        {r}M
                    </button>
                ))}
            </div>
        </div>
    );
}

function YearSelect({
    value,
    onChange,
    color,
    availableYears,
}: {
    value: number;
    onChange: (value: number) => void;
    color: string;
    availableYears: number[];
}) {
    const fromBackend = Array.isArray(availableYears) ? availableYears : [];
    const merged = fromBackend.includes(value)
        ? fromBackend
        : [value, ...fromBackend];
    const years = merged.slice().sort((a, b) => b - a);
    return (
        <select
            value={value}
            onChange={(e) => onChange(parseInt(e.target.value))}
            style={{
                background: "var(--card)",
                border: `1px solid color-mix(in oklab, ${color} 35%, transparent)`,
                color,
                borderRadius: 8,
                padding: "4px 10px",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
            }}
        >
            {years.map((y) => (
                <option key={y} value={y}>
                    {y}
                </option>
            ))}
        </select>
    );
}
