import { useCallback, useState } from "react";
import { REFRESH_REASONS } from "../utils/refreshReasons";
import type { RefreshReason } from "../utils/refreshReasons";
import { logDebug, logWarn } from "../utils/logger";
import type { Dispatch, RefObject, SetStateAction } from "react";
import type { MonthlyOverviewPreferences } from "./appContextHelpers";

type CacheRef = RefObject<{ ts: number; [key: string]: unknown }>;
type RefreshFunction = (...args: never[]) => unknown;
type UseRefreshOrchestratorArgs = {
    assetsCacheRef: CacheRef;
    categoriesCacheRef: CacheRef;
    summaryCacheRef: CacheRef;
    fetchAssets: RefreshFunction;
    fetchCategories: RefreshFunction;
    fetchContributionSources: RefreshFunction;
    fetchExpSummary: RefreshFunction;
    fetchExpSummaryCurrentMonth: RefreshFunction;
    fetchExpenses: RefreshFunction;
    fetchInvestmentTypes: RefreshFunction;
    fetchMonthlyOverview: (year: number) => unknown;
    fetchPortfolioHistory: RefreshFunction;
    fetchPortfolioSummary: RefreshFunction;
    fetchRecurringStatus: RefreshFunction;
    fetchTrends: RefreshFunction;
    monthlyOverviewPrefs: MonthlyOverviewPreferences;
    setMonthlyOverviewRefreshKey: Dispatch<SetStateAction<number>>;
};

