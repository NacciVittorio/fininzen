import { useEffect, useRef } from "react";
import type { Translator } from "../types";
import type { AppProviderState } from "./useAppProviderState";
import type { SessionController } from "./useSessionController";

type BootstrapProviderState = Pick<
    AppProviderState,
    | "bootstrapReady"
    | "monthlyOverviewPrefs"
    | "setAppLoading"
    | "setAssets"
    | "setBootstrapReady"
    | "setCategories"
    | "setContributionSources"
    | "setFetchError"
    | "setSummary"
>;

type BootstrapSessionState = Pick<
    SessionController,
    | "assetsCacheRef"
    | "cacheContextRef"
    | "categoriesCacheRef"
    | "fetchGrants"
    | "isAuthenticated"
    | "summaryCacheRef"
    | "user"
    | "viewAs"
>;

type BootstrapTask = () => unknown;

type UseAppBootstrapArgs = BootstrapProviderState &
    BootstrapSessionState & {
        T: Translator;
        fetchAllocationData: BootstrapTask;
        fetchAssets: BootstrapTask;
        fetchBudgets: BootstrapTask;
        fetchCategories: BootstrapTask;
        fetchContributionSources: BootstrapTask;
        fetchExpSummary: BootstrapTask;
        fetchExpSummaryCurrentMonth: BootstrapTask;
        fetchExpenses: BootstrapTask;
        fetchFireGoal: BootstrapTask;
        fetchInvestmentTypes: BootstrapTask;
        fetchMonthlyOverview: (year: number) => unknown;
        fetchPortfolioHistory: BootstrapTask;
        fetchPortfolioSummary: BootstrapTask;
        fetchProfile: BootstrapTask;
        fetchRecurringExpenses: BootstrapTask;
        fetchRecurringInvestmentPlans: BootstrapTask;
        fetchRecurringStatus: BootstrapTask;
        fetchTrends: BootstrapTask;
    };

