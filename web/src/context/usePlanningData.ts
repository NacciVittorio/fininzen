import { useCallback } from "react";
import type { WealthMetric, WealthTimeRange } from "./appContextHelpers";
import type { AppProviderState } from "./useAppProviderState";

type PlanningState = Pick<
    AppProviderState,
    "setWealthMetrics" | "setWealthRangeOffset" | "setWealthTimeRange"
>;

type UsePlanningDataArgs = PlanningState & {
    syncDashboardPreferences: (preferences: {
        wealthMetrics?: WealthMetric[];
    }) => unknown;
};

const isWealthTimeRange = (range: string): range is WealthTimeRange =>
    ["1M", "6M", "1Y", "5Y", "MAX"].includes(range);

// The wealth-trend series itself is a TanStack query in useAppQueries; this hook
// owns only the user's range/metric selectors (persisted to the profile +
// localStorage), which re-key that query.
export function usePlanningData({
    setWealthMetrics,
    setWealthRangeOffset,
    setWealthTimeRange,
    syncDashboardPreferences,
}: UsePlanningDataArgs) {
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

    return { toggleWealthMetric, changeWealthTimeRange };
}
