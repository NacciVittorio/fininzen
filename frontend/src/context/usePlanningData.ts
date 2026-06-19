import { useCallback } from "react";
import { fetchFire } from "../api/fire";
import {
    fetchAllocationTargets,
    fetchBudgetsList,
    fetchRecurringExpensesList,
    fetchRecurringInvestmentPlansList,
} from "../api/planning";
import { fetchPortfolioHistoryData } from "../api/portfolio";
import { logError } from "../utils/logger";
import type { ApiFetcher } from "../api/client";
import type { WealthMetric } from "./appContextHelpers";
import type { WealthTimeRange } from "./appContextHelpers";
import type { AppProviderState } from "./useAppProviderState";

type PlanningState = Pick<
    AppProviderState,
    | "setAllocationData"
    | "setBudgets"
    | "setFireGoal"
    | "setPortfolioHistory"
    | "setRecurringExpenses"
    | "setRecurringInvestmentPlans"
    | "setWealthMetrics"
    | "setWealthRangeOffset"
    | "setWealthTimeRange"
    | "wealthMetrics"
    | "wealthRangeOffset"
    | "wealthTimeRange"
>;

type UsePlanningDataArgs = PlanningState & {
    apiFetch: ApiFetcher;
    syncDashboardPreferences: (preferences: {
        wealthMetrics?: WealthMetric[];
    }) => unknown;
};

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

const isWealthTimeRange = (range: string): range is WealthTimeRange =>
    ["1M", "6M", "1Y", "5Y", "MAX"].includes(range);

export function usePlanningData({
    apiFetch,
    setAllocationData,
    setBudgets,
    setFireGoal,
    setPortfolioHistory,
    setRecurringExpenses,
    setRecurringInvestmentPlans,
    setWealthMetrics,
    setWealthRangeOffset,
    setWealthTimeRange,
    syncDashboardPreferences,
    wealthMetrics,
    wealthRangeOffset,
    wealthTimeRange,
}: UsePlanningDataArgs) {
    const fetchPortfolioHistory = useCallback(async () => {
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
        if (
            wealthMetrics.some((metric) =>
                ["balance", "investing"].includes(metric),
            )
        )
            params.set("include_breakdown", "true");
        try {
            const data = await fetchPortfolioHistoryData(apiFetch, params);
            setPortfolioHistory(Array.isArray(data) ? data : []);
        } catch (error) {
            logError("fetchPortfolioHistory:", error);
            setPortfolioHistory([]);
        }
    }, [
        apiFetch,
        setPortfolioHistory,
        wealthMetrics,
        wealthRangeOffset,
        wealthTimeRange,
    ]);

    const fetchFireGoal = useCallback(async () => {
        try {
            const goal = (await fetchFire(apiFetch)).settings?.net_worth_goal;
            setFireGoal(goal != null ? Number.parseFloat(String(goal)) : null);
        } catch {
            /* optional dashboard data */
        }
    }, [apiFetch, setFireGoal]);

    const toggleWealthMetric = useCallback(
        (metric: WealthMetric) => {
            setWealthMetrics((previous) => {
                const withoutMetric = previous.filter(
                    (item) => item !== metric,
                );
                const next = previous.includes(metric)
                    ? withoutMetric.some((item) => item !== "goal")
                        ? withoutMetric
                        : previous
                    : [...previous, metric];
                if (next !== previous) {
                    localStorage.setItem(
                        "wealthChartMetrics",
                        JSON.stringify(next),
                    );
                    syncDashboardPreferences({ wealthMetrics: next });
                }
                return next;
            });
        },
        [setWealthMetrics, syncDashboardPreferences],
    );

    const changeWealthTimeRange = useCallback(
        (range: string) => {
            if (!isWealthTimeRange(range)) return;
            setWealthTimeRange(range);
            setWealthRangeOffset(0);
        },
        [setWealthRangeOffset, setWealthTimeRange],
    );

    const fetchAllocationData = useCallback(async () => {
        try {
            setAllocationData(await fetchAllocationTargets(apiFetch));
        } catch {
            /* optional planning data */
        }
    }, [apiFetch, setAllocationData]);
    const fetchBudgets = useCallback(async () => {
        try {
            const data = await fetchBudgetsList(apiFetch);
            setBudgets(Array.isArray(data) ? data : data.results);
        } catch {
            /* optional planning data */
        }
    }, [apiFetch, setBudgets]);
    const fetchRecurringExpenses = useCallback(async () => {
        try {
            const data = await fetchRecurringExpensesList(apiFetch);
            setRecurringExpenses(Array.isArray(data) ? data : data.results);
        } catch {
            /* optional planning data */
        }
    }, [apiFetch, setRecurringExpenses]);
    const fetchRecurringInvestmentPlans = useCallback(async () => {
        try {
            const data = await fetchRecurringInvestmentPlansList(apiFetch);
            setRecurringInvestmentPlans(
                Array.isArray(data) ? data : data.results,
            );
        } catch {
            /* optional planning data */
        }
    }, [apiFetch, setRecurringInvestmentPlans]);

    return {
        fetchPortfolioHistory,
        fetchFireGoal,
        toggleWealthMetric,
        changeWealthTimeRange,
        fetchAllocationData,
        fetchBudgets,
        fetchRecurringExpenses,
        fetchRecurringInvestmentPlans,
    };
}
