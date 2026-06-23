export const PERIODS = ["1D", "1W", "1M", "6M", "1Y", "YTD", "MAX"];

export type PricePoint = { date: string; close: number };

export type HistoryMeta = {
    status?: string;
    message?: string;
    earliestAvailable?: string;
    requestedSince?: string;
};

type Translate = (key: string) => string;

export function cutoffFor(period: string): string | null {
    const today = new Date();
    if (period === "MAX") return null;
    if (period === "YTD") return `${today.getFullYear()}-01-01`;
    const d = new Date(today);
    if (period === "1D") d.setDate(today.getDate() - 2);
    else if (period === "1W") d.setDate(today.getDate() - 7);
    else if (period === "1M") d.setMonth(today.getMonth() - 1);
    else if (period === "6M") d.setMonth(today.getMonth() - 6);
    else if (period === "1Y") d.setFullYear(today.getFullYear() - 1);
    return d.toISOString().slice(0, 10);
}

export function filterByPeriod(
    data: PricePoint[] | null | undefined,
    period: string,
): PricePoint[] {
    if (!data || data.length === 0) return [];
    const cut = cutoffFor(period);
    if (!cut) return data;
    const filtered = data.filter((p) => p.date >= cut);
    return filtered.length >= 2 ? filtered : data;
}

export function historyMetaBadge(
    meta: HistoryMeta | null | undefined,
    T?: Translate,
): { tone: string; text: string } | null {
    if (!meta) return null;
    if (meta.status === "error") {
        return {
            tone: "var(--danger)",
            text:
                meta.message ||
                (T && T("chart_data_error")) ||
                "Price source error",
        };
    }
    if (meta.status === "no_data") {
        return {
            tone: "var(--warning)",
            text:
                meta.message ||
                (T && T("chart_no_data")) ||
                "No price history returned for this instrument",
        };
    }
    if (meta.status === "partial") {
        return {
            tone: "var(--warning)",
            text:
                meta.message ||
                (meta.earliestAvailable
                    ? `${(T && T("chart_data_from")) || "Data available from"} ${meta.earliestAvailable}`
                    : (T && T("chart_history_partial")) ||
                      "Partial price history"),
        };
    }
    return null;
}
