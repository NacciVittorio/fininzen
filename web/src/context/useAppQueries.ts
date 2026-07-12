import { useCallback, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
    fetchExpenseCategoriesList,
    fetchExpenseSummaryData,
    fetchExpenseTrends,
    fetchExpensesList,
    fetchRecurringStatusData,
} from "../api/expenses";
import type {
    CashflowTrendPoint,
    ExpenseSummaryResponse,
    UnknownCollection,
} from "../api/expenses";
import {
    fetchMonthlyInvestmentStatsData,
    fetchMonthlyOverviewData,
    fetchPortfolioAssetsList,
    fetchPortfolioHistoryData,
    fetchPortfolioSummaryData,
} from "../api/portfolio";
import type {
    MonthlyOverviewResponse,
    PortfolioHistoryPoint,
} from "../api/portfolio";
import {
    fetchAllocationTargets,
    fetchBudgetsList,
    fetchRecurringExpensesList,
    fetchRecurringInvestmentPlansList,
} from "../api/planning";
import { fetchContributionSourcesList } from "../api/contributionSources";
import type { ContributionSource } from "../api/contributionSources";
import { fetchInvestmentTypesList } from "../api/investmentTypes";
import type { InvestmentType } from "../api/investmentTypes";
import { fetchFire } from "../api/fire";
import type { ApiFetcher } from "../api/client";
import type {
    Asset,
    Budget,
    Category,
    Expense,
    RecurringExpense,
    RecurringInvestmentPlan,
} from "../api/types";
import type { AllocationTargetRow } from "../utils/allocationGroups";
import type { CashflowDirection } from "../utils/directionFilter";
import { currentAccountingMonth } from "./appContextHelpers";
import type { WealthMetric, WealthTimeRange } from "./appContextHelpers";
import type { AppProviderState } from "./useAppProviderState";
import type { ViewAsAccount } from "./useAuthenticatedFetch";

// ── Stable empties ──
// Returned (instead of a fresh `[]`/literal) while a query is loading or
// disabled so downstream useMemo deps in useDerivedAppData don't thrash.
const EMPTY_EXPENSES: Expense[] = [];
const EMPTY_TREND: CashflowTrendPoint[] = [];
const EMPTY_CATEGORIES: Category[] = [];
const EMPTY_ASSETS: Asset[] = [];
const EMPTY_INVESTMENT_TYPES: InvestmentType[] = [];
const EMPTY_CONTRIBUTION_SOURCES: ContributionSource[] = [];
const EMPTY_ALLOCATION: AllocationTargetRow[] = [];
const EMPTY_BUDGETS: Budget[] = [];
const EMPTY_RECURRING_EXPENSES: RecurringExpense[] = [];
const EMPTY_RECURRING_PLANS: RecurringInvestmentPlan[] = [];
const EMPTY_HISTORY: PortfolioHistoryPoint[] = [];
const EMPTY_YEARS: number[] = [];
const EMPTY_EXP_SUMMARY: ExpenseSummaryResponse = { total: 0, by_category: [] };

const toList = <T>(raw: UnknownCollection<T>): T[] =>
    Array.isArray(raw) ? raw : raw.results;

type FixedWealthRange = "5Y" | "1Y" | "6M" | "1M" | "1W" | "5D" | "1D";
const RANGE_ADJUSTERS: Record<FixedWealthRange, (date: Date) => void> = {
    "5Y": (date) => date.setFullYear(date.getFullYear() - 5),
    "1Y": (date) => date.setFullYear(date.getFullYear() - 1),
    "6M": (date) => date.setMonth(date.getMonth() - 6),
    "1M": (date) => date.setMonth(date.getMonth() - 1),
    "1W": (date) => date.setDate(date.getDate() - 7),
    "5D": (date) => date.setDate(date.getDate() - 5),
    "1D": (date) => date.setDate(date.getDate() - 1),
};
const isFixedWealthRange = (range: string): range is FixedWealthRange =>
    Object.prototype.hasOwnProperty.call(RANGE_ADJUSTERS, range);

type UseAppQueriesArgs = {
    apiFetch: ApiFetcher;
    isAuthenticated: boolean;
    user: string | null;
    viewAs: ViewAsAccount | null;
    // Filters / prefs that key the parametrised queries.
    viewMode: "month" | "year";
    filterMonth: number;
    filterYear: number;
    cashflowDir: CashflowDirection;
    filterVerified: boolean | null;
    invStatsMonth: number;
    invStatsYear: number;
    accountingMonthStartDay: number;
    monthlyOverviewYear: number;
    wealthTimeRange: WealthTimeRange;
    wealthRangeOffset: number;
    wealthMetrics: WealthMetric[];
    setAssetForm: AppProviderState["setAssetForm"];
};

