import React from "react";
import { useFormatters } from "../../utils/useFormatters";

export const MONTH_NAMES_SHORT = [
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

// Returns array of {year, month} objects covering the last `monthRange` months up to `year`.
export function getVisibleMonths(year, monthRange) {
  const isCurrentYear = year === new Date().getFullYear();
  const lastMonth = isCurrentYear ? new Date().getMonth() : 11;
  const result = [];
  for (let i = monthRange - 1; i >= 0; i--) {
    const m = lastMonth - i;
    if (m < 0) result.push({ year: year - 1, month: m + 12 });
    else result.push({ year, month: m });
  }
  return result;
}

function DeltaCell({ value, isPercent, style }) {
  const { formatEur } = useFormatters();
  if (value == null)
    return (
      <td
        className="mono"
        style={{
          color: "var(--fg-soft)",
          textAlign: "right",
          padding: "4px 6px",
          ...style,
        }}
      >
        —
      </td>
    );
  const color =
    value > 0
      ? "var(--success)"
      : value < 0
        ? "var(--danger)"
        : "var(--fg-soft)";
  const text = isPercent
    ? `${value > 0 ? "+" : ""}${value.toFixed(2)}%`
    : `${value > 0 ? "+" : ""}${formatEur(value)}`;
  return (
    <td
      className="mono"
      style={{ color, textAlign: "right", padding: "4px 6px", ...style }}
    >
      {text}
    </td>
  );
}

function ValueCell({ value, highlight, style }) {
  const { formatEur } = useFormatters();
  const bg = highlight ? "var(--accent-soft)" : "transparent";
  if (value == null)
    return (
      <td
        style={{
          background: bg,
          color: "var(--fg-soft)",
          textAlign: "right",
          padding: "4px 6px",
          ...style,
        }}
      >
        —
      </td>
    );
  return (
    <td
      className="mono"
      style={{
        background: bg,
        textAlign: "right",
        padding: "4px 6px",
        ...style,
      }}
    >
      {formatEur(value)}
    </td>
  );
}

const SUMMARY_ROWS = (T) => [
  {
    key: "balance",
    label: T("monthly_balance"),
    isDelta: false,
    isPercent: false,
  },
  { key: "nw", label: T("monthly_nw"), isDelta: false, isPercent: false },
  {
    key: "nw_change_abs",
    label: T("monthly_nw_change_abs"),
    isDelta: true,
    isPercent: false,
  },
  {
    key: "nw_change_pct",
    label: T("monthly_nw_change_pct"),
    isDelta: true,
    isPercent: true,
  },
  {
    key: "income",
    label: T("monthly_income"),
    isDelta: false,
    isPercent: false,
  },
  {
    key: "outcome",
    label: T("monthly_outcome"),
    isDelta: false,
    isPercent: false,
  },
  {
    key: "cash_saving_abs",
    label: T("monthly_cash_saving"),
    isDelta: true,
    isPercent: false,
  },
  {
    key: "cash_saving_pct",
    label: T("monthly_cash_saving_pct"),
    isDelta: true,
    isPercent: true,
  },
];

// Full-matrix desktop rendering (single + compare). Moved verbatim from the
// pre-redesign MonthlyNetWorthTable: only rendered ≥1024px.
export default function MnwGrid({
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
  compareLoading,
  overviewA,
  overviewB,
  monthlyOverview,
  prevYearOverview,
}) {
  const { formatEur } = useFormatters();

  const currentMonth = new Date().getMonth();
  const currentYear = new Date().getFullYear();

  // ── Compare mode ─────────────────────────────────────────────────────────────

  if (mode === "compare") {
    // Compare mode shows the same calendar months for both years: the last
    // `monthRange` months of the year. Range 6 → [6..11] = Jul-Dec, range 12 → [0..11].
    // Using getVisibleMonths(yearB, ...) was wrong because it can span into yearB-1
    // and discards the year info, mixing different months between A and B.
    const visMonths = Array.from(
      { length: monthRange },
      (_, i) => 12 - monthRange + i,
    );

    const summaryA = overviewA?.summary || {};
    const summaryB = overviewB?.summary || {};

    const assetsA = (overviewA?.assets || []).map((a) => ({
      id: a.id + "_A",
      name: a.name,
      currency: a.currency,
      type: a.investment_type,
      monthly_values: a.monthly_values,
    }));
    const assetsB = (overviewB?.assets || []).map((a) => ({
      id: a.id + "_B",
      name: a.name,
      currency: a.currency,
      type: a.investment_type,
      monthly_values: a.monthly_values,
    }));

    const typeMap = {};
    for (const a of assetsA) {
      const key = a.type?.id ?? "null";
      if (!typeMap[key])
        typeMap[key] = { type: a.type, assetsA: [], assetsB: [] };
      typeMap[key].assetsA.push(a);
    }
    for (const a of assetsB) {
      const key = a.type?.id ?? "null";
      if (!typeMap[key])
        typeMap[key] = { type: a.type, assetsA: [], assetsB: [] };
      typeMap[key].assetsB.push(a);
    }

    const subColStyle = {
      minWidth: "var(--mnw-sub-col-w, 76px)",
      textAlign: "right",
      padding: "4px 4px",
      fontSize: 11,
    };

    return (
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <Toolbar
          mode={mode}
          setMode={setMode}
          monthRange={monthRange}
          changeRange={changeRange}
          yearA={yearA}
          yearB={yearB}
          updatePrefs={updatePrefs}
          year={year}
          changeYear={changeYear}
          availableYears={availableYears}
          T={T}
        />
        {compareLoading ? (
          <div
            style={{
              padding: "32px",
              textAlign: "center",
              color: "var(--fg-soft)",
              fontSize: 13,
            }}
          >
            Loading…
          </div>
        ) : (
          <div className="data-scroll" style={{ overflowX: "auto" }}>
            <table
              style={{
                borderCollapse: "collapse",
                width: "100%",
                fontSize: 12,
                lineHeight: 1.35,
              }}
            >
              <thead>
                <tr style={{ background: "var(--card-inset)" }}>
                  <th
                    style={{
                      textAlign: "left",
                      padding: "6px 12px",
                      minWidth: "var(--mnw-first-col-w, 180px)",
                      position: "sticky",
                      left: 0,
                      background: "var(--card-inset)",
                      zIndex: 1,
                      color: "var(--fg-soft)",
                      fontWeight: 500,
                    }}
                  >
                    Asset
                  </th>
                  <th
                    style={{
                      ...subColStyle,
                      color: "var(--fg-soft)",
                      fontWeight: 500,
                    }}
                  >
                    Curr
                  </th>
                  {visMonths.map((m) => (
                    <th
                      key={m}
                      colSpan={2}
                      style={{
                        ...subColStyle,
                        minWidth: "calc(var(--mnw-sub-col-w, 76px) * 2)",
                        textAlign: "center",
                        borderLeft: "1px solid var(--rule)",
                        color: "var(--fg-soft)",
                        fontWeight: 500,
                      }}
                    >
                      {MONTH_NAMES_SHORT[m]}
                    </th>
                  ))}
                </tr>
                <tr style={{ background: "var(--card-inset)" }}>
                  <th
                    style={{
                      position: "sticky",
                      left: 0,
                      background: "var(--card-inset)",
                      zIndex: 1,
                    }}
                  />
                  <th />
                  {visMonths.map((m) => (
                    <React.Fragment key={m}>
                      <th
                        style={{
                          ...subColStyle,
                          color: "var(--chart-4)",
                          fontWeight: 500,
                          borderLeft: "1px solid var(--rule)",
                        }}
                      >
                        {yearA}
                      </th>
                      <th
                        style={{
                          ...subColStyle,
                          color: "var(--success)",
                          fontWeight: 500,
                        }}
                      >
                        {yearB}
                      </th>
                    </React.Fragment>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Object.values(typeMap).map(
                  ({ type, assetsA: rowsA, assetsB: rowsB }) => {
                    const assetsByName = {};
                    for (const a of rowsA)
                      assetsByName[a.name] = {
                        name: a.name,
                        currency: a.currency,
                        type,
                        A: a.monthly_values,
                        B: null,
                      };
                    for (const a of rowsB) {
                      if (!assetsByName[a.name])
                        assetsByName[a.name] = {
                          name: a.name,
                          currency: a.currency,
                          type,
                          A: null,
                          B: null,
                        };
                      assetsByName[a.name].B = a.monthly_values;
                    }
                    return (
                      <React.Fragment key={`group-${type?.id}`}>
                        <tr
                          style={{
                            background: "var(--card-inset)",
                          }}
                        >
                          <td
                            colSpan={2 + visMonths.length * 2}
                            style={{
                              position: "sticky",
                              left: 0,
                              padding: "5px 12px",
                              color: type?.color || "var(--accent)",
                              fontWeight: 600,
                              fontSize: 11,
                              letterSpacing: 0,
                              textTransform: "uppercase",
                              background: "var(--card-inset)",
                            }}
                          >
                            ■ {type?.name || "Other"}
                          </td>
                        </tr>
                        {Object.values(assetsByName).map((asset) => (
                          <tr
                            key={asset.name}
                            style={{
                              borderTop: "1px solid var(--rule-soft)",
                              background:
                                "color-mix(in srgb, var(--card) 92%, transparent)",
                            }}
                          >
                            <td
                              style={{
                                position: "sticky",
                                left: 0,
                                background: "var(--card)",
                                padding: "4px 12px",
                                color: "var(--fg)",
                                maxWidth: 180,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {asset.name}
                            </td>
                            <td
                              style={{
                                ...subColStyle,
                                color: "var(--fg-soft)",
                              }}
                            >
                              {asset.currency}
                            </td>
                            {visMonths.map((m) => {
                              const vA = asset.A ? asset.A[m] : null;
                              const vB = asset.B ? asset.B[m] : null;
                              return (
                                <React.Fragment key={m}>
                                  <td
                                    className="mono"
                                    style={{
                                      ...subColStyle,
                                      color: "var(--chart-4)",
                                      borderLeft: "1px solid var(--rule)",
                                    }}
                                  >
                                    {vA != null ? formatEur(vA) : "—"}
                                  </td>
                                  <td
                                    className="mono"
                                    style={{
                                      ...subColStyle,
                                      color: "var(--success)",
                                    }}
                                  >
                                    {vB != null ? formatEur(vB) : "—"}
                                  </td>
                                </React.Fragment>
                              );
                            })}
                          </tr>
                        ))}
                      </React.Fragment>
                    );
                  },
                )}

                <tr>
                  <td
                    colSpan={2 + visMonths.length * 2}
                    style={{
                      borderTop: "2px solid var(--rule)",
                    }}
                  />
                </tr>

                {SUMMARY_ROWS(T).map(({ key, label, isDelta, isPercent }) => (
                  <tr
                    key={key}
                    style={{
                      borderTop: "1px solid var(--rule-soft)",
                      background: "var(--card-inset)",
                    }}
                  >
                    <td
                      style={{
                        position: "sticky",
                        left: 0,
                        background: "var(--card)",
                        padding: "4px 12px",
                        color: "var(--fg-soft)",
                        fontWeight: 600,
                        fontSize: 12,
                      }}
                    >
                      {label}
                    </td>
                    <td />
                    {visMonths.map((m) => {
                      const vA = summaryA[key]?.[m] ?? null;
                      const vB = summaryB[key]?.[m] ?? null;
                      return isDelta ? (
                        <React.Fragment key={m}>
                          <DeltaCell
                            value={vA}
                            isPercent={isPercent}
                            style={{
                              ...subColStyle,
                              borderLeft: "1px solid var(--rule)",
                            }}
                          />
                          <DeltaCell
                            value={vB}
                            isPercent={isPercent}
                            style={subColStyle}
                          />
                        </React.Fragment>
                      ) : (
                        <React.Fragment key={m}>
                          <td
                            className="mono"
                            style={{
                              ...subColStyle,
                              borderLeft: "1px solid var(--rule)",
                              color: "var(--chart-4)",
                            }}
                          >
                            {vA != null ? formatEur(vA) : "—"}
                          </td>
                          <td
                            className="mono"
                            style={{
                              ...subColStyle,
                              color: "var(--success)",
                            }}
                          >
                            {vB != null ? formatEur(vB) : "—"}
                          </td>
                        </React.Fragment>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  // ── Single mode ─────────────────────────────────────────────────────────────

  if (!monthlyOverview) return null;

  // Build a lookup: assetId → {year → monthly_values}
  const assetDataByYear = {};
  for (const asset of monthlyOverview.assets) {
    assetDataByYear[asset.id] = { [year]: asset.monthly_values };
  }
  if (prevYearOverview) {
    for (const asset of prevYearOverview.assets) {
      if (!assetDataByYear[asset.id]) assetDataByYear[asset.id] = {};
      assetDataByYear[asset.id][year - 1] = asset.monthly_values;
    }
  }

  // Build summary lookup: year → summary
  const summaryByYear = { [year]: monthlyOverview.summary };
  if (prevYearOverview) summaryByYear[year - 1] = prevYearOverview.summary;

  // Merge asset list (current year as base, add any from prevYear not in current)
  const allAssets = [...monthlyOverview.assets];
  if (prevYearOverview) {
    const currentIds = new Set(monthlyOverview.assets.map((a) => a.id));
    for (const a of prevYearOverview.assets) {
      if (!currentIds.has(a.id)) allAssets.push(a);
    }
  }

  const typeMap = {};
  for (const asset of allAssets) {
    const typeId = asset.investment_type?.id ?? "null";
    if (!typeMap[typeId])
      typeMap[typeId] = { type: asset.investment_type, assets: [] };
    typeMap[typeId].assets.push(asset);
  }

  const visibleMonths = getVisibleMonths(year, monthRange);
  const colStyle = {
    minWidth: "var(--mnw-month-col-w, 100px)",
    textAlign: "right",
    padding: "4px 8px",
  };
  const spansPrevYear = visibleMonths.some((vm) => vm.year === year - 1);

  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      <Toolbar
        mode={mode}
        setMode={setMode}
        monthRange={monthRange}
        changeRange={changeRange}
        yearA={yearA}
        yearB={yearB}
        updatePrefs={updatePrefs}
        year={year}
        changeYear={changeYear}
        availableYears={availableYears}
        T={T}
      />
      <div className="data-scroll" style={{ overflowX: "auto" }}>
        <table
          style={{
            borderCollapse: "collapse",
            width: "100%",
            fontSize: 12,
            lineHeight: 1.35,
          }}
        >
          <thead>
            <tr style={{ background: "var(--card-inset)" }}>
              <th
                style={{
                  textAlign: "left",
                  padding: "6px 12px",
                  minWidth: "var(--mnw-first-col-w, 200px)",
                  position: "sticky",
                  left: 0,
                  background: "var(--card-inset)",
                  zIndex: 1,
                  color: "var(--fg-soft)",
                  fontWeight: 500,
                }}
              >
                Asset
              </th>
              <th
                style={{
                  ...colStyle,
                  color: "var(--fg-soft)",
                  fontWeight: 500,
                }}
              >
                Curr
              </th>
              {visibleMonths.map(({ year: vy, month: m }) => (
                <th
                  key={`${vy}-${m}`}
                  style={{
                    ...colStyle,
                    background:
                      vy === currentYear && m === currentMonth
                        ? "var(--accent-soft)"
                        : "transparent",
                    color: "var(--fg-soft)",
                    fontWeight: 500,
                  }}
                >
                  {MONTH_NAMES_SHORT[m]}
                  {spansPrevYear ? (
                    <span
                      style={{
                        fontSize: 10,
                        opacity: 0.6,
                      }}
                    >
                      {" "}
                      '{String(vy).slice(2)}
                    </span>
                  ) : null}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Object.values(typeMap).map(({ type, assets }) => (
              <React.Fragment key={`group-${type?.id}`}>
                <tr style={{ background: "var(--card-inset)" }}>
                  <td
                    colSpan={2 + visibleMonths.length}
                    style={{
                      position: "sticky",
                      left: 0,
                      padding: "5px 12px",
                      color: type?.color || "var(--accent)",
                      fontWeight: 600,
                      fontSize: 11,
                      letterSpacing: 0,
                      textTransform: "uppercase",
                      background: "var(--card-inset)",
                    }}
                  >
                    ■ {type?.name || "Other"}
                  </td>
                </tr>
                {assets.map((asset) => (
                  <tr
                    key={asset.id}
                    style={{
                      borderTop: "1px solid var(--rule-soft)",
                      background:
                        "color-mix(in srgb, var(--card) 92%, transparent)",
                    }}
                  >
                    <td
                      style={{
                        position: "sticky",
                        left: 0,
                        background: "var(--card)",
                        padding: "4px 12px",
                        color: "var(--fg)",
                        maxWidth: 200,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {asset.name}
                    </td>
                    <td
                      style={{
                        ...colStyle,
                        color: "var(--fg-soft)",
                      }}
                    >
                      {asset.currency}
                    </td>
                    {visibleMonths.map(({ year: vy, month: m }) => {
                      const isFuture = vy === currentYear && m > currentMonth;
                      const highlight =
                        vy === currentYear && m === currentMonth;
                      const val = isFuture
                        ? null
                        : (assetDataByYear[asset.id]?.[vy]?.[m] ?? null);
                      return (
                        <ValueCell
                          key={`${vy}-${m}`}
                          value={val}
                          highlight={highlight}
                        />
                      );
                    })}
                  </tr>
                ))}
              </React.Fragment>
            ))}
            <tr>
              <td
                colSpan={2 + visibleMonths.length}
                style={{ borderTop: "2px solid var(--rule)" }}
              />
            </tr>
            {SUMMARY_ROWS(T).map(({ key, label, isDelta, isPercent }) => (
              <tr
                key={key}
                style={{
                  borderTop: "1px solid var(--rule-soft)",
                  background: "var(--card-inset)",
                }}
              >
                <td
                  style={{
                    position: "sticky",
                    left: 0,
                    background: "var(--card)",
                    padding: "4px 12px",
                    color: "var(--fg-soft)",
                    fontWeight: 600,
                    fontSize: 12,
                  }}
                >
                  {label}
                </td>
                <td />
                {visibleMonths.map(({ year: vy, month: m }) => {
                  const isFuture = vy === currentYear && m > currentMonth;
                  const highlight = vy === currentYear && m === currentMonth;
                  const val = isFuture
                    ? null
                    : (summaryByYear[vy]?.[key]?.[m] ?? null);
                  if (isDelta)
                    return (
                      <DeltaCell
                        key={`${vy}-${m}`}
                        value={val}
                        isPercent={isPercent}
                      />
                    );
                  return (
                    <ValueCell
                      key={`${vy}-${m}`}
                      value={val}
                      highlight={highlight}
                    />
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Shared toolbar ────────────────────────────────────────────────────────────

function Toolbar({
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
}) {
  const chevronBtn = (disabled) => ({
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

  // Disable arrows when navigating outside the available data range. If the
  // backend has not reported any year yet (fresh DB), keep arrows enabled.
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

      {/* Mode toggle — pill segmented */}
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

      {/* Year selectors */}
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
            ‹
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
            ›
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
            style={{ color: "var(--fg-soft)", fontSize: 11, fontWeight: 700 }}
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

      {/* Month range — pill segmented */}
      <div className="segmented" style={{ marginLeft: "auto" }}>
        {[3, 6, 9, 12].map((r) => (
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

function YearSelect({ value, onChange, color, availableYears }) {
  // Only show years for which the backend has data. Always include the current
  // selected value so the <select> doesn't render a phantom option mismatch.
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
