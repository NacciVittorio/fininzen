import { useEffect, useMemo, useState } from "react";
import { Label, MonthPager, GroupedList, CategoryDot, MoneyValue } from "../ui";
import MnwAssetDetailSheet from "./MnwAssetDetailSheet";

const now = () => ({
  month: new Date().getMonth(),
  year: new Date().getFullYear(),
});

// Mobile presentation of the monthly net worth: a per-asset grouped list for
// one month at a time (no horizontal-scroll matrix). Row = name + value at
// the selected month + colored delta vs the previous month. Tap → detail
// sheet with the full 12-month series. Same data source as the grid.
export default function MnwAssetList({
  monthlyOverview,
  year,
  onYearChange,
  availableYears,
  fetchOverviewForYear,
  T,
}) {
  const { month: currentMonth, year: currentYear } = now();

  const defaultMonth = year === currentYear ? currentMonth : 11;
  const [month, setMonth] = useState(defaultMonth); // 0-11
  const [detailAsset, setDetailAsset] = useState(null);

  // Clamp the selected month when the year changes (no future months).
  useEffect(() => {
    setMonth(year === currentYear ? currentMonth : 11);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year]);

  const yearsList = Array.isArray(availableYears) ? availableYears : [];
  const minYear = yearsList.length ? Math.min(...yearsList) : null;

  const typeGroups = useMemo(() => {
    const map = {};
    for (const asset of monthlyOverview?.assets || []) {
      const typeId = asset.investment_type?.id ?? "null";
      if (!map[typeId])
        map[typeId] = { type: asset.investment_type, assets: [] };
      map[typeId].assets.push(asset);
    }
    return Object.values(map);
  }, [monthlyOverview]);

  if (!monthlyOverview) return null;

  const summary = monthlyOverview.summary || {};

  const handlePagerChange = ({ month: newMonth1, year: newYear }) => {
    const newMonth = newMonth1 - 1;
    if (newYear !== year) {
      if (minYear != null && newYear < minYear) return;
      if (newYear > currentYear) return;
      onYearChange(newYear);
      setMonth(newMonth);
      return;
    }
    if (newYear === currentYear && newMonth > currentMonth) return;
    setMonth(newMonth);
  };

  const deltaFor = (values) => {
    if (!values || month === 0) return null;
    const cur = values[month];
    const prev = values[month - 1];
    if (cur == null || prev == null) return null;
    return cur - prev;
  };

  const summaryRows = [
    {
      key: "balance",
      label: T("monthly_balance"),
      isPercent: false,
      delta: false,
    },
    { key: "nw", label: T("monthly_nw"), isPercent: false, delta: false },
    {
      key: "nw_change_abs",
      label: T("monthly_nw_change_abs"),
      isPercent: false,
      delta: true,
    },
    {
      key: "nw_change_pct",
      label: T("monthly_nw_change_pct"),
      isPercent: true,
      delta: true,
    },
    {
      key: "income",
      label: T("monthly_income"),
      isPercent: false,
      delta: false,
    },
    {
      key: "outcome",
      label: T("monthly_outcome"),
      isPercent: false,
      delta: false,
    },
    {
      key: "cash_saving_abs",
      label: T("monthly_cash_saving"),
      isPercent: false,
      delta: true,
    },
    {
      key: "cash_saving_pct",
      label: T("monthly_cash_saving_pct"),
      isPercent: true,
      delta: true,
    },
  ];

  const renderSummaryValue = (row) => {
    const val = summary[row.key]?.[month] ?? null;
    if (val == null) return <span style={{ color: "var(--fg-faint)" }}>—</span>;
    if (row.isPercent) {
      const color = row.delta
        ? val > 0
          ? "var(--success)"
          : val < 0
            ? "var(--danger)"
            : "var(--fg-soft)"
        : "var(--fg)";
      return (
        <span className="num" style={{ fontWeight: 600, color, fontSize: 13 }}>
          {row.delta && val > 0 ? "+" : ""}
          {val.toFixed(2)}%
        </span>
      );
    }
    return (
      <MoneyValue
        value={val}
        size="sm"
        signed={row.delta}
        tone={row.delta ? "auto" : "neutral"}
      />
    );
  };

  return (
    <section>
      <div
        className="between"
        style={{ marginBottom: 12, flexWrap: "wrap", gap: 8 }}
      >
        <Label>{T("dash_monthly_overview")}</Label>
        <MonthPager
          month={month + 1}
          year={year}
          onChange={handlePagerChange}
          disableForward={year === currentYear && month >= currentMonth}
          minWidth={110}
        />
      </div>

      {typeGroups.map(({ type, assets }) => (
        <GroupedList
          key={type?.id ?? "other"}
          title={
            <span
              style={{ display: "inline-flex", alignItems: "center", gap: 7 }}
            >
              <CategoryDot color={type?.color || "var(--accent)"} size={7} />
              {type?.name || "Other"}
            </span>
          }
        >
          {assets.map((asset) => {
            const val = asset.monthly_values?.[month] ?? null;
            const delta = deltaFor(asset.monthly_values);
            return (
              <GroupedList.Item
                key={asset.id}
                label={asset.name}
                subtitle={asset.currency !== "EUR" ? asset.currency : undefined}
                chevron
                onClick={() => setDetailAsset(asset)}
                value={
                  <span
                    style={{
                      display: "inline-flex",
                      flexDirection: "column",
                      alignItems: "flex-end",
                      gap: 3,
                    }}
                  >
                    {val == null ? (
                      <span style={{ color: "var(--fg-faint)" }}>—</span>
                    ) : (
                      <MoneyValue value={val} size="sm" />
                    )}
                    {delta != null && delta !== 0 && (
                      <MoneyValue value={delta} size="xs" signed tone="auto" />
                    )}
                  </span>
                }
              />
            );
          })}
        </GroupedList>
      ))}

      <GroupedList title={T("mnw_totals")}>
        {summaryRows.map((row) => (
          <GroupedList.Item
            key={row.key}
            label={row.label}
            value={renderSummaryValue(row)}
          />
        ))}
      </GroupedList>

      <MnwAssetDetailSheet
        asset={detailAsset}
        open={detailAsset != null}
        onClose={() => setDetailAsset(null)}
        year={year}
        availableYears={availableYears}
        fetchOverviewForYear={fetchOverviewForYear}
        T={T}
      />
    </section>
  );
}