export function useAppBootstrap({
    assetsCacheRef,
    bootstrapReady,
    cacheContextRef,
    categoriesCacheRef,
    fetchAllocationData,
    fetchAssets,
    fetchBudgets,
    fetchCategories,
    fetchContributionSources,
    fetchExpSummary,
    fetchExpSummaryCurrentMonth,
    fetchExpenses,
    fetchFireGoal,
    fetchGrants,
    fetchInvestmentTypes,
    fetchMonthlyOverview,
    fetchPortfolioHistory,
    fetchPortfolioSummary,
    fetchProfile,
    fetchRecurringExpenses,
    fetchRecurringInvestmentPlans,
    fetchRecurringStatus,
    fetchTrends,
    isAuthenticated,
    monthlyOverviewPrefs,
    setAppLoading,
    setAssets,
    setBootstrapReady,
    setCategories,
    setContributionSources,
    setFetchError,
    setSummary,
    summaryCacheRef,
    T,
    user,
    viewAs,
}: UseAppBootstrapArgs): void {
    // ── Effects ──

    const initialBootstrapRef = useRef({
        T,
        cacheContextRef,
        fetchAssets,
        fetchCategories,
        fetchContributionSources,
        fetchPortfolioSummary,
        fetchProfile,
        setAppLoading,
        setBootstrapReady,
        setFetchError,
        user,
        viewAs,
    });
    initialBootstrapRef.current = {
        T,
        cacheContextRef,
        fetchAssets,
        fetchCategories,
        fetchContributionSources,
        fetchPortfolioSummary,
        fetchProfile,
        setAppLoading,
        setBootstrapReady,
        setFetchError,
        user,
        viewAs,
    };

    useEffect(() => {
        const bootstrap = initialBootstrapRef.current;
        if (!isAuthenticated) {
            bootstrap.setAppLoading(false);
            bootstrap.setBootstrapReady(false);
            return;
        }
        let cancelled = false;
        bootstrap.setAppLoading(true);
        bootstrap.setBootstrapReady(false);
        bootstrap.setFetchError(null);
        bootstrap.cacheContextRef.current = `${bootstrap.user || "anon"}::${bootstrap.viewAs ? bootstrap.viewAs.userId : "self"}`;
        Promise.allSettled([
            bootstrap.fetchProfile(),
            bootstrap.fetchCategories(),
            bootstrap.fetchAssets(),
            bootstrap.fetchPortfolioSummary(),
            bootstrap.fetchContributionSources(),
        ])
            .then((results) => {
                if (cancelled) return;
                const failed = results.filter((r) => r.status === "rejected");
                if (failed.length === results.length) {
                    bootstrap.setFetchError(bootstrap.T("error_network"));
                }
            })
            .finally(() => {
                if (cancelled) return;
                bootstrap.setAppLoading(false);
                bootstrap.setBootstrapReady(true);
            });
        return () => {
            cancelled = true;
        };
    }, [isAuthenticated]);

    useEffect(() => {
        if (!isAuthenticated || !bootstrapReady) return;
        void fetchInvestmentTypes();
        void fetchContributionSources();
        void fetchAllocationData();
        void fetchBudgets();
        void fetchRecurringExpenses();
        void fetchRecurringInvestmentPlans();
        void fetchTrends();
        void fetchExpSummaryCurrentMonth();
    }, [
        isAuthenticated,
        bootstrapReady,
        fetchInvestmentTypes,
        fetchContributionSources,
        fetchAllocationData,
        fetchBudgets,
        fetchRecurringExpenses,
        fetchRecurringInvestmentPlans,
        fetchTrends,
        fetchExpSummaryCurrentMonth,
    ]);

    useEffect(() => {
        if (isAuthenticated && bootstrapReady) fetchGrants();
    }, [isAuthenticated, bootstrapReady, fetchGrants]);

    useEffect(() => {
        if (isAuthenticated && bootstrapReady) {
            fetchExpenses();
            fetchExpSummary();
            fetchRecurringStatus();
        }
    }, [
        isAuthenticated,
        bootstrapReady,
        fetchExpenses,
        fetchExpSummary,
        fetchRecurringStatus,
    ]);
    useEffect(() => {
        if (isAuthenticated && bootstrapReady) fetchPortfolioHistory();
    }, [isAuthenticated, bootstrapReady, fetchPortfolioHistory]);
    useEffect(() => {
        if (isAuthenticated && bootstrapReady) fetchFireGoal();
    }, [isAuthenticated, bootstrapReady, fetchFireGoal]);
    useEffect(() => {
        if (isAuthenticated && bootstrapReady)
            fetchMonthlyOverview(monthlyOverviewPrefs.year);
    }, [
        isAuthenticated,
        bootstrapReady,
        monthlyOverviewPrefs.year,
        fetchMonthlyOverview,
    ]);

    useEffect(() => {
        if (!isAuthenticated) return;
        const contextKey = `${user || "anon"}::${viewAs ? viewAs.userId : "self"}`;
        if (cacheContextRef.current === contextKey) return;
        cacheContextRef.current = contextKey;
        categoriesCacheRef.current = { data: null, ts: 0, inFlight: null };
        assetsCacheRef.current = { data: null, ts: 0, inFlight: null };
        summaryCacheRef.current = { data: null, ts: 0, inFlight: null };
        setCategories([]);
        setAssets([]);
        setContributionSources([]);
        setSummary({});
        fetchCategories();
        fetchAssets();
        fetchContributionSources();
        fetchPortfolioSummary();
    }, [
        isAuthenticated,
        user,
        viewAs,
        fetchCategories,
        fetchAssets,
        fetchContributionSources,
        fetchPortfolioSummary,
        assetsCacheRef,
        cacheContextRef,
        categoriesCacheRef,
        setAssets,
        setCategories,
        setContributionSources,
        setSummary,
        summaryCacheRef,
    ]);
}
