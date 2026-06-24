import { useCallback } from "react";
import { logError } from "../utils/logger";
import { updateUserProfile } from "../api/profile";
import {
    clampAccountingMonthStartDay,
    getCurrentAccountingMonthDateRange,
} from "./appContextHelpers";
import { useProfilePreferences } from "./useProfilePreferences";
import { usePlanningData } from "./usePlanningData";
import type { Dispatch, SetStateAction } from "react";
import type { CashflowFilters } from "./feedDefaults";
import type { AppProviderState } from "./useAppProviderState";
import type { SessionController } from "./useSessionController";

type ProviderDataState = Pick<
    AppProviderState,
    | "setDashConfig"
    | "setFilterMonth"
    | "setFilterYear"
    | "setMonthlyOverviewPrefs"
    | "setWealthMetrics"
    | "setWealthRangeOffset"
    | "setWealthTimeRange"
>;

type SessionDataState = Pick<
    SessionController,
    | "accountingMonthStartDay"
    | "apiFetch"
    | "applyProfileData"
    | "enabledFeatures"
    | "logout"
    | "privacyPreferences"
    | "privacyRevealTimersRef"
    | "profilePatchQueueRef"
    | "setDecimalSeparator"
    | "setTemporaryPrivacyReveals"
    | "setTransactionPrefs"
    | "temporaryPrivacyReveals"
    | "transactionPrefs"
>;

type UseAppDataArgs = ProviderDataState &
    SessionDataState & {
        setCfFilters: Dispatch<SetStateAction<CashflowFilters>>;
        // Invalidators from useAppQueries that updateAccountingMonthStartDay
        // must trigger after the accounting period shifts.
        fetchExpSummaryCurrentMonth: () => unknown;
        fetchMonthlyOverview: (year?: number) => unknown;
    };

export function useAppData({
    accountingMonthStartDay,
    apiFetch,
    applyProfileData,
    enabledFeatures,
    fetchExpSummaryCurrentMonth,
    fetchMonthlyOverview,
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
}: UseAppDataArgs) {
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

    const { toggleWealthMetric, changeWealthTimeRange } = usePlanningData({
        setWealthMetrics,
        setWealthRangeOffset,
        setWealthTimeRange,
        syncDashboardPreferences,
    });

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
                // accountingMonthStartDay change re-keys the current-month
                // summary query, but the monthly overview is keyed on year only
                // and must be invalidated explicitly since its buckets shift.
                fetchExpSummaryCurrentMonth();
                fetchMonthlyOverview();
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
            setCfFilters,
            setFilterMonth,
            setFilterYear,
        ],
    );

    return {
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
        updateAccountingMonthStartDay,
        toggleWealthMetric,
        changeWealthTimeRange,
    };
}
