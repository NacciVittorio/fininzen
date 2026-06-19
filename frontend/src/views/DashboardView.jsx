import { useCallback, useEffect, useMemo, useState } from "react";
import { useApp } from "../context/useApp";

import { currentYear, currentMonth } from "../utils/formatters";
import { useFormatters } from "../utils/useFormatters";
import { groupRows } from "../utils/allocationGroups";
import {
  PieChart,
  MultiLineChart,
  BarTrendChart,
  BarRow,
} from "../components/Charts";
import MonthlyNetWorthTable from "../components/MonthlyNetWorthTable";
import PrivacyValue from "../components/PrivacyValue";
import InvestmentDeepDiveSheet from "../components/InvestmentDeepDiveSheet";
import {
  Card,
  Label,
  Pill,
  KpiCard,
  KpiStrip,
  SegmentedControl,
  MonthPager,
  CategoryDot,
  ProgressBar,
  PullToRefresh,
  LargeTitleHeader,
} from "../components/ui";

const WEALTH_RANGES = ["1M", "6M", "1Y", "5Y", "MAX"];

function SectionLabel({ children }) {
  return <Label style={{ marginBottom: 10 }}>{children}</Label>;
}

export default function DashboardView() {
  const { formatEur } = useFormatters();
  const {
    setTab,
    T,
    MONTHS,
    bootstrapReady,
    dashConfig,
    categories,
    s,
    investments,
    expSummary,
    expSummaryCurrentMonth,
    recurringStatus,
    investmentTypes,
    bankAccounts,
    budgets,
    recurringSaving,
    generateRecurringForMonth,
    filterMonth,
    setFilterMonth,
    filterYear,
    setFilterYear,
    setFilterCat,
    pieHover,
    setPieHover,
    allocChartType,
    setAllocChartType,
    portfolioHistory,
    wealthTimeRange,
    setWealthTimeRange,
    wealthRangeOffset,
    setWealthRangeOffset,
    wealthMetrics,
    toggleWealthMetric,
    fireGoal,
    isFeatureEnabled,
    kpiData,
    monthlyTrend,
    monthlyIncomeTrend,
    isValueHidden,
    fetchPortfolioSummary,
    fetchExpSummary,
    fetchPortfolioHistory,
    fetchBudgets,
    fetchTrendExpenses,
    fetchTrendIncomes,
  } = useApp();

  // Legacy range values (1D/5D/1W) were dropped with the 5-option segmented
  // control — coerce a stale localStorage preference to the closest range.
  useEffect(() => {
    if (!WEALTH_RANGES.includes(wealthTimeRange)) setWealthTimeRange("1M");
  }, [wealthTimeRange, setWealthTimeRange]);

  const [cardCashflowDir, setCardCashflowDir] = useState("expense");
  const [allocGroup, setAllocGroup] = useState("all");
  // Investment deep-dive sheet: holds a type_id (drill into one category) or
  // "all" (browse every category); null = closed.
  const [deepDiveType, setDeepDiveType] = useState(null);
  const allocationDeepDiveAssets = useMemo(() => {
    if (allocGroup === "accounts") return bankAccounts;
    if (allocGroup === "investments") return investments;
    return [...investments, ...bankAccounts];
  }, [allocGroup, investments, bankAccounts]);
  const cardCashflowRows = useMemo(() => {
    const rows = expSummary?.by_category || [];
    if (cardCashflowDir === "income") {
      return rows.filter((c) => c.category__category_type === "income");
    }
    return rows.filter(
      (c) =>
        !c.category__category_type || c.category__category_type === "expense",
    );
  }, [expSummary, cardCashflowDir]);

  // Donut: top 5 categories + "Altro". Each slice uses the category's own color
  // chosen in Settings; falls back to a positional token when a category has no
  // color set.
  const donutRows = useMemo(() => {
    const sorted = [...cardCashflowRows].sort(
      (a, b) => parseFloat(b.total || 0) - parseFloat(a.total || 0),
    );
    const top = sorted.slice(0, 5).map((c, i) => ({
      name: c.category__name || "—",
      total: parseFloat(c.total || 0),
      color: c.category__color || `var(--chart-${i + 1})`,
      catId:
        categories.find((cat) => cat.id && cat.name === c.category__name)?.id ??
        null,
      isOther: false,
    }));
    const rest = sorted.slice(5);
    if (rest.length > 0) {
      top.push({
        name: T("dash_other"),
        total: rest.reduce((sum, c) => sum + parseFloat(c.total || 0), 0),
        color: "var(--chart-6)",
        catId: null,
        isOther: true,
      });
    }
    return top;
  }, [cardCashflowRows, categories, T]);
  const donutTotal = donutRows.reduce((sum, r) => sum + r.total, 0);

  const [trendDir, setTrendDir] = useState("expense");

  const handlePullRefresh = useCallback(async () => {
    await Promise.all([
      fetchPortfolioSummary(),
      fetchExpSummary(),
      fetchPortfolioHistory(),
      fetchBudgets(),
      fetchTrendExpenses(),
      fetchTrendIncomes(),
    ]);
  }, [
    fetchPortfolioSummary,
    fetchExpSummary,
    fetchPortfolioHistory,
    fetchBudgets,
    fetchTrendExpenses,
    fetchTrendIncomes,
  ]);

  const isDashboardSectionEnabled = (sectionId) => {
    const anyWealthFeature =
      isFeatureEnabled("accounts") || isFeatureEnabled("investments");
    const requirements = {
      wealth_trend: anyWealthFeature,
      monthly_overview: anyWealthFeature || isFeatureEnabled("cashflow"),
      expenses_pie: isFeatureEnabled("cashflow"),
      expenses_trend: isFeatureEnabled("cashflow"),
      budget_progress: isFeatureEnabled("cashflow"),
      recurring_overview: isFeatureEnabled("cashflow"),
      portfolio_alloc: isFeatureEnabled("investments"),
      currency_exposure: anyWealthFeature,
    };
    return requirements[sectionId] ?? true;
  };

  // ── dash sections ────────────────────────────────────────────────────────

  const dashSections = {
    wealth_trend: (() => {
      // Build bank-account type IDs for splitting balance vs investing in breakdown
      const bankTypeIds = new Set(
        (investmentTypes || [])
          .filter((t) => t.is_bank_account)
          .map((t) => String(t.id)),
      );

      // Metric definitions for toggle pills (wealth-only: no monthly cashflow metrics here)
      const METRICS = [
        {
          id: "wealth",
          label: T("wm_wealth"),
          color: "var(--chart-1)",
          yAxis: "left",
        },
        {
          id: "balance",
          label: T("wm_balance"),
          color: "var(--chart-4)",
          yAxis: "left",
        },
        {
          id: "investing",
          label: T("wm_investing"),
          color: "var(--chart-2)",
          yAxis: "left",
        },
        {
          id: "goal",
          label: T("wm_goal"),
          color: "var(--chart-3)",
          yAxis: "left",
        },
      ];

      // Map history points to series data
      const toDate = (p) => p.snapshot_date?.split("T")[0] || p.snapshot_date;

      // For long ranges (5Y/MAX) the daily series is thousands of points and
      // produces sluggish SVG. Downsample to the last available point per month.
      const downsampleEoM = (data) => {
        const byMonth = new Map();
        for (const p of data) {
          const key = p.date?.slice(0, 7);
          if (!key) continue;
          const existing = byMonth.get(key);
          if (!existing || p.date > existing.date) byMonth.set(key, p);
        }
        return Array.from(byMonth.values()).sort((a, b) =>
          a.date.localeCompare(b.date),
        );
      };
      const needsDownsample =
        wealthTimeRange === "5Y" || wealthTimeRange === "MAX";

      const rawWealth = portfolioHistory.map((p) => ({
        date: toDate(p),
        value: parseFloat(p.total_value || 0),
      }));
      const rawBalance = portfolioHistory.map((p) => {
        const bc = p.by_asset_class || {};
        const val = Object.entries(bc)
          .filter(([tid]) => bankTypeIds.has(tid))
          .reduce((s, [, v]) => s + v, 0);
        return { date: toDate(p), value: val };
      });
      const rawInvesting = portfolioHistory.map((p) => {
        const bc = p.by_asset_class || {};
        const val = Object.entries(bc)
          .filter(([tid]) => !bankTypeIds.has(tid))
          .reduce((s, [, v]) => s + v, 0);
        return { date: toDate(p), value: val };
      });

      const wealthData = needsDownsample ? downsampleEoM(rawWealth) : rawWealth;
      const balanceData = needsDownsample
        ? downsampleEoM(rawBalance)
        : rawBalance;
      const investingData = needsDownsample
        ? downsampleEoM(rawInvesting)
        : rawInvesting;

      const seriesMap = {
        wealth: { data: wealthData, ...METRICS[0] },
        balance: { data: balanceData, ...METRICS[1] },
        investing: { data: investingData, ...METRICS[2] },
      };

      const activeSeries = wealthMetrics
        .filter((m) => m !== "goal")
        .map((m) => seriesMap[m])
        .filter(Boolean);

      const chartHasData = activeSeries.some(
        (s) => s.data && s.data.length > 1,
      );
      const goalLineValue =
        wealthMetrics.includes("goal") && fireGoal ? fireGoal : null;

      // Period label for month navigation
      const toDateStr = (p) =>
        p.snapshot_date?.split("T")[0] || p.snapshot_date;
      const rangeStartStr =
        portfolioHistory.length > 0 ? toDateStr(portfolioHistory[0]) : null;
      const rangeEndStr =
        portfolioHistory.length > 0
          ? toDateStr(portfolioHistory[portfolioHistory.length - 1])
          : null;
      const isShortRange = wealthTimeRange === "1M";
      const periodLabel = (() => {
        if (isShortRange || !rangeStartStr) return null;
        const fmt = (str) => {
          const [y, m] = str.split("-");
          return `${MONTHS[parseInt(m, 10) - 1]} ${y}`;
        };
        return `${fmt(rangeStartStr)} — ${fmt(rangeEndStr || rangeStartStr)}`;
      })();

      const pagerBtnStyle = (disabled) => ({
        background: "var(--card-inset)",
        border: "1px solid var(--rule)",
        color: disabled ? "var(--fg-faint)" : "var(--fg-soft)",
        borderRadius: 999,
        width: 32,
        height: 32,
        cursor: disabled ? "not-allowed" : "pointer",
        fontSize: 14,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      });

      return (
        <Card>
          <div style={{ marginBottom: 12 }}>
            <div
              className="between"
              style={{ marginBottom: 10, flexWrap: "wrap", gap: 8 }}
            >
              <SectionLabel>{T("dash_wealth_trend")}</SectionLabel>
              <SegmentedControl
                options={WEALTH_RANGES}
                value={wealthTimeRange}
                onChange={setWealthTimeRange}
              />
            </div>
            {/* Month navigation (only for 6M+) */}
            {!isShortRange && (
              <div className="between" style={{ marginBottom: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <button
                    onClick={() => setWealthRangeOffset(wealthRangeOffset + 1)}
                    className="touch-target pressable"
                    aria-label="Previous period"
                    style={pagerBtnStyle(false)}
                  >
                    ‹
                  </button>
                  <span
                    className="num"
                    style={{
                      fontSize: 11,
                      color: "var(--fg-soft)",
                      minWidth: 160,
                      textAlign: "center",
                    }}
                  >
                    {periodLabel || "—"}
                  </span>
                  <button
                    disabled={wealthRangeOffset === 0}
                    onClick={() =>
                      setWealthRangeOffset(Math.max(0, wealthRangeOffset - 1))
                    }
                    className="touch-target pressable"
                    aria-label="Next period"
                    style={pagerBtnStyle(wealthRangeOffset === 0)}
                  >
                    ›
                  </button>
                </div>
              </div>
            )}
            {/* Metric toggle pills */}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {METRICS.filter((m) => m.id !== "goal" || fireGoal).map((m) => {
                const active = wealthMetrics.includes(m.id);
                return (
                  <button
                    key={m.id}
                    onClick={() => toggleWealthMetric(m.id)}
                    aria-pressed={active}
                    className="pressable"
                    style={{
                      background: active
                        ? "var(--accent-soft)"
                        : "var(--card-inset)",
                      border: `1px solid ${active ? "var(--accent-ring)" : "var(--rule)"}`,
                      color: active ? "var(--fg)" : "var(--fg-soft)",
                      borderRadius: 20,
                      padding: "5px 12px",
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: "pointer",
                      fontFamily: "inherit",
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <CategoryDot
                      color={active ? m.color : "var(--fg-faint)"}
                      size={7}
                    />
                    {m.label}
                  </button>
                );
              })}
            </div>
          </div>
          {portfolioHistory.length > 1 ? (
            chartHasData ? (
              <MultiLineChart
                series={activeSeries}
                height={200}
                goalLine={goalLineValue}
                goalLabel={T("chart_goal_label")}
              />
            ) : (
              <div
                style={{
                  textAlign: "center",
                  color: "var(--fg-faint)",
                  fontSize: 13,
                  padding: "40px 0",
                }}
              >
                {T("wm_no_chart_data")}
              </div>
            )
          ) : (
            <div
              style={{
                textAlign: "center",
                color: "var(--fg-faint)",
                fontSize: 13,
                padding: "40px 0",
              }}
            >
              No data yet — refresh prices to start tracking
            </div>
          )}
        </Card>
      );
    })(),

    kpi_cards: isFeatureEnabled("cashflow")
      ? (() => {
          const inc = parseFloat(kpiData.monthlyInc || 0);
          const exp = parseFloat(kpiData.monthlyExp || 0);
          const balance = inc - exp;
          return (
            <KpiStrip columns={3}>
              <KpiCard
                compact
                label={T("kpi_monthly_income")}
                tone="positive"
                value={<span className="num">{formatEur(inc)}</span>}
              />
              <KpiCard
                compact
                label={T("monthly_expenses")}
                tone="danger"
                value={<span className="num">{formatEur(exp)}</span>}
              />
              <KpiCard
                compact
                label={T("kpi_month_balance")}
                tone={balance >= 0 ? "positive" : "danger"}
                value={
                  <span className="num">
                    {balance >= 0 ? "+" : ""}
                    {formatEur(balance)}
                  </span>
                }
              />
            </KpiStrip>
          );
        })()
      : null,

    expenses_pie: (
      <Card>
        <div
          className="between"
          style={{ marginBottom: 12, flexWrap: "wrap", gap: 8 }}
        >
          <SectionLabel>{T("cash_flow_category")}</SectionLabel>
          <MonthPager
            month={filterMonth}
            year={filterYear}
            onChange={({ month, year }) => {
              setFilterMonth(month);
              setFilterYear(year);
            }}
            disableForward={
              filterYear === currentYear && filterMonth >= currentMonth
            }
            minWidth={110}
          />
        </div>
        <div style={{ marginBottom: 14, display: "flex" }}>
          <SegmentedControl
            options={[
              { value: "expense", label: T("cf_outcome") },
              { value: "income", label: T("cf_income") },
            ]}
            value={cardCashflowDir}
            onChange={setCardCashflowDir}
          />
        </div>
        {donutRows.length > 0 ? (
          <div
            className="mob-col mob-wrap"
            style={{
              display: "flex",
              gap: 20,
              alignItems: "center",
              flexWrap: "wrap",
              justifyContent: "center",
            }}
          >
            <PieChart
              data={donutRows.map((r) => ({
                total: r.total,
                category__color: r.color,
                category__name: r.name,
              }))}
              size={200}
              hoveredIndex={pieHover}
              onHoverChange={setPieHover}
              tLabel={T("total_label") || "total"}
              tPctOfTotal={T("pct_of_total")}
              onSliceClick={(slice) => {
                const row = donutRows.find(
                  (r) => r.name === slice.category__name,
                );
                if (!row || row.isOther) return;
                if (row.catId) setFilterCat([String(row.catId)]);
                setTab("expenses");
              }}
            />
            <div style={{ flex: "1 1 260px", minWidth: 0, width: "100%" }}>
              {donutRows.map((r, i) => {
                const isActive = pieHover === i;
                const isIncome = cardCashflowDir === "income";
                const pct = donutTotal > 0 ? (r.total / donutTotal) * 100 : 0;
                const clickable = !r.isOther;
                return (
                  <div
                    key={i}
                    className="between"
                    onMouseEnter={() => setPieHover(i)}
                    onMouseLeave={() => setPieHover(null)}
                    onClick={
                      clickable
                        ? () => {
                            if (r.catId) setFilterCat([String(r.catId)]);
                            setTab("expenses");
                          }
                        : undefined
                    }
                    style={{
                      width: "100%",
                      padding: "9px 2px",
                      borderBottom:
                        i < donutRows.length - 1
                          ? "1px solid var(--rule)"
                          : "none",
                      cursor: clickable ? "pointer" : "default",
                      opacity: pieHover !== null && !isActive ? 0.45 : 1,
                      transition: "opacity 0.15s",
                    }}
                  >
                    <div
                      className="row"
                      style={{ alignItems: "center", gap: 8, minWidth: 0 }}
                    >
                      <CategoryDot color={r.color} />
                      <span
                        style={{
                          fontSize: 13,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {r.name}
                      </span>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        flexShrink: 0,
                        marginLeft: 12,
                      }}
                    >
                      <span
                        className="num"
                        style={{ fontSize: 11, color: "var(--fg-soft)" }}
                      >
                        {pct.toFixed(1)}%
                      </span>
                      <span
                        className="num"
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          color: isIncome ? "var(--success)" : "var(--danger)",
                        }}
                      >
                        {isIncome ? "+" : "-"}
                        {formatEur(r.total)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div
            style={{
              textAlign: "center",
              color: "var(--fg-faint)",
              fontSize: 13,
              padding: "20px 0",
            }}
          >
            {cardCashflowDir === "income"
              ? T("no_income_month")
              : T("no_expenses_month")}
          </div>
        )}
      </Card>
    ),

    expenses_trend: (() => {
      const isIncome = trendDir === "income";
      const data = isIncome ? monthlyIncomeTrend : monthlyTrend;
      return (
        <Card>
          <div
            className="between"
            style={{ marginBottom: 12, flexWrap: "wrap", gap: 8 }}
          >
            <SectionLabel>
              {isIncome ? T("dash_income_trend") : T("dash_expenses_trend")}
            </SectionLabel>
            <SegmentedControl
              options={[
                { value: "expense", label: T("cf_outcome") },
                { value: "income", label: T("cf_income") },
              ]}
              value={trendDir}
              onChange={setTrendDir}
            />
          </div>
          {data.length > 0 ? (
            <BarTrendChart
              data={data}
              height={140}
              color={isIncome ? "var(--chart-2)" : "var(--chart-1)"}
            />
          ) : (
            <div
              style={{
                textAlign: "center",
                color: "var(--fg-faint)",
                fontSize: 13,
                padding: "20px 0",
              }}
            >
              No data
            </div>
          )}
        </Card>
      );
    })(),

    portfolio_alloc: (() => {
      const rr = kpiData.returnRate;
      const rrNum = typeof rr === "number" ? rr : parseFloat(rr || 0);
      const returnPill = (
        <Pill tone={rrNum >= 0 ? "success" : "danger"}>
          <span className="num">
            {rrNum >= 0 ? "+" : ""}
            {rrNum.toFixed(1)}%
          </span>
          &nbsp;{T("kpi_return_rate")}
        </Pill>
      );
      const grouped = groupRows(s.by_type || [], {
        group: allocGroup,
        getIsBank: (t) => t.is_bank_account,
        getValue: (t) => parseFloat(t.total_current || 0),
      });
      const groupTotal = grouped.reduce((sum, g) => sum + g.value, 0);
      const groupControl = (
        <SegmentedControl
          options={[
            { value: "all", label: T("alloc_group_all") },
            { value: "investments", label: T("alloc_group_investments") },
            { value: "accounts", label: T("alloc_group_accounts") },
          ]}
          value={allocGroup}
          onChange={setAllocGroup}
        />
      );
      return (
        <Card>
          <div
            className="between"
            style={{ marginBottom: 12, flexWrap: "wrap", gap: 8 }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                flexWrap: "wrap",
              }}
            >
              <SectionLabel>{T("portfolio_alloc")}</SectionLabel>
              {returnPill}
            </div>
            <SegmentedControl
              options={[
                { value: "bar", label: T("chart_bar") },
                { value: "pie", label: T("chart_pie") },
              ]}
              value={allocChartType}
              onChange={setAllocChartType}
            />
          </div>
          <div
            style={{
              marginBottom: 16,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            <div style={{ display: "flex", minWidth: 0 }}>{groupControl}</div>
            {grouped.length > 0 && allocationDeepDiveAssets.length > 0 && (
              <button
                className="btn btn-g btn-sm pressable"
                style={{ fontSize: 11, flexShrink: 0 }}
                onClick={() => setDeepDiveType("all")}
              >
                {T("deepdive_open")} ›
              </button>
            )}
          </div>
          {grouped.length === 0 ? (
            <div
              style={{
                textAlign: "center",
                color: "var(--fg-faint)",
                fontSize: 13,
                padding: "20px 0",
              }}
            >
              {T("no_data")}
            </div>
          ) : allocChartType === "pie" ? (
            <div
              className="mob-col mob-wrap"
              style={{
                display: "flex",
                gap: 20,
                alignItems: "flex-start",
                flexWrap: "wrap",
                justifyContent: "center",
              }}
            >
              <PieChart
                data={grouped.map(({ row: t }) => ({
                  total: t.total_current,
                  category__color: t.type_color || "var(--accent)",
                  category__name: t.type_name || "Unknown",
                }))}
                size={200}
                tLabel={T("portfolio_alloc")}
                tPctOfTotal="%"
              />
              <div style={{ flex: "1 1 260px", minWidth: 0, width: "100%" }}>
                {grouped.map(({ row: t, value: cur, pct: allocPct }, i) => {
                  const inv = parseFloat(t.total_invested || 0);
                  const gainPct = inv ? ((cur - inv) / inv) * 100 : 0;
                  return (
                    <div
                      key={i}
                      onClick={() => setDeepDiveType(t.type_id ?? "none")}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        width: "100%",
                        padding: "8px 0",
                        cursor: "pointer",
                        borderBottom:
                          i < grouped.length - 1
                            ? "1px solid var(--rule)"
                            : "none",
                      }}
                    >
                      <div
                        className="row"
                        style={{
                          gap: 8,
                          alignItems: "center",
                          minWidth: 0,
                        }}
                      >
                        <CategoryDot color={t.type_color || "var(--accent)"} />
                        <span
                          style={{
                            fontSize: 13,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {t.type_name}
                        </span>
                      </div>
                      <div
                        style={{
                          display: "flex",
                          gap: 10,
                          alignItems: "center",
                          flexShrink: 0,
                          marginLeft: 12,
                        }}
                      >
                        <span
                          className="num"
                          style={{
                            fontSize: 11,
                            color: "var(--fg-soft)",
                          }}
                        >
                          {allocPct.toFixed(1)}%
                        </span>
                        <span
                          className="num"
                          style={{
                            fontSize: 12,
                            fontWeight: 600,
                            color:
                              gainPct >= 0 ? "var(--success)" : "var(--danger)",
                            minWidth: 52,
                            textAlign: "right",
                          }}
                        >
                          {gainPct >= 0 ? "+" : ""}
                          {gainPct.toFixed(1)}%
                        </span>
                        <span
                          aria-hidden="true"
                          style={{
                            color: "var(--fg-faint)",
                            fontSize: 15,
                          }}
                        >
                          ›
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            grouped.map(({ row: t, value: cur, pct: allocPct }, i) => {
              const inv = parseFloat(t.total_invested || 0);
              const gainPct = inv ? ((cur - inv) / inv) * 100 : null;
              const bar = (
                <BarRow
                  label={t.type_name || "Unknown"}
                  value={cur}
                  total={groupTotal}
                  color={t.type_color || "var(--accent)"}
                  extra={
                    gainPct !== null
                      ? `${gainPct >= 0 ? "+" : ""}${gainPct.toFixed(1)}%  ${allocPct.toFixed(1)}%`
                      : `${allocPct.toFixed(1)}%`
                  }
                />
              );
              return (
                <div
                  key={i}
                  onClick={() => setDeepDiveType(t.type_id ?? "none")}
                  style={{ cursor: "pointer" }}
                >
                  {bar}
                </div>
              );
            })
          )}
        </Card>
      );
    })(),

    currency_exposure: (() => {
      const rows = s.by_currency || [];
      const colorFor = (i) => `var(--chart-${(i % 6) + 1})`;
      return (
        <Card>
          <SectionLabel>{T("dash_currency_exposure")}</SectionLabel>
          {rows.length > 0 ? (
            <div
              className="mob-col mob-wrap"
              style={{
                display: "flex",
                gap: 20,
                alignItems: "center",
                flexWrap: "wrap",
                marginTop: 12,
              }}
            >
              <PieChart
                data={rows.map((r, i) => ({
                  total: parseFloat(r.total_eur || 0),
                  category__color: colorFor(i),
                  category__name: r.currency,
                }))}
                size={200}
                tLabel={T("dash_currency_exposure")}
                tPctOfTotal="%"
              />
              <div style={{ flex: 1, minWidth: 240 }}>
                {rows.map((r, i) => (
                  <div
                    key={r.currency}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "8px 0",
                      borderBottom:
                        i < rows.length - 1 ? "1px solid var(--rule)" : "none",
                    }}
                  >
                    <div
                      className="row"
                      style={{ gap: 8, alignItems: "center", minWidth: 0 }}
                    >
                      <CategoryDot color={colorFor(i)} />
                      <span style={{ fontSize: 13, whiteSpace: "nowrap" }}>
                        {r.currency}
                      </span>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        gap: 10,
                        alignItems: "center",
                        flexShrink: 0,
                      }}
                    >
                      <span
                        className="num"
                        style={{ fontSize: 12, color: "var(--fg-soft)" }}
                      >
                        {formatEur(r.total_eur)}
                      </span>
                      <span
                        className="num"
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          color: "var(--fg)",
                          minWidth: 52,
                          textAlign: "right",
                        }}
                      >
                        {(r.percent || 0).toFixed(1)}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div
              style={{
                textAlign: "center",
                color: "var(--fg-faint)",
                fontSize: 13,
                padding: "20px 0",
              }}
            >
              {T("no_data")}
            </div>
          )}
        </Card>
      );
    })(),

    recurring_overview: (() => {
      const summary = recurringStatus?.summary || {
        generated: 0,
        pending: 0,
        total: 0,
      };
      const items = recurringStatus?.items || [];
      const hasPending = summary.pending > 0;
      const handleGenerate = async () => {
        await generateRecurringForMonth({
          month: currentMonth,
          year: currentYear,
        });
      };
      return (
        <Card>
          <div className="between" style={{ marginBottom: 12 }}>
            <SectionLabel>{T("dash_recurring_overview")}</SectionLabel>
            <span
              className="num"
              style={{ fontSize: 12, color: "var(--fg-soft)" }}
            >
              {summary.generated}/{summary.total}
            </span>
          </div>
          {items.length === 0 ? (
            <div
              style={{
                textAlign: "center",
                color: "var(--fg-faint)",
                fontSize: 13,
                padding: "20px 0",
              }}
            >
              {T("no_recurring")}
            </div>
          ) : (
            <>
              <div style={{ marginBottom: 12 }}>
                {items.map((it, idx) => {
                  const isGenerated = it.status === "generated";
                  return (
                    <div
                      key={it.id}
                      className="between"
                      style={{
                        padding: "9px 2px",
                        borderBottom:
                          idx < items.length - 1
                            ? "1px solid var(--rule)"
                            : "none",
                      }}
                    >
                      <div
                        className="row"
                        style={{ gap: 8, alignItems: "center", minWidth: 0 }}
                      >
                        <CategoryDot
                          color={
                            isGenerated ? "var(--success)" : "var(--warning)"
                          }
                        />
                        <span
                          style={{
                            fontSize: 13,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {it.description}
                        </span>
                        <span
                          className="num"
                          style={{
                            fontSize: 11,
                            color: "var(--fg-faint)",
                            flexShrink: 0,
                          }}
                        >
                          · {T("recurring_day")} {it.day_of_month}
                        </span>
                      </div>
                      <span
                        className="num"
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          color: isGenerated ? "var(--fg-soft)" : "var(--fg)",
                          flexShrink: 0,
                        }}
                      >
                        {formatEur(it.amount)}
                      </span>
                    </div>
                  );
                })}
              </div>
              <button
                className={`btn ${hasPending ? "btn-p" : "btn-g"} btn-sm pressable`}
                disabled={!hasPending || recurringSaving}
                onClick={handleGenerate}
                style={{ width: "100%" }}
              >
                {recurringSaving
                  ? "..."
                  : hasPending
                    ? T("recurring_generate_cta")
                    : T("recurring_all_generated")}
              </button>
            </>
          )}
        </Card>
      );
    })(),

    monthly_overview: bootstrapReady ? <MonthlyNetWorthTable /> : null,

    budget_progress: (() => {
      const activeBudgets = (budgets || []).filter((b) => b.amount > 0);
      if (activeBudgets.length === 0) return null;
      // Use the current-month summary (independent from Cash Flow's filterMonth)
      // so the bars always reflect this month's spending vs budget.
      const catMap = {};
      for (const c of categories || []) {
        catMap[c.id] = c;
      }
      // Roll up subcategory spending into the parent, mirroring Cash Flow logic
      // (ec.id === b.category || ec.parent === b.category).
      const spentMap = {};
      for (const c of expSummaryCurrentMonth?.by_category || []) {
        const amount = parseFloat(c.total || 0);
        spentMap[c.category__id] = (spentMap[c.category__id] || 0) + amount;
        const cat = catMap[c.category__id];
        if (cat?.parent)
          spentMap[cat.parent] = (spentMap[cat.parent] || 0) + amount;
      }
      return (
        <Card>
          <SectionLabel>{T("dash_budget_progress")}</SectionLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {activeBudgets.map((b) => {
              const cat = catMap[b.category];
              const spent = spentMap[b.category] || 0;
              const limit = parseFloat(b.amount);
              const pct = limit > 0 ? (spent / limit) * 100 : 0;
              const over = spent > limit;
              return (
                <div key={b.id} style={{ marginBottom: 8 }}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: 4,
                      gap: 8,
                    }}
                  >
                    <span
                      className="row"
                      style={{
                        fontSize: 13,
                        color: "var(--fg)",
                        alignItems: "center",
                        gap: 8,
                        minWidth: 0,
                      }}
                    >
                      <CategoryDot color={cat?.color || "var(--fg-faint)"} />
                      <span
                        style={{
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {cat?.name || "—"}
                      </span>
                    </span>
                    <span
                      className="num"
                      style={{
                        fontSize: 12,
                        color: over ? "var(--danger)" : "var(--fg-soft)",
                        flexShrink: 0,
                      }}
                    >
                      {formatEur(spent)} / {formatEur(limit)}
                    </span>
                  </div>
                  <ProgressBar
                    value={spent}
                    max={limit}
                    tone={over ? "danger" : pct > 80 ? "warning" : "success"}
                  />
                </div>
              );
            })}
          </div>
        </Card>
      );
    })(),
  };

  // ── render ────────────────────────────────────────────────────────────────

  const gainNum = parseFloat(s?.total_gain || 0);
  const gainPct = parseFloat(s?.total_gain_percent || 0);
  const hideDashboardNetWorth = isValueHidden("dashboard", "net_worth");
  const heroValue = (
    <PrivacyValue scope="dashboard" field="net_worth" revealControl>
      {formatEur(s?.total_current)}
    </PrivacyValue>
  );
  const heroPill =
    !hideDashboardNetWorth && gainNum !== 0 ? (
      <Pill tone={gainNum >= 0 ? "success" : "danger"}>
        <span className="num">
          {gainNum >= 0 ? "+" : ""}
          {formatEur(gainNum)} · {gainPct >= 0 ? "+" : ""}
          {gainPct.toFixed(1)}%
        </span>
      </Pill>
    ) : null;

  return (
    <>
      <PullToRefresh onRefresh={handlePullRefresh}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <LargeTitleHeader
            eyebrow={T("net_worth")}
            title={
              <span className="app-net-worth hero-number">{heroValue}</span>
            }
            compactTitle={T("net_worth")}
            compactValue={
              <PrivacyValue scope="dashboard" field="net_worth">
                {formatEur(s?.total_current)}
              </PrivacyValue>
            }
            actions={heroPill}
          />

          {/* Sections */}
          {dashConfig
            .filter((c) => c.visible && isDashboardSectionEnabled(c.id))
            .map((c) => {
              const section = dashSections[c.id];
              if (!section) return null;
              return <div key={c.id}>{section}</div>;
            })}
        </div>
      </PullToRefresh>
      <InvestmentDeepDiveSheet
        open={deepDiveType !== null}
        onClose={() => setDeepDiveType(null)}
        initialTypeId={deepDiveType}
        assets={allocationDeepDiveAssets}
        T={T}
      />
    </>
  );
}
