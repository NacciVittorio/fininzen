import React from "react";
import { DeltaCell, ValueCell } from "./MnwCells";
import { MnwToolbar } from "./MnwToolbar";
import {
  getSummaryRows,
  getVisibleMonths,
  MONTH_NAMES_SHORT,
} from "./mnwConstants";

export function MnwSingleGrid({
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
  monthlyOverview,
  prevYearOverview,
}) {
  const currentMonth = new Date().getMonth();
  const currentYear = new Date().getFullYear();
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
      <MnwToolbar
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
            {getSummaryRows(T).map(({ key, label, isDelta, isPercent }) => (
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