export function useRefreshOrchestrator({
    assetsCacheRef,
    categoriesCacheRef,
    fetchAssets,
    fetchCategories,
    fetchContributionSources,
    fetchExpSummary,
    fetchExpSummaryCurrentMonth,
    fetchExpenses,
    fetchInvestmentTypes,
    fetchMonthlyOverview,
    fetchPortfolioHistory,
    fetchPortfolioSummary,
    fetchRecurringStatus,
    fetchTrends,
    monthlyOverviewPrefs,
    setMonthlyOverviewRefreshKey,
    summaryCacheRef,
}: UseRefreshOrchestratorArgs) {
    // ── Refresh orchestration ──

    // Bump refresh key so MonthlyNetWorthTable re-fetches Compare-mode (yearA/yearB)
    // and prev-year overviews after a mutation, since those fetches live in the component.
    const bumpMonthlyRefresh = useCallback(
        () => setMonthlyOverviewRefreshKey((key) => key + 1),
        [setMonthlyOverviewRefreshKey],
    );

    const [assetTxRefreshKey, setAssetTxRefreshKey] = useState(0);
    const bumpAssetTxRefresh = useCallback(
        () => setAssetTxRefreshKey((key) => key + 1),
        [],
    );

    const refreshExpenseArea = useCallback(() => {
        fetchExpenses();
        fetchExpSummary();
        fetchExpSummaryCurrentMonth();
        fetchTrends();
        fetchRecurringStatus();
    }, [
        fetchExpenses,
        fetchExpSummary,
        fetchExpSummaryCurrentMonth,
        fetchTrends,
        fetchRecurringStatus,
    ]);

    const refreshPortfolioArea = useCallback(
        ({
            includeHistory = true,
            includeOverview = true,
        }: { includeHistory?: boolean; includeOverview?: boolean } = {}) => {
            fetchAssets();
            fetchPortfolioSummary();
            if (includeHistory) fetchPortfolioHistory();
            if (includeOverview) {
                fetchMonthlyOverview(monthlyOverviewPrefs.year);
                bumpMonthlyRefresh();
            }
        },
        [
            fetchAssets,
            fetchPortfolioSummary,
            fetchPortfolioHistory,
            fetchMonthlyOverview,
            monthlyOverviewPrefs.year,
            bumpMonthlyRefresh,
        ],
    );

    const refreshAfter = useCallback(
        (reason: RefreshReason) => {
            logDebug("[refresh]", reason);
            const invalidateCategories = () => {
                categoriesCacheRef.current.ts = 0;
            };
            const invalidateAssets = () => {
                assetsCacheRef.current.ts = 0;
            };
            const invalidateSummary = () => {
                summaryCacheRef.current.ts = 0;
            };
            switch (reason) {
                case REFRESH_REASONS.EXPENSE_CREATED:
                case REFRESH_REASONS.EXPENSE_UPDATED:
                case REFRESH_REASONS.EXPENSE_DELETED:
                    // Creating/editing/deleting/verifying a cashflow movement changes the
                    // linked account balance, so the assets cache must be invalidated too
                    // (otherwise the Accounts tab serves a stale 30s-cached balance).
                    invalidateAssets();
                    invalidateSummary();
                    refreshExpenseArea();
                    refreshPortfolioArea({
                        includeHistory: false,
                        includeOverview: true,
                    });
                    bumpAssetTxRefresh();
                    break;
                case REFRESH_REASONS.ASSET_CREATED:
                case REFRESH_REASONS.ASSET_UPDATED:
                case REFRESH_REASONS.ASSET_DELETED:
                case REFRESH_REASONS.TRANSACTION_CREATED:
                case REFRESH_REASONS.TRANSACTION_UPDATED:
                case REFRESH_REASONS.TRANSACTION_DELETED:
                case REFRESH_REASONS.BALANCE_ADJUSTED:
                case REFRESH_REASONS.TRANSFER_COMPLETED:
                    invalidateAssets();
                    invalidateSummary();
                    refreshPortfolioArea({
                        includeHistory: true,
                        includeOverview: true,
                    });
                    bumpAssetTxRefresh();
                    break;
                case REFRESH_REASONS.PRICE_REFRESH_COMPLETED:
                    invalidateAssets();
                    invalidateSummary();
                    refreshPortfolioArea({
                        includeHistory: true,
                        includeOverview: false,
                    });
                    break;
                case REFRESH_REASONS.CATEGORY_CREATED:
                case REFRESH_REASONS.CATEGORY_UPDATED:
                    invalidateCategories();
                    fetchCategories();
                    break;
                case REFRESH_REASONS.CATEGORY_DELETED:
                    invalidateCategories();
                    fetchCategories();
                    refreshExpenseArea();
                    break;
                case REFRESH_REASONS.INVESTMENT_TYPE_CREATED:
                case REFRESH_REASONS.INVESTMENT_TYPE_UPDATED:
                    fetchInvestmentTypes();
                    break;
                case REFRESH_REASONS.CONTRIBUTION_SOURCE_CREATED:
                case REFRESH_REASONS.CONTRIBUTION_SOURCE_UPDATED:
                    fetchContributionSources();
                    invalidateAssets();
                    fetchAssets();
                    bumpAssetTxRefresh();
                    break;
                case REFRESH_REASONS.CONTRIBUTION_SOURCE_DELETED:
                    fetchContributionSources();
                    invalidateAssets();
                    invalidateSummary();
                    refreshPortfolioArea({
                        includeHistory: true,
                        includeOverview: true,
                    });
                    bumpAssetTxRefresh();
                    break;
                case REFRESH_REASONS.INVESTMENT_TYPE_DELETED:
                    fetchInvestmentTypes();
                    invalidateAssets();
                    invalidateSummary();
                    refreshPortfolioArea({
                        includeHistory: false,
                        includeOverview: false,
                    });
                    break;
                case REFRESH_REASONS.RECURRING_GENERATED:
                case REFRESH_REASONS.EXPENSES_RESET:
                    invalidateAssets();
                    invalidateSummary();
                    refreshExpenseArea();
                    refreshPortfolioArea({
                        includeHistory: false,
                        includeOverview: true,
                    });
                    bumpAssetTxRefresh();
                    break;
                case REFRESH_REASONS.ALLOCATION_UPDATED:
                case REFRESH_REASONS.PORTFOLIO_RESET:
                    invalidateAssets();
                    invalidateSummary();
                    refreshPortfolioArea({
                        includeHistory: false,
                        includeOverview: false,
                    });
                    bumpAssetTxRefresh();
                    break;
                case REFRESH_REASONS.DEMO_LOADED:
                    invalidateCategories();
                    invalidateAssets();
                    invalidateSummary();
                    refreshExpenseArea();
                    fetchCategories();
                    refreshPortfolioArea({
                        includeHistory: false,
                        includeOverview: false,
                    });
                    fetchInvestmentTypes();
                    bumpAssetTxRefresh();
                    break;
                case REFRESH_REASONS.CSV_IMPORTED:
                    refreshExpenseArea();
                    bumpAssetTxRefresh();
                    break;
                default:
                    logWarn("[refresh] unknown reason:", reason);
            }
        },
        [
            fetchCategories,
            fetchContributionSources,
            fetchAssets,
            fetchInvestmentTypes,
            refreshExpenseArea,
            refreshPortfolioArea,
            assetsCacheRef,
            categoriesCacheRef,
            summaryCacheRef,
            bumpAssetTxRefresh,
        ],
    );

    return { assetTxRefreshKey, refreshAfter };
}
