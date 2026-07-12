import { useCallback, useState } from "react";
import { REFRESH_REASONS } from "../utils/refreshReasons";
import type { RefreshReason } from "../utils/refreshReasons";
import { logDebug, logWarn } from "../utils/logger";
import type { Dispatch, SetStateAction } from "react";

type RefreshFunction = (...args: never[]) => unknown;
type UseRefreshOrchestratorArgs = {
    fetchAssets: RefreshFunction;
    fetchCategories: RefreshFunction;
    fetchContributionSources: RefreshFunction;
    fetchExpSummary: RefreshFunction;
    fetchExpenses: RefreshFunction;
    fetchInvestmentTypes: RefreshFunction;
    fetchMonthlyOverview: (year?: number) => unknown;
    fetchPortfolioHistory: RefreshFunction;
    fetchPortfolioSummary: RefreshFunction;
    fetchRecurringStatus: RefreshFunction;
    fetchTrends: RefreshFunction;
    setMonthlyOverviewRefreshKey: Dispatch<SetStateAction<number>>;
};

export function useRefreshOrchestrator({
    fetchAssets,
    fetchCategories,
    fetchContributionSources,
    fetchExpSummary,
    fetchExpenses,
    fetchInvestmentTypes,
    fetchMonthlyOverview,
    fetchPortfolioHistory,
    fetchPortfolioSummary,
    fetchRecurringStatus,
    fetchTrends,
    setMonthlyOverviewRefreshKey,
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
        fetchTrends();
        fetchRecurringStatus();
    }, [fetchExpenses, fetchExpSummary, fetchTrends, fetchRecurringStatus]);

    const refreshPortfolioArea = useCallback(
        ({
            includeHistory = true,
            includeOverview = true,
        }: { includeHistory?: boolean; includeOverview?: boolean } = {}) => {
            fetchAssets();
            fetchPortfolioSummary();
            if (includeHistory) fetchPortfolioHistory();
            if (includeOverview) {
                fetchMonthlyOverview();
                bumpMonthlyRefresh();
            }
        },
        [
            fetchAssets,
            fetchPortfolioSummary,
            fetchPortfolioHistory,
            fetchMonthlyOverview,
            bumpMonthlyRefresh,
        ],
    );

    const refreshAfter = useCallback(
        (reason: RefreshReason) => {
            logDebug("[refresh]", reason);
            switch (reason) {
                case REFRESH_REASONS.EXPENSE_CREATED:
                case REFRESH_REASONS.EXPENSE_UPDATED:
                case REFRESH_REASONS.EXPENSE_DELETED:
                    // Creating/editing/deleting/verifying a cashflow movement changes
                    // the linked account balance, so assets/summary are refreshed via
                    // refreshPortfolioArea (otherwise the Accounts tab serves stale data).
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
                    refreshPortfolioArea({
                        includeHistory: true,
                        includeOverview: true,
                    });
                    bumpAssetTxRefresh();
                    break;
                case REFRESH_REASONS.PRICE_REFRESH_COMPLETED:
                    refreshPortfolioArea({
                        includeHistory: true,
                        includeOverview: false,
                    });
                    break;
                case REFRESH_REASONS.CATEGORY_CREATED:
                case REFRESH_REASONS.CATEGORY_UPDATED:
                    fetchCategories();
                    break;
                case REFRESH_REASONS.CATEGORY_DELETED:
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
                    fetchAssets();
                    bumpAssetTxRefresh();
                    break;
                case REFRESH_REASONS.CONTRIBUTION_SOURCE_DELETED:
                    fetchContributionSources();
                    refreshPortfolioArea({
                        includeHistory: true,
                        includeOverview: true,
                    });
                    bumpAssetTxRefresh();
                    break;
                case REFRESH_REASONS.INVESTMENT_TYPE_DELETED:
                    fetchInvestmentTypes();
                    refreshPortfolioArea({
                        includeHistory: false,
                        includeOverview: false,
                    });
                    break;
                case REFRESH_REASONS.RECURRING_GENERATED:
                case REFRESH_REASONS.EXPENSES_RESET:
                    refreshExpenseArea();
                    refreshPortfolioArea({
                        includeHistory: false,
                        includeOverview: true,
                    });
                    bumpAssetTxRefresh();
                    break;
                case REFRESH_REASONS.ALLOCATION_UPDATED:
                case REFRESH_REASONS.PORTFOLIO_RESET:
                    refreshPortfolioArea({
                        includeHistory: false,
                        includeOverview: false,
                    });
                    bumpAssetTxRefresh();
                    break;
                case REFRESH_REASONS.DEMO_LOADED:
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
            bumpAssetTxRefresh,
        ],
    );

    return { assetTxRefreshKey, refreshAfter };
}