export function useAppQueries({
    apiFetch,
    isAuthenticated,
    user,
    viewAs,
    viewMode,
    filterMonth,
    filterYear,
    cashflowDir,
    filterVerified,
    invStatsMonth,
    invStatsYear,
    accountingMonthStartDay,
    monthlyOverviewYear,
    wealthTimeRange,
    wealthRangeOffset,
    wealthMetrics,
    setAssetForm,
}: UseAppQueriesArgs) {
    const queryClient = useQueryClient();
    // Per-account cache namespace: mirrors the old cacheContextRef so a
    // "view as" switch reads a fresh cache entry instead of bleeding data.
    const scope = `${user ?? "anon"}::${viewAs ? viewAs.userId : "self"}`;
    const includeBreakdown = wealthMetrics.some((metric) =>
        ["balance", "investing"].includes(metric),
    );

    // ── Server-state queries ──

    const categoriesQuery = useQuery({
        queryKey: ["categories", scope],
        queryFn: () => fetchExpenseCategoriesList(apiFetch).then(toList),
        enabled: isAuthenticated,
    });

    const assetsQuery = useQuery({
        queryKey: ["assets", scope],
        queryFn: () => fetchPortfolioAssetsList(apiFetch).then(toList),
        enabled: isAuthenticated,
    });

    const summaryQuery = useQuery({
        queryKey: ["portfolioSummary", scope],
        queryFn: () => fetchPortfolioSummaryData(apiFetch),
        enabled: isAuthenticated,
    });

    const investmentTypesQuery = useQuery({
        queryKey: ["investmentTypes", scope],
        queryFn: () => fetchInvestmentTypesList(apiFetch).then(toList),
        enabled: isAuthenticated,
    });

    const contributionSourcesQuery = useQuery({
        queryKey: ["contributionSources", scope],
        queryFn: () => fetchContributionSourcesList(apiFetch).then(toList),
        enabled: isAuthenticated,
    });

    const expensesEnabled =
        isAuthenticated && !(viewMode === "month" && !filterMonth);
    const expensesQuery = useQuery({
        queryKey: [
            "expenses",
            scope,
            viewMode,
            filterMonth,
            filterYear,
            cashflowDir,
            filterVerified,
            // The backend resolves month/year to an accounting window via the
            // stored start day, so the cache must re-key when that day changes
            // even if the {month, year} label is unchanged.
            accountingMonthStartDay,
        ],
        queryFn: () => {
            const params = new URLSearchParams();
            if (viewMode === "month") params.set("month", String(filterMonth));
            params.set("year", String(filterYear));
            params.set("type", cashflowDir);
            if (filterVerified !== null)
                params.set("is_verified", String(filterVerified));
            return fetchExpensesList(apiFetch, params).then(toList);
        },
        enabled: expensesEnabled,
    });

    const trendsQuery = useQuery({
        queryKey: ["trends", scope],
        queryFn: () => fetchExpenseTrends(apiFetch),
        enabled: isAuthenticated,
    });

    const expSummaryQuery = useQuery({
        // Re-key on accountingMonthStartDay: the backend resolves month/year to
        // the accounting window, so the cache must refetch when the start day
        // changes even if the {month, year} label stays the same.
        queryKey: [
            "expSummary",
            scope,
            filterMonth,
            filterYear,
            accountingMonthStartDay,
        ],
        queryFn: () => {
            const params = new URLSearchParams();
            params.set("month", String(filterMonth));
            params.set("year", String(filterYear));
            return fetchExpenseSummaryData(apiFetch, params);
        },
        enabled: isAuthenticated && Boolean(filterMonth),
    });

    const recurringStatusQuery = useQuery({
        queryKey: ["recurringStatus", scope, accountingMonthStartDay],
        queryFn: () => {
            const period = currentAccountingMonth(accountingMonthStartDay);
            const params = new URLSearchParams();
            params.set("month", String(period.month));
            params.set("year", String(period.year));
            return fetchRecurringStatusData(apiFetch, params);
        },
        enabled: isAuthenticated,
    });

    const monthlyInvestmentStatsQuery = useQuery({
        queryKey: [
            "monthlyInvestmentStats",
            scope,
            invStatsMonth,
            invStatsYear,
        ],
        queryFn: () => {
            const params = new URLSearchParams();
            params.set("month", String(invStatsMonth));
            params.set("year", String(invStatsYear));
            return fetchMonthlyInvestmentStatsData(apiFetch, params);
        },
        enabled: isAuthenticated && Boolean(invStatsMonth),
    });

    const allocationQuery = useQuery({
        queryKey: ["allocationData", scope],
        queryFn: () => fetchAllocationTargets(apiFetch),
        enabled: isAuthenticated,
    });

    const budgetsQuery = useQuery({
        queryKey: ["budgets", scope],
        queryFn: () => fetchBudgetsList(apiFetch).then(toList),
        enabled: isAuthenticated,
    });

    const recurringExpensesQuery = useQuery({
        queryKey: ["recurringExpenses", scope],
        queryFn: () => fetchRecurringExpensesList(apiFetch).then(toList),
        enabled: isAuthenticated,
    });

    const recurringInvestmentPlansQuery = useQuery({
        queryKey: ["recurringInvestmentPlans", scope],
        queryFn: () => fetchRecurringInvestmentPlansList(apiFetch).then(toList),
        enabled: isAuthenticated,
    });

    const portfolioHistoryQuery = useQuery({
        queryKey: [
            "portfolioHistory",
            scope,
            wealthTimeRange,
            wealthRangeOffset,
            includeBreakdown,
        ],
        queryFn: async () => {
            const endDate = new Date();
            if (wealthRangeOffset > 0)
                endDate.setMonth(endDate.getMonth() - wealthRangeOffset);
            const startDate = new Date(endDate);
            if (wealthTimeRange === "MAX")
                startDate.setTime(new Date("2000-01-01").getTime());
            else {
                const range = isFixedWealthRange(wealthTimeRange)
                    ? wealthTimeRange
                    : "1Y";
                RANGE_ADJUSTERS[range](startDate);
            }
            const params = new URLSearchParams({
                start_date: startDate.toISOString().slice(0, 10),
                end_date: endDate.toISOString().slice(0, 10),
            });
            if (includeBreakdown) params.set("include_breakdown", "true");
            const data = await fetchPortfolioHistoryData(apiFetch, params);
            // Parity with the old fetcher: coerce a malformed (non-array)
            // response to an empty series so consumers' .map()/.length never throw.
            return Array.isArray(data) ? data : EMPTY_HISTORY;
        },
        enabled: isAuthenticated,
    });

    const fireGoalQuery = useQuery({
        queryKey: ["fireGoal", scope],
        queryFn: async () => {
            const goal = (await fetchFire(apiFetch)).settings?.net_worth_goal;
            return goal != null ? Number.parseFloat(String(goal)) : null;
        },
        enabled: isAuthenticated,
    });

    const monthlyOverviewQuery = useQuery({
        queryKey: ["monthlyOverview", scope, monthlyOverviewYear],
        queryFn: () => fetchMonthlyOverviewData(apiFetch, monthlyOverviewYear),
        enabled: isAuthenticated,
    });

    // ── Derived data fields (stable defaults while loading/disabled) ──
    const investmentTypes = investmentTypesQuery.data ?? EMPTY_INVESTMENT_TYPES;
    const expenses = expensesEnabled
        ? (expensesQuery.data ?? EMPTY_EXPENSES)
        : EMPTY_EXPENSES;
    const expSummary = filterMonth
        ? (expSummaryQuery.data ?? null)
        : EMPTY_EXP_SUMMARY;
    const monthlyOverview = monthlyOverviewQuery.data ?? null;

    // Side-effect parity: when investment types first load and the asset form
    // has no type selected yet, default it to the first type (old fetchInvestmentTypes).
    useEffect(() => {
        if (investmentTypes.length === 0) return;
        setAssetForm((previous) =>
            !previous.investment_type
                ? { ...previous, investment_type: investmentTypes[0]!.id }
                : previous,
        );
    }, [investmentTypes, setAssetForm]);

    // ── Invalidators (the old imperative fetchX, now cache-invalidation) ──
    // Each returns the invalidate Promise so existing `await fetchX()` /
    // `Promise.all([...])` call sites keep working.
    const invalidate = useCallback(
        (key: string) =>
            queryClient.invalidateQueries({ queryKey: [key, scope] }),
        [queryClient, scope],
    );

    const fetchExpenses = useCallback(
        () => invalidate("expenses"),
        [invalidate],
    );
    const fetchTrends = useCallback(() => invalidate("trends"), [invalidate]);
    const fetchCategories = useCallback(
        () => invalidate("categories"),
        [invalidate],
    );
    const fetchAssets = useCallback(() => invalidate("assets"), [invalidate]);
    const fetchPortfolioSummary = useCallback(
        () => invalidate("portfolioSummary"),
        [invalidate],
    );
    const fetchExpSummary = useCallback(
        () => invalidate("expSummary"),
        [invalidate],
    );
    const fetchRecurringStatus = useCallback(
        () => invalidate("recurringStatus"),
        [invalidate],
    );
    const fetchMonthlyInvestmentStats = useCallback(
        () => invalidate("monthlyInvestmentStats"),
        [invalidate],
    );
    const fetchInvestmentTypes = useCallback(
        () => invalidate("investmentTypes"),
        [invalidate],
    );
    const fetchContributionSources = useCallback(
        () => invalidate("contributionSources"),
        [invalidate],
    );
    const fetchAllocationData = useCallback(
        () => invalidate("allocationData"),
        [invalidate],
    );
    const fetchBudgets = useCallback(() => invalidate("budgets"), [invalidate]);
    const fetchRecurringExpenses = useCallback(
        () => invalidate("recurringExpenses"),
        [invalidate],
    );
    const fetchRecurringInvestmentPlans = useCallback(
        () => invalidate("recurringInvestmentPlans"),
        [invalidate],
    );
    const fetchPortfolioHistory = useCallback(
        () => invalidate("portfolioHistory"),
        [invalidate],
    );
    const fetchFireGoal = useCallback(
        () => invalidate("fireGoal"),
        [invalidate],
    );
    const fetchMonthlyOverview = useCallback(
        () => invalidate("monthlyOverview"),
        [invalidate],
    );

    // One-off fetch for an arbitrary year (Compare mode peeks a non-current
    // year without making it the active query). Stays a direct fetch.
    const fetchMonthlyOverviewForYear = useCallback(
        async (year: number): Promise<MonthlyOverviewResponse | null> => {
            try {
                return await fetchMonthlyOverviewData(apiFetch, year);
            } catch {
                return null;
            }
        },
        [apiFetch],
    );

    return {
        // data
        expenses,
        trendExpenses: trendsQuery.data?.expenses ?? EMPTY_TREND,
        trendIncomes: trendsQuery.data?.incomes ?? EMPTY_TREND,
        categories: categoriesQuery.data ?? EMPTY_CATEGORIES,
        assets: assetsQuery.data ?? EMPTY_ASSETS,
        summary: summaryQuery.data ?? null,
        expSummary,
        recurringStatus: recurringStatusQuery.data ?? null,
        monthlyInvestmentStats: monthlyInvestmentStatsQuery.data ?? null,
        investmentTypes,
        contributionSources:
            contributionSourcesQuery.data ?? EMPTY_CONTRIBUTION_SOURCES,
        allocationData: allocationQuery.data ?? EMPTY_ALLOCATION,
        budgets: budgetsQuery.data ?? EMPTY_BUDGETS,
        recurringExpenses:
            recurringExpensesQuery.data ?? EMPTY_RECURRING_EXPENSES,
        recurringInvestmentPlans:
            recurringInvestmentPlansQuery.data ?? EMPTY_RECURRING_PLANS,
        portfolioHistory: portfolioHistoryQuery.data ?? EMPTY_HISTORY,
        fireGoal: fireGoalQuery.data ?? null,
        monthlyOverview,
        monthlyOverviewAvailableYears:
            monthlyOverviewQuery.data?.available_years ?? EMPTY_YEARS,
        // invalidators
        fetchExpenses,
        fetchTrends,
        fetchTrendExpenses: fetchTrends,
        fetchTrendIncomes: fetchTrends,
        fetchCategories,
        fetchAssets,
        fetchPortfolioSummary,
        fetchExpSummary,
        fetchRecurringStatus,
        fetchMonthlyInvestmentStats,
        fetchInvestmentTypes,
        fetchContributionSources,
        fetchAllocationData,
        fetchBudgets,
        fetchRecurringExpenses,
        fetchRecurringInvestmentPlans,
        fetchPortfolioHistory,
        fetchFireGoal,
        fetchMonthlyOverview,
        fetchMonthlyOverviewForYear,
    };
}

export type AppQueries = ReturnType<typeof useAppQueries>;
