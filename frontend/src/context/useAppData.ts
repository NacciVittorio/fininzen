import { useCallback } from "react";
import { logError } from "../utils/logger";
import {
    fetchExpenseCategoriesList,
    fetchExpenseSummaryData,
    fetchExpenseTrends,
    fetchExpensesList,
    fetchRecurringStatusData,
} from "../api/expenses";
import {
    fetchMonthlyInvestmentStatsData,
    fetchMonthlyOverviewData,
    fetchPortfolioAssetsList,
    fetchPortfolioSummaryData,
} from "../api/portfolio";
import { updateUserProfile } from "../api/profile";
import {
    CLIENT_CACHE_TTL_MS,
    clampAccountingMonthStartDay,
    currentAccountingMonth,
    getCurrentAccountingMonthDateRange,
} from "./appContextHelpers";
import { useProfilePreferences } from "./useProfilePreferences";
import { usePlanningData } from "./usePlanningData";
import { useCatalogData } from "./useCatalogData";
import type { Dispatch, SetStateAction } from "react";
import type { CashflowFilters } from "./feedDefaults";
import type { AppProviderState } from "./useAppProviderState";
import type { SessionController } from "./useSessionController";

type ProviderDataState = Pick<
    AppProviderState,
    | "cashflowDir"
    | "filterMonth"
    | "filterVerified"
    | "filterYear"
    | "invStatsMonth"
    | "invStatsYear"
    | "monthlyOverviewPrefs"
    | "setAllocationData"
    | "setAssetForm"
    | "setAssets"
    | "setBudgets"
    | "setCategories"
    | "setContributionSources"
    | "setDashConfig"
    | "setExpSummary"
    | "setExpSummaryCurrentMonth"
    | "setExpenses"
    | "setFilterMonth"
    | "setFilterYear"
    | "setFireGoal"
    | "setInvestmentTypes"
    | "setMonthlyInvestmentStats"
    | "setMonthlyOverview"
    | "setMonthlyOverviewAvailableYears"
    | "setMonthlyOverviewPrefs"
    | "setPortfolioHistory"
    | "setRecurringExpenses"
    | "setRecurringInvestmentPlans"
    | "setRecurringStatus"
    | "setSummary"
    | "setTrendExpenses"
    | "setTrendIncomes"
    | "setWealthMetrics"
    | "setWealthRangeOffset"
    | "setWealthTimeRange"
    | "viewMode"
    | "wealthMetrics"
    | "wealthRangeOffset"
    | "wealthTimeRange"
>;

type SessionDataState = Pick<
    SessionController,
    | "accountingMonthStartDay"
    | "apiFetch"
    | "applyProfileData"
    | "assetsCacheRef"
    | "categoriesCacheRef"
    | "enabledFeatures"
    | "logout"
    | "privacyPreferences"
    | "privacyRevealTimersRef"
    | "profilePatchQueueRef"
    | "setDecimalSeparator"
    | "setTemporaryPrivacyReveals"
    | "setTransactionPrefs"
    | "summaryCacheRef"
    | "temporaryPrivacyReveals"
    | "transactionPrefs"
>;

type UseAppDataArgs = ProviderDataState &
    SessionDataState & {
        setCfFilters: Dispatch<SetStateAction<CashflowFilters>>;
    };

