import { useCallback, useEffect, useMemo, useState } from "react";
import { API } from "../../utils/api";
import {
    filterByPeriod,
    historyMetaBadge,
    type HistoryMeta,
    type PricePoint,
} from "./priceHistory";

type AssetLike = {
    id: number | string;
    shares?: number | string | null;
    current_value?: number | string | null;
    invested_capital?: number | string | null;
    tracking_type?: string;
};

type UseAssetCardControllerArgs = {
    asset: AssetLike;
    apiFetch?: ((url: string) => Promise<Response>) | null;
    priceRefreshCounter: number;
    T: (key: string) => string;
    totalPortfolioValue: number;
};

export function useAssetCardController({
    asset,
    apiFetch,
    priceRefreshCounter,
    T,
    totalPortfolioValue,
}: UseAssetCardControllerArgs) {
    const [detailOpen, setDetailOpen] = useState(false);
    const [priceHistory, setPriceHistory] = useState<PricePoint[] | null>(null);
    const [priceHistoryMeta, setPriceHistoryMeta] =
        useState<HistoryMeta | null>(null);
    const [loadingChart, setLoadingChart] = useState(false);
    const [showChart, setShowChart] = useState(false);

    useEffect(() => {
        if (priceRefreshCounter > 0) {
            setPriceHistory(null);
            setPriceHistoryMeta(null);
        }
    }, [priceRefreshCounter]);

    const canLoadHistory = typeof apiFetch === "function";
    const fetchHistory = useCallback(() => {
        if (!apiFetch || priceHistory !== null) return;
        setLoadingChart(true);
        apiFetch(`${API}/portfolio/${asset.id}/price-history/?days=3650`)
            .then((response) => response.json())
            .then((data) => {
                if (Array.isArray(data)) {
                    setPriceHistory(data);
                    setPriceHistoryMeta(null);
                } else if (data && Array.isArray(data.points)) {
                    setPriceHistory(data.points);
                    setPriceHistoryMeta({
                        earliestAvailable: data.earliest_available,
                        requestedSince: data.requested_since,
                        status: data.status,
                        message: data.message,
                    });
                } else {
                    setPriceHistory([]);
                    setPriceHistoryMeta(null);
                }
            })
            .catch(() => {
                setPriceHistory([]);
                setPriceHistoryMeta({ status: "error", message: "network" });
            })
            .finally(() => setLoadingChart(false));
    }, [apiFetch, asset.id, priceHistory]);

    useEffect(() => {
        if (detailOpen) fetchHistory();
    }, [detailOpen, fetchHistory]);

    const shares = parseFloat(String(asset.shares || 0));
    return {
        allocPct:
            totalPortfolioValue > 0
                ? (parseFloat(String(asset.current_value || 0)) /
                      totalPortfolioValue) *
                  100
                : null,
        avgCost:
            asset.tracking_type !== "MANUAL" && shares > 0
                ? parseFloat(String(asset.invested_capital || 0)) / shares
                : null,
        canLoadHistory,
        detailOpen,
        historyWarning: useMemo(
            () => historyMetaBadge(priceHistoryMeta, T),
            [priceHistoryMeta, T],
        ),
        loadingChart,
        priceHistory,
        priceHistoryMeta,
        setDetailOpen,
        setShowChart,
        showChart,
        weekData: priceHistory ? filterByPeriod(priceHistory, "1W") : null,
    };
}
