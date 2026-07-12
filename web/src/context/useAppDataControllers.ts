import { useRef } from "react";
import { useAppData } from "./useAppData";
import { useAppQueries } from "./useAppQueries";
import { useAssetTransactions } from "./useAssetTransactions";
import { useRefreshOrchestrator } from "./useRefreshOrchestrator";
import { useTransactionFeeds } from "./useTransactionFeeds";
import type { RefreshReason } from "../utils/refreshReasons";
import type { AppProviderState } from "./useAppProviderState";
import type { SessionController } from "./useSessionController";
import type { ThemeController } from "./useThemeLang";

type UseAppDataControllersArgs = {
    providerState: AppProviderState;
    sessionController: SessionController;
    themeController: ThemeController;
};

export function useAppDataControllers({
    providerState,
    sessionController,
    themeController,
}: UseAppDataControllersArgs) {
    const { T } = themeController;
    const {
        cashflowDir,
        filterMonth,
        filterVerified,
        filterYear,
        invStatsMonth,
        invStatsYear,
        monthlyOverviewPrefs,
        setAssetForm,
        setDashConfig,
        setFilterMonth,
        setFilterYear,
        setMonthlyOverviewPrefs,
        setMonthlyOverviewRefreshKey,
        setWealthMetrics,
        setWealthRangeOffset,
        setWealthTimeRange,
        viewMode,
        wealthMetrics,
        wealthRangeOffset,
        wealthTimeRange,
    } = providerState;
    const {
        accountingMonthStartDay,
        apiFetch,
        applyProfileData,
        decimalSeparator,
        enabledFeatures,
        guardDemo,
        isAuthenticated,
        logout,
        privacyPreferences,
        privacyRevealTimersRef,
        profilePatchQueueRef,
        setDecimalSeparator,
        setTemporaryPrivacyReveals,
        setTransactionPrefs,
        temporaryPrivacyReveals,
        transactionPrefs,
        user,
        viewAs,
    } = sessionController;
    const refreshAfterRef = useRef<((reason: RefreshReason) => unknown) | null>(
        null,
    );

    // Server state (TanStack Query). Must run before the controllers that read
    // its data (transaction feeds need categories) or its invalidators.
    const appQueries = useAppQueries({
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
        monthlyOverviewYear: monthlyOverviewPrefs.year,
        wealthTimeRange,
        wealthRangeOffset,
        wealthMetrics,
        setAssetForm,
    });

    const transactionFeedsController = useTransactionFeeds({
        apiFetch,
        categories: appQueries.categories,
        decimalSeparator,
        guardDemo,
        refreshAfterRef,
        T,
    });
    const { setCfFilters } = transactionFeedsController;
    const assetTransactionsController = useAssetTransactions({
        apiFetch,
        guardDemo,
        refreshAfterRef,
        T,
    });

    const appDataController = useAppData({
        accountingMonthStartDay,
        apiFetch,
        applyProfileData,
        enabledFeatures,
        fetchMonthlyOverview: appQueries.fetchMonthlyOverview,
        logout,
        privacyPreferences,
        privacyRevealTimersRef,
        profilePatchQueueRef,
        setCfFilters,
        setDashConfig,
        setDecimalSeparator,
        setFilterMonth,
        setFilterYear,
        setMonthlyOverviewPrefs,
        setTemporaryPrivacyReveals,
        setTransactionPrefs,
        setWealthMetrics,
        setWealthRangeOffset,
        setWealthTimeRange,
        temporaryPrivacyReveals,
        transactionPrefs,
    });

    const refreshController = useRefreshOrchestrator({
        fetchAssets: appQueries.fetchAssets,
        fetchCategories: appQueries.fetchCategories,
        fetchContributionSources: appQueries.fetchContributionSources,
        fetchExpSummary: appQueries.fetchExpSummary,
        fetchExpenses: appQueries.fetchExpenses,
        fetchInvestmentTypes: appQueries.fetchInvestmentTypes,
        fetchMonthlyOverview: appQueries.fetchMonthlyOverview,
        fetchPortfolioHistory: appQueries.fetchPortfolioHistory,
        fetchPortfolioSummary: appQueries.fetchPortfolioSummary,
        fetchRecurringStatus: appQueries.fetchRecurringStatus,
        fetchTrends: appQueries.fetchTrends,
        setMonthlyOverviewRefreshKey,
    });
    const { refreshAfter } = refreshController;
    refreshAfterRef.current = refreshAfter;
    return {
        contextValue: {
            ...transactionFeedsController,
            ...assetTransactionsController,
            ...appQueries,
            ...appDataController,
            ...refreshController,
        },
    };
}

export type AppDataControllers = ReturnType<typeof useAppDataControllers>;