export function useAppData({
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
}: UseAppDataArgs) {
    // ── Fetch ──

    const fetchExpenses = useCallback(async () => {
        try {
            if (viewMode === "month" && !filterMonth) {
                setExpenses([]);
                return;
            }
            const params = new URLSearchParams();
            if (viewMode === "month") params.set("month", String(filterMonth));
            params.set("year", String(filterYear));
            params.set("type", cashflowDir);
            if (filterVerified !== null)
                params.set("is_verified", String(filterVerified));
            const data = await fetchExpensesList(apiFetch, params);
            setExpenses(Array.isArray(data) ? data : data.results);
        } catch (e) {
            logError("fetchExpenses:", e);
        }
    }, [
        apiFetch,
        filterMonth,
        filterYear,
        viewMode,
        cashflowDir,
        filterVerified,
        setExpenses,
    ]);

    const fetchTrends = useCallback(async () => {
        try {
            const data = await fetchExpenseTrends(apiFetch);
            setTrendExpenses(data.expenses || []);
            setTrendIncomes(data.incomes || []);
        } catch (e) {
            logError("fetchTrends:", e);
        }
    }, [apiFetch, setTrendExpenses, setTrendIncomes]);

    // Backwards-compatible aliases for views that explicitly refresh one chart.
    // Both directions come from the same aggregate endpoint.
    const fetchTrendExpenses = fetchTrends;
    const fetchTrendIncomes = fetchTrends;

    const {
        toggleDashCard,
        moveDashCard,
        reorderDashCards,
        resetDashConfig,
        syncDashboardPreferences,
        updateMonthlyOverviewPrefs,
        fetchProfile,
        updateProfile,
        changePassword,
        deleteAccount,
        updateDecimalSeparator,
        updatePrivacyPreferences,
        updatePrivacyPreference,
        updateEnabledFeature,
        updateTransactionPreference,
        isFeatureEnabled,
        isPrivacyValueTemporarilyRevealed,
        isPrivacyScopeTemporarilyRevealed,
        revealPrivacyValue,
        hidePrivacyScope,
        isValueHidden,
        isPrivacyPreferenceEnabled,
        isPrivacyScopeEnabled,
    } = useProfilePreferences({
        accountingMonthStartDay,
        apiFetch,
        applyProfileData,
        enabledFeatures,
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
        temporaryPrivacyReveals,
        transactionPrefs,
    });

    const {
        fetchPortfolioHistory,
        fetchFireGoal,
        toggleWealthMetric,
        changeWealthTimeRange,
        fetchAllocationData,
        fetchBudgets,
        fetchRecurringExpenses,
        fetchRecurringInvestmentPlans,
    } = usePlanningData({
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
    });

    const fetchCategories = useCallback(async () => {
        const now = Date.now();
        const cache = categoriesCacheRef.current;
        if (cache.data) {
            setCategories(cache.data);
            if (now - cache.ts < CLIENT_CACHE_TTL_MS) return;
        }
        if (cache.inFlight) {
            try {
                const data = await cache.inFlight;
                setCategories(data);
            } catch {
                /* no-op */
            }
            return;
        }
        cache.inFlight = (async () => {
            const raw = await fetchExpenseCategoriesList(apiFetch);
            const data = Array.isArray(raw) ? raw : raw.results;
            cache.data = data;
            cache.ts = Date.now();
            return data;
        })().finally(() => {
            cache.inFlight = null;
        });
        try {
            setCategories(await cache.inFlight);
        } catch (e) {
            logError("fetchCategories:", e);
        }
    }, [apiFetch, categoriesCacheRef, setCategories]);

    const fetchAssets = useCallback(async () => {
        const now = Date.now();
        const cache = assetsCacheRef.current;
        if (cache.data) {
            setAssets(cache.data);
            if (now - cache.ts < CLIENT_CACHE_TTL_MS) return;
        }
        if (cache.inFlight) {
            try {
                const data = await cache.inFlight;
                setAssets(data);
            } catch {
                /* no-op */
            }
            return;
        }
        cache.inFlight = (async () => {
            const raw = await fetchPortfolioAssetsList(apiFetch);
            const data = Array.isArray(raw) ? raw : raw.results;
            cache.data = data;
            cache.ts = Date.now();
            return data;
        })().finally(() => {
            cache.inFlight = null;
        });
        try {
            setAssets(await cache.inFlight);
        } catch (e) {
            logError("fetchAssets:", e);
        }
    }, [apiFetch, assetsCacheRef, setAssets]);

    const fetchPortfolioSummary = useCallback(async () => {
        const now = Date.now();
        const cache = summaryCacheRef.current;
        if (cache.data) {
            setSummary(cache.data);
            if (now - cache.ts < CLIENT_CACHE_TTL_MS) return;
        }
        if (cache.inFlight) {
            try {
                const data = await cache.inFlight;
                setSummary(data);
            } catch {
                /* no-op */
            }
            return;
        }
        cache.inFlight = (async () => {
            const data = await fetchPortfolioSummaryData(apiFetch);
            cache.data = data;
            cache.ts = Date.now();
            return data;
        })().finally(() => {
            cache.inFlight = null;
        });
        try {
            setSummary(await cache.inFlight);
        } catch (e) {
            logError("fetchPortfolioSummary:", e);
        }
    }, [apiFetch, setSummary, summaryCacheRef]);

    const fetchMonthlyOverview = useCallback(
        async (year?: number) => {
            try {
                const y = year || new Date().getFullYear();
                const data = await fetchMonthlyOverviewData(apiFetch, y);
                setMonthlyOverview(data);
                setMonthlyOverviewAvailableYears(data.available_years ?? []);
            } catch (e) {
                logError("fetchMonthlyOverview:", e);
            }
        },
        [apiFetch, setMonthlyOverview, setMonthlyOverviewAvailableYears],
    );

    const fetchMonthlyOverviewForYear = useCallback(
        async (year: number) => {
            try {
                return await fetchMonthlyOverviewData(apiFetch, year);
            } catch {
                return null;
            }
        },
        [apiFetch],
    );

    const fetchExpSummary = useCallback(async () => {
        try {
            if (!filterMonth) {
                setExpSummary({ total: 0, by_category: [] });
                return;
            }
            const params = new URLSearchParams();
            params.set("month", String(filterMonth));
            params.set("year", String(filterYear));
            setExpSummary(await fetchExpenseSummaryData(apiFetch, params));
        } catch (e) {
            logError("fetchExpSummary:", e);
        }
    }, [apiFetch, filterMonth, filterYear, setExpSummary]);

    const fetchMonthlyInvestmentStats = useCallback(async () => {
        try {
            if (!invStatsMonth) return;
            const params = new URLSearchParams();
            params.set("month", String(invStatsMonth));
            params.set("year", String(invStatsYear));
            setMonthlyInvestmentStats(
                await fetchMonthlyInvestmentStatsData(apiFetch, params),
            );
        } catch (e) {
            logError("fetchMonthlyInvestmentStats:", e);
        }
    }, [apiFetch, invStatsMonth, invStatsYear, setMonthlyInvestmentStats]);

    const fetchRecurringStatus = useCallback(async () => {
        try {
            const now = new Date();
            const params = new URLSearchParams();
            params.set("month", String(now.getMonth() + 1));
            params.set("year", String(now.getFullYear()));
            setRecurringStatus(
                await fetchRecurringStatusData(apiFetch, params),
            );
        } catch (e) {
            logError("fetchRecurringStatus:", e);
        }
    }, [apiFetch, setRecurringStatus]);

    // Dashboard widgets that always refer to "this month" (e.g. Budget Progress)
    // need a summary independent from the user-controlled filterMonth on the
    // Cash Flow tab. Fetched at boot and refreshed after expense mutations.
    const fetchExpSummaryCurrentMonth = useCallback(
        async (startDayOverride?: number) => {
            try {
                const currentPeriod = currentAccountingMonth(
                    startDayOverride ?? accountingMonthStartDay,
                );
                const params = new URLSearchParams();
                params.set("month", String(currentPeriod.month));
                params.set("year", String(currentPeriod.year));
                params.set("type", "expense");
                setExpSummaryCurrentMonth(
                    await fetchExpenseSummaryData(apiFetch, params),
                );
            } catch (e) {
                logError("fetchExpSummaryCurrentMonth:", e);
            }
        },
        [apiFetch, accountingMonthStartDay, setExpSummaryCurrentMonth],
    );

    const updateAccountingMonthStartDay = useCallback(
        async (day: number) => {
            const startDay = clampAccountingMonthStartDay(day);
            try {
                const data = await updateUserProfile(apiFetch, {
                    accounting_month_start_day: startDay,
                });
                const { startDay: savedDay } = applyProfileData(data, startDay);
                const period = getCurrentAccountingMonthDateRange(savedDay);
                setFilterMonth(period.month);
                setFilterYear(period.year);
                setCfFilters((prev) => ({
                    ...prev,
                    date_from: period.from,
                    date_to: period.to,
                }));
                fetchExpSummaryCurrentMonth(savedDay);
                fetchMonthlyOverview(monthlyOverviewPrefs.year);
                return true;
            } catch (e) {
                logError("updateAccountingMonthStartDay:", e);
                return false;
            }
        },
        [
            apiFetch,
            applyProfileData,
            fetchExpSummaryCurrentMonth,
            fetchMonthlyOverview,
            monthlyOverviewPrefs.year,
            setCfFilters,
            setFilterMonth,
            setFilterYear,
        ],
    );

    const { fetchContributionSources, fetchInvestmentTypes } = useCatalogData({
        apiFetch,
        setAssetForm,
        setContributionSources,
        setInvestmentTypes,
    });

    return {
        fetchExpenses,
        fetchTrends,
        fetchTrendExpenses,
        fetchTrendIncomes,
        toggleDashCard,
        moveDashCard,
        reorderDashCards,
        resetDashConfig,
        updateMonthlyOverviewPrefs,
        fetchProfile,
        updateProfile,
        changePassword,
        deleteAccount,
        updateDecimalSeparator,
        updatePrivacyPreferences,
        updatePrivacyPreference,
        updateEnabledFeature,
        updateTransactionPreference,
        isFeatureEnabled,
        isPrivacyValueTemporarilyRevealed,
        isPrivacyScopeTemporarilyRevealed,
        revealPrivacyValue,
        hidePrivacyScope,
        isValueHidden,
        isPrivacyPreferenceEnabled,
        isPrivacyScopeEnabled,
        fetchCategories,
        fetchAssets,
        fetchPortfolioSummary,
        fetchMonthlyOverview,
        fetchMonthlyOverviewForYear,
        fetchExpSummary,
        fetchMonthlyInvestmentStats,
        fetchRecurringStatus,
        fetchExpSummaryCurrentMonth,
        updateAccountingMonthStartDay,
        fetchPortfolioHistory,
        fetchFireGoal,
        toggleWealthMetric,
        changeWealthTimeRange,
        fetchAllocationData,
        fetchBudgets,
        fetchRecurringExpenses,
        fetchRecurringInvestmentPlans,
        fetchInvestmentTypes,
        fetchContributionSources,
    };
}
