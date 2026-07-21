"use client";

import {
    useCallback,
    useEffect,
    useMemo,
    useState,
    type ReactNode,
} from "react";
import type { AllocationGroup } from "../utils/allocationGroups";
import { useApp } from "../context/useApp";

import { useFormatters } from "../utils/useFormatters";
import MonthlyNetWorthTable from "../components/MonthlyNetWorthTable";
import PrivacyValue from "../components/PrivacyValue";
import InvestmentDeepDiveSheet from "../components/InvestmentDeepDiveSheet";
import { WEALTH_RANGES } from "./dashboard/wealthTrendModel";
import {
    BudgetProgressCard,
    CashflowCategoryCard,
    CashflowKpiCards,
    CurrencyExposureCard,
    ExpensesTrendCard,
    PortfolioAllocationCard,
    RecurringOverviewCard,
    WealthTrendCard,
} from "./dashboard/DashboardCards";
import { Pill, PullToRefresh, LargeTitleHeader } from "../components/ui";

// Sections spanning both columns of the ≥1200px dashboard grid. The others sit
// half-width; grid-auto-flow:dense may pull a half card up to fill the hole
// before a full-span one, so visual order can deviate from the Settings list.
const DASH_FULL_SPAN = new Set([
    "wealth_trend",
    "kpi_cards",
    "monthly_overview",
]);

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
        accountingMonthStartDay,
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
        setCfFilters,
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
    // control; coerce a stale localStorage preference to the closest range.
    useEffect(() => {
        if (!WEALTH_RANGES.includes(wealthTimeRange)) setWealthTimeRange("1M");
    }, [wealthTimeRange, setWealthTimeRange]);

    const [cardCashflowDir, setCardCashflowDir] = useState<
        "expense" | "income"
    >("expense");
    const [allocGroup, setAllocGroup] = useState<AllocationGroup>("all");
    const [deepDiveType, setDeepDiveType] = useState<number | string | null>(
        null,
    );
    const [trendDir, setTrendDir] = useState<"expense" | "income">("expense");

    const allocationDeepDiveAssets = useMemo(() => {
        if (allocGroup === "accounts") return bankAccounts;
        if (allocGroup === "investments") return investments;
        return [...investments, ...bankAccounts];
    }, [allocGroup, investments, bankAccounts]);

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

    const isDashboardSectionEnabled = (sectionId: string) => {
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
        return requirements[sectionId as keyof typeof requirements] ?? true;
    };

    const dashSections: Record<string, ReactNode> = {
        wealth_trend: (
            <WealthTrendCard
                portfolioHistory={portfolioHistory}
                investmentTypes={investmentTypes}
                wealthTimeRange={wealthTimeRange}
                setWealthTimeRange={setWealthTimeRange}
                wealthRangeOffset={wealthRangeOffset}
                setWealthRangeOffset={setWealthRangeOffset}
                wealthMetrics={wealthMetrics}
                toggleWealthMetric={toggleWealthMetric}
                fireGoal={fireGoal}
                MONTHS={MONTHS}
                T={T}
            />
        ),
        kpi_cards: isFeatureEnabled("cashflow") ? (
            <CashflowKpiCards kpiData={kpiData} T={T} formatEur={formatEur} />
        ) : null,
        expenses_pie: (
            <CashflowCategoryCard
                expSummary={expSummary}
                categories={categories}
                cardCashflowDir={cardCashflowDir}
                setCardCashflowDir={setCardCashflowDir}
                filterMonth={filterMonth}
                filterYear={filterYear}
                accountingMonthStartDay={accountingMonthStartDay}
                setFilterMonth={setFilterMonth}
                setFilterYear={setFilterYear}
                setCfFilters={setCfFilters}
                setTab={setTab}
                pieHover={pieHover}
                setPieHover={setPieHover}
                T={T}
                formatEur={formatEur}
            />
        ),
        expenses_trend: (
            <ExpensesTrendCard
                trendDir={trendDir}
                setTrendDir={setTrendDir}
                monthlyTrend={monthlyTrend}
                monthlyIncomeTrend={monthlyIncomeTrend}
                T={T}
            />
        ),
        portfolio_alloc: (
            <PortfolioAllocationCard
                s={s}
                kpiData={kpiData}
                allocGroup={allocGroup}
                setAllocGroup={setAllocGroup}
                allocChartType={allocChartType}
                setAllocChartType={setAllocChartType}
                allocationDeepDiveAssets={allocationDeepDiveAssets}
                setDeepDiveType={setDeepDiveType}
                T={T}
            />
        ),
        currency_exposure: (
            <CurrencyExposureCard
                rows={s.by_currency || []}
                T={T}
                formatEur={formatEur}
            />
        ),
        recurring_overview: (
            <RecurringOverviewCard
                recurringStatus={recurringStatus}
                generateRecurringForMonth={generateRecurringForMonth}
                recurringSaving={recurringSaving}
                T={T}
                formatEur={formatEur}
            />
        ),
        monthly_overview: bootstrapReady ? <MonthlyNetWorthTable /> : null,
        budget_progress: (
            <BudgetProgressCard
                budgets={budgets}
                categories={categories}
                expSummary={expSummary}
                T={T}
                formatEur={formatEur}
            />
        ),
    };

    const gainNum = Number(s?.total_gain || 0);
    const gainPct = Number(s?.total_gain_percent || 0);
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
                {/* The gap-14 column also spaces the header fragment's nodes
                    (bar, hero, sentinel) — part of the mobile layout, keep. */}
                <div
                    style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 14,
                    }}
                >
                    <LargeTitleHeader
                        eyebrow={T("net_worth")}
                        title={
                            <span className="app-net-worth hero-number">
                                {heroValue}
                            </span>
                        }
                        compactTitle={T("net_worth")}
                        compactValue={
                            <PrivacyValue scope="dashboard" field="net_worth">
                                {formatEur(s?.total_current)}
                            </PrivacyValue>
                        }
                        actions={heroPill}
                    />

                    <div className="dash-grid">
                        {dashConfig
                            .filter(
                                (c) =>
                                    c.visible &&
                                    isDashboardSectionEnabled(c.id),
                            )
                            .map((c) => {
                                const section = dashSections[c.id];
                                if (!section) return null;
                                return (
                                    <div
                                        key={c.id}
                                        className={`dash-cell${
                                            DASH_FULL_SPAN.has(c.id)
                                                ? " dash-cell--full"
                                                : ""
                                        }`}
                                    >
                                        {section}
                                    </div>
                                );
                            })}
                    </div>
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
