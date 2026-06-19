import type { InvestmentType } from "../../api/types";
import type { WealthTimeRange } from "../../context/appContextHelpers";
import type { NumericValue, Translator } from "../../types";

export const WEALTH_RANGES = ["1M", "6M", "1Y", "5Y", "MAX"] as const;
export type WealthRange = WealthTimeRange;
export type WealthMetric = "wealth" | "balance" | "investing" | "goal";

type HistoryPoint = {
    snapshot_date: string;
    total_value?: NumericValue;
    by_asset_class?: Record<string, number> | null;
};

type ChartPoint = { date: string; value: number };
type MetricDefinition = {
    id: WealthMetric;
    label: string;
    color: string;
    yAxis: "left";
};
type ChartSeries = MetricDefinition & { data: ChartPoint[] };

function endOfMonthPoints(data: readonly ChartPoint[]): ChartPoint[] {
    const byMonth = new Map<string, ChartPoint>();
    for (const p of data) {
        const key = p.date?.slice(0, 7);
        if (!key) continue;
        const existing = byMonth.get(key);
        if (!existing || p.date > existing.date) byMonth.set(key, p);
    }
    return Array.from(byMonth.values()).sort((a, b) =>
        a.date.localeCompare(b.date),
    );
}

function historyDate(point: HistoryPoint): string {
    return point.snapshot_date?.split("T")[0] || point.snapshot_date;
}

function monthLabel(dateString: string, months: readonly string[]): string {
    const [year, month] = dateString.split("-");
    return `${months[parseInt(month!, 10) - 1] ?? ""} ${year ?? ""}`;
}

type BuildWealthTrendModelArgs = {
    portfolioHistory: HistoryPoint[];
    investmentTypes: InvestmentType[];
    wealthTimeRange: WealthRange;
    wealthMetrics: WealthMetric[];
    fireGoal: number | null;
    MONTHS: string[];
    T: Translator;
};

export function buildWealthTrendModel({
    portfolioHistory,
    investmentTypes,
    wealthTimeRange,
    wealthMetrics,
    fireGoal,
    MONTHS,
    T,
}: BuildWealthTrendModelArgs): {
    metrics: MetricDefinition[];
    activeSeries: ChartSeries[];
    chartHasData: boolean;
    goalLineValue: number | null;
    isShortRange: boolean;
    periodLabel: string | null;
} {
    const bankTypeIds = new Set(
        (investmentTypes || [])
            .filter((type) => type.is_bank_account)
            .map((type) => String(type.id)),
    );
    const metrics: MetricDefinition[] = [
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

    const needsDownsample =
        wealthTimeRange === "5Y" || wealthTimeRange === "MAX";
    const normalizeRange = (data: ChartPoint[]): ChartPoint[] =>
        needsDownsample ? endOfMonthPoints(data) : data;

    const rawWealth = portfolioHistory.map((point) => ({
        date: historyDate(point),
        value: Number.parseFloat(String(point.total_value || 0)),
    }));
    const rawBalance = portfolioHistory.map((point) => {
        const byClass = point.by_asset_class || {};
        const value = Object.entries(byClass)
            .filter(([typeId]) => bankTypeIds.has(typeId))
            .reduce((sum, [, itemValue]) => sum + itemValue, 0);
        return { date: historyDate(point), value };
    });
    const rawInvesting = portfolioHistory.map((point) => {
        const byClass = point.by_asset_class || {};
        const value = Object.entries(byClass)
            .filter(([typeId]) => !bankTypeIds.has(typeId))
            .reduce((sum, [, itemValue]) => sum + itemValue, 0);
        return { date: historyDate(point), value };
    });

    const seriesMap: Record<Exclude<WealthMetric, "goal">, ChartSeries> = {
        wealth: { data: normalizeRange(rawWealth), ...metrics[0]! },
        balance: { data: normalizeRange(rawBalance), ...metrics[1]! },
        investing: { data: normalizeRange(rawInvesting), ...metrics[2]! },
    };
    const activeSeries = wealthMetrics
        .filter((metric) => metric !== "goal")
        .map((metric) => seriesMap[metric as Exclude<WealthMetric, "goal">])
        .filter(Boolean);

    const rangeStartStr =
        portfolioHistory.length > 0 ? historyDate(portfolioHistory[0]!) : null;
    const rangeEndStr =
        portfolioHistory.length > 0
            ? historyDate(portfolioHistory[portfolioHistory.length - 1]!)
            : null;
    const isShortRange = wealthTimeRange === "1M";

    return {
        metrics,
        activeSeries,
        chartHasData: activeSeries.some(
            (series) => series.data && series.data.length > 1,
        ),
        goalLineValue:
            wealthMetrics.includes("goal") && fireGoal ? fireGoal : null,
        isShortRange,
        periodLabel:
            isShortRange || !rangeStartStr
                ? null
                : `${monthLabel(rangeStartStr, MONTHS)} — ${monthLabel(rangeEndStr || rangeStartStr, MONTHS)}`,
    };
}
