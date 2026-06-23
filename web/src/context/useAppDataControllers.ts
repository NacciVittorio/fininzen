import { useRef } from "react";
import { useAppData } from "./useAppData";
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
        categories,
        setAllocationData,
        setAssetForm,
        setAssets,
        setBudgets,
        setCategories,
        setContributionSources,
        setDashConfig,
        setExpSummary,
        setExpSummaryCurrentMonth,
        setExpenses,
        setFilterMonth,
        setFilterYear,
        setFireGoal,
        setInvestmentTypes,
        setMonthlyInvestmentStats,
        setMonthlyOverview,
        setMonthlyOverviewAvailableYears,
        setMonthlyOverviewPrefs,
        setPortfolioHistory,
        setRecurringExpenses,
        setRecurringInvestmentPlans,
        setRecurringStatus,
        setSummary,
        setTrendExpenses,
        setTrendIncomes,
        setWealthMetrics,
        setWealthRangeOffset,
        setWealthTimeRange,
        cashflowDir,
        filterMonth,
        filterVerified,
        filterYear,
        invStatsMonth,
        invStatsYear,
        monthlyOverviewPrefs,
        setMonthlyOverviewRefreshKey,
        viewMode,
        wealthMetrics,
        wealthRangeOffset,
        wealthTimeRange,
    } = providerState;
    const {
        accountingMonthStartDay,
        apiFetch,
        applyProfileData,
        assetsCacheRef,
        categoriesCacheRef,
        decimalSeparator,
        enabledFeatures,
        guardDemo,
        logout,
        privacyPreferences,
        privacyRevealTimersRef,
        profilePatchQueueRef,
        setDecimalSeparator,
        setTemporaryPrivacyReveals,
        setTransactionPrefs,
        summaryCacheRef,
        temporaryPrivacyReveals,
        transactionPrefs,
    } = sessionController;
    const refreshAfterRef = useRef<((reason: RefreshReason) => unknown) | null>(
        null,
    );
    const transactionFeedsController = useTransactionFeeds({
        apiFetch,
        categories,
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
        assetsCacheRef,
        cashflowDir,
        categoriesCacheRef,
        enabledFeatures,
        filterMonth,
        filterVerified,
        filterYear,
        invStatsMonth,
        invStatsYear,
        logout,
        monthlyOverviewPrefs,
        privacyPreferences,
        privacyRevealTimersRef,
        profilePatchQueueRef,
        setAllocationData,
        setAssetForm,
        setAssets,
        setBudgets,
        setCategories,
        setCfFilters,
        setContributionSources,
        setDashConfig,
        setDecimalSeparator,
        setExpSummary,
        setExpSummaryCurrentMonth,
        setExpenses,
        setFilterMonth,
        setFilterYear,
        setFireGoal,
        setInvestmentTypes,
        setMonthlyInvestmentStats,
        setMonthlyOverview,
        setMonthlyOverviewAvailableYears,
        setMonthlyOverviewPrefs,
        setPortfolioHistory,
        setRecurringExpenses,
        setRecurringInvestmentPlans,
        setRecurringStatus,
        setSummary,
        setTemporaryPrivacyReveals,
        setTransactionPrefs,
        setTrendExpenses,
        setTrendIncomes,
        setWealthMetrics,
        setWealthRangeOffset,
        setWealthTimeRange,
        summaryCacheRef,
        temporaryPrivacyReveals,
        transactionPrefs,
        viewMode,
        wealthMetrics,
        wealthRangeOffset,
        wealthTimeRange,
    });
    const {
        fetchExpenses,
        fetchTrends,
        fetchCategories,
        fetchAssets,
        fetchPortfolioSummary,
        fetchMonthlyOverview,
        fetchExpSummary,
        fetchRecurringStatus,
        fetchExpSummaryCurrentMonth,
        fetchPortfolioHistory,
        fetchInvestmentTypes,
        fetchContributionSources,
    } = appDataController;

    const refreshController = useRefreshOrchestrator({
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
    });
    const { refreshAfter } = refreshController;
    refreshAfterRef.current = refreshAfter;
    return {
        contextValue: {
            ...transactionFeedsController,
            ...assetTransactionsController,
            ...appDataController,
            ...refreshController,
        },
    };
}

export type AppDataControllers = ReturnType<typeof useAppDataControllers>;
