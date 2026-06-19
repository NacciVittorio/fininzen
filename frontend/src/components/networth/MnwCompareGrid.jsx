import React from "react";
import { useFormatters } from "../../utils/useFormatters";
import { DeltaCell } from "./MnwCells";
import { MnwToolbar } from "./MnwToolbar";
import { getSummaryRows, MONTH_NAMES_SHORT } from "./mnwConstants";

export function MnwCompareGrid({
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
}) {
  const { formatEur } = useFormatters();
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
