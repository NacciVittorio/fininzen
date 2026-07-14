import { useCallback, useEffect } from "react";
import { API } from "../utils/api";
import { logError } from "../utils/logger";
import { fetchUserProfile, updateUserProfile } from "../api/profile";
import {
    DEFAULT_ENABLED_FEATURES,
    DEFAULT_TRANSACTION_PREFERENCES,
    PRIVACY_REVEAL_MS,
    PROFILE_PATCH_DEBOUNCE_MS,
    cloneDashConfig,
    emptyProfilePatchQueue,
    getCurrentAccountingMonthDateRange,
    normalizeEnabledFeatures,
    normalizePrivacyPreferences,
    privacyKey,
} from "./appContextHelpers";
import type {
    DashboardSection,
    FeatureKey,
    MonthlyOverviewPreferences,
    PrivacyPreferences,
    TransactionPreferences,
    WealthMetric,
} from "./appContextHelpers";
import type { ProfilePayload } from "../api/profile";
import type { DecimalSeparator } from "../utils/formatters";
import type { Dispatch, SetStateAction } from "react";
import type { CashflowFilters } from "./feedDefaults";
import type { AppProviderState } from "./useAppProviderState";
import type { SessionController } from "./useSessionController";

type ProfileProviderState = Pick<
    AppProviderState,
    | "setDashConfig"
    | "setFilterMonth"
    | "setFilterYear"
    | "setMonthlyOverviewPrefs"
>;

type ProfileSessionState = Pick<
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

type UseProfilePreferencesArgs = ProfileProviderState &
    ProfileSessionState & {
        setCfFilters: Dispatch<SetStateAction<CashflowFilters>>;
    };

type DashboardPreferencePatch = {
    monthlyOverview?: MonthlyOverviewPreferences;
    wealthMetrics?: WealthMetric[];
};

type QueuedProfilePatch = {
    dashboard_config?: DashboardSection[];
    dashboard_preferences?: Record<string, unknown>;
};

type AccountActionResult =
    { ok: true } | { ok: false; errorKey: string; detail?: unknown };

type TransactionPreferenceKey = keyof TransactionPreferences;

export function useProfilePreferences({
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
}: UseProfilePreferencesArgs) {
    // Dashboard preference writes are debounced and serialized. UI/localStorage
    // update immediately, while the server receives only the latest pending state
    // in request order, avoiding out-of-order PATCH overwrites.
    const queueProfilePatch = useCallback(
        (patch: QueuedProfilePatch) => {
            const queued = profilePatchQueueRef.current;
            if (
                Object.prototype.hasOwnProperty.call(patch, "dashboard_config")
            ) {
                queued.dashboardConfig = patch.dashboard_config;
            }
            if (
                patch.dashboard_preferences &&
                typeof patch.dashboard_preferences === "object" &&
                !Array.isArray(patch.dashboard_preferences)
            ) {
                queued.dashboardPreferences = {
                    ...queued.dashboardPreferences,
                    ...patch.dashboard_preferences,
                };
            }
            if (queued.timer) clearTimeout(queued.timer);
            queued.timer = setTimeout(() => {
                const current = profilePatchQueueRef.current;
                const body: QueuedProfilePatch = {};
                if (current.dashboardConfig !== undefined) {
                    body.dashboard_config = current.dashboardConfig;
                }
                if (Object.keys(current.dashboardPreferences).length > 0) {
                    body.dashboard_preferences = current.dashboardPreferences;
                }
                profilePatchQueueRef.current = emptyProfilePatchQueue(
                    current.chain,
                );
                if (Object.keys(body).length === 0) return;
                const nextChain = current.chain
                    .catch(() => {})
                    .then(async () => {
                        await updateUserProfile(apiFetch, body);
                    })
                    .catch((e) => logError("queueProfilePatch:", e));
                profilePatchQueueRef.current.chain = nextChain;
            }, PROFILE_PATCH_DEBOUNCE_MS);
        },
        [apiFetch, profilePatchQueueRef],
    );

    useEffect(() => {
        return () => {
            const queued = profilePatchQueueRef.current;
            if (queued.timer) clearTimeout(queued.timer);
        };
    }, [profilePatchQueueRef]);

    // Persist a layout to the localStorage cache and best-effort sync it to the
    // profile so every device sees the same order/visibility.
    const persistDashConfig = useCallback(
        (next: DashboardSection[]) => {
            try {
                localStorage.setItem("dashConfig", JSON.stringify(next));
            } catch {
                // localStorage is a best-effort cache.
            }
            queueProfilePatch({ dashboard_config: next });
        },
        [queueProfilePatch],
    );

    const toggleDashCard = useCallback(
        (id: string) => {
            setDashConfig((prev) => {
                const next = prev.map((c) =>
                    c.id === id ? { ...c, visible: !c.visible } : c,
                );
                persistDashConfig(next);
                return next;
            });
        },
        [persistDashConfig, setDashConfig],
    );

    const moveDashCard = useCallback(
        (id: string, dir: -1 | 1) => {
            setDashConfig((prev) => {
                const idx = prev.findIndex((c) => c.id === id);
                const swapIdx = idx + dir;
                if (idx < 0 || swapIdx < 0 || swapIdx >= prev.length)
                    return prev;
                const next = [...prev];
                const current = next[idx]!;
                next[idx] = next[swapIdx]!;
                next[swapIdx] = current;
                persistDashConfig(next);
                return next;
            });
        },
        [persistDashConfig, setDashConfig],
    );

    // Drag-to-reorder commit: applies a full new id order (ids not present in
    // orderedIds keep their relative position at the end).
    const reorderDashCards = useCallback(
        (orderedIds: string[]) => {
            setDashConfig((prev) => {
                const byId = new Map(prev.map((c) => [c.id, c]));
                const next = orderedIds
                    .map((id) => byId.get(id))
                    .filter((card): card is DashboardSection => Boolean(card))
                    .concat(prev.filter((c) => !orderedIds.includes(c.id)));
                persistDashConfig(next);
                return next;
            });
        },
        [persistDashConfig, setDashConfig],
    );

    const resetDashConfig = useCallback(() => {
        const next = cloneDashConfig();
        setDashConfig(next);
        persistDashConfig(next);
    }, [persistDashConfig, setDashConfig]);

    // Best-effort server sync for dashboard section view-prefs. Sends only the
    // changed top-level keys; the backend merges them into dashboard_preferences.
    const syncDashboardPreferences = useCallback(
        ({
            monthlyOverview: mo,
            wealthMetrics: wm,
        }: DashboardPreferencePatch = {}) => {
            const dashboard_preferences: Record<string, unknown> = {};
            if (mo !== undefined) dashboard_preferences.monthly_overview = mo;
            if (wm !== undefined) dashboard_preferences.wealth_metrics = wm;
            if (Object.keys(dashboard_preferences).length === 0) return;
            queueProfilePatch({ dashboard_preferences });
        },
        [queueProfilePatch],
    );

    // Merge a patch into the Monthly Net Worth prefs, cache locally, and sync.
    // Replaces the component-local updatePrefs in MonthlyNetWorthTable so the
    // year/range/mode follow the user across devices (the grid-vs-list rendering
    // stays responsive, but both devices request the same year → same numbers).
    const updateMonthlyOverviewPrefs = useCallback(
        (patch: Partial<MonthlyOverviewPreferences>) => {
            setMonthlyOverviewPrefs((prev) => {
                const next = { ...prev, ...patch };
                try {
                    localStorage.setItem(
                        "monthlyOverviewPrefs",
                        JSON.stringify(next),
                    );
                } catch {
                    // localStorage is a best-effort cache.
                }
                syncDashboardPreferences({ monthlyOverview: next });
                return next;
            });
        },
        [setMonthlyOverviewPrefs, syncDashboardPreferences],
    );

    const fetchProfile = useCallback(async () => {
        try {
            const data = await fetchUserProfile(apiFetch);
            setDecimalSeparator(data.decimal_separator ?? ",");
            const { startDay } = applyProfileData(data, 1);
            const currentPeriod = getCurrentAccountingMonthDateRange(startDay);
            setFilterMonth(currentPeriod.month);
            setFilterYear(currentPeriod.year);
            setCfFilters((prev) => {
                if (!prev.date_from || !prev.date_to) return prev;
                const calendarCurrent = getCurrentAccountingMonthDateRange(1);
                const isInitialCalendarPeriod =
                    prev.date_from === calendarCurrent.from &&
                    prev.date_to === calendarCurrent.to;
                return isInitialCalendarPeriod
                    ? {
                          ...prev,
                          date_from: currentPeriod.from,
                          date_to: currentPeriod.to,
                      }
                    : prev;
            });
        } catch (e) {
            logError("fetchProfile:", e);
        }
    }, [
        apiFetch,
        applyProfileData,
        setCfFilters,
        setDecimalSeparator,
        setFilterMonth,
        setFilterYear,
    ]);

    const updateProfile = useCallback(
        async (payload: ProfilePayload) => {
            try {
                const data = await updateUserProfile(apiFetch, payload);
                applyProfileData(data, accountingMonthStartDay);
                return true;
            } catch (e) {
                logError("updateProfile:", e);
                return false;
            }
        },
        [apiFetch, accountingMonthStartDay, applyProfileData],
    );

    const changePassword = useCallback(
        async (
            oldPassword: string,
            newPassword: string,
        ): Promise<AccountActionResult> => {
            try {
                const res = await apiFetch(`${API}/auth/change-password/`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        old_password: oldPassword,
                        new_password: newPassword,
                    }),
                });
                if (res.status === 400) {
                    const err = await res.json().catch(() => ({}));
                    return {
                        ok: false,
                        errorKey: "password_change_error_current",
                        detail: err,
                    };
                }
                if (!res.ok)
                    return { ok: false, errorKey: "error_save_failed" };
                return { ok: true };
            } catch (e) {
                logError("changePassword:", e);
                return { ok: false, errorKey: "error_network" };
            }
        },
        [apiFetch],
    );

    const deleteAccount = useCallback(
        async (
            password: string,
            confirm = "DELETE",
        ): Promise<AccountActionResult> => {
            try {
                const res = await apiFetch(`${API}/auth/account/`, {
                    method: "DELETE",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ password, confirm }),
                });
                if (res.status === 400) {
                    const err = (await res.json().catch(() => ({}))) as Record<
                        string,
                        unknown
                    >;
                    return {
                        ok: false,
                        errorKey: "account_delete_error_password",
                        detail: err,
                    };
                }
                if (res.status === 403) {
                    const err = await res.json().catch(() => ({}));
                    const errorKey =
                        err.error === "demo_account_delete_disabled"
                            ? "account_delete_error_demo"
                            : "account_delete_error_viewas";
                    return { ok: false, errorKey, detail: err };
                }
                if (!res.ok && res.status !== 204) {
                    return { ok: false, errorKey: "error_save_failed" };
                }
                logout();
                return { ok: true };
            } catch (e) {
                logError("deleteAccount:", e);
                return { ok: false, errorKey: "error_network" };
            }
        },
        [apiFetch, logout],
    );

    const updateDecimalSeparator = useCallback(
        async (sep: DecimalSeparator) => {
            try {
                const data = await updateUserProfile(apiFetch, {
                    decimal_separator: sep,
                });
                setDecimalSeparator(data.decimal_separator ?? ",");
                applyProfileData(data, accountingMonthStartDay);
                return true;
            } catch (e) {
                logError("updateDecimalSeparator:", e);
                return false;
            }
        },
        [
            apiFetch,
            accountingMonthStartDay,
            applyProfileData,
            setDecimalSeparator,
        ],
    );

    const updatePrivacyPreferences = useCallback(
        async (nextPrefs: PrivacyPreferences) => {
            const normalized = normalizePrivacyPreferences(nextPrefs);
            try {
                const data = await updateUserProfile(apiFetch, {
                    privacy_preferences: normalized,
                });
                applyProfileData(data, accountingMonthStartDay);
                return true;
            } catch (e) {
                logError("updatePrivacyPreferences:", e);
                return false;
            }
        },
        [apiFetch, accountingMonthStartDay, applyProfileData],
    );

    const updatePrivacyPreference = useCallback(
        async (scope: string, key: string, hidden: boolean) => {
            const next = {
                ...privacyPreferences,
                [scope]: {
                    ...(privacyPreferences[scope] || {}),
                    [key]: !!hidden,
                },
            };
            const ok = await updatePrivacyPreferences(next);
            if (!ok) return false;
            return true;
        },
        [privacyPreferences, updatePrivacyPreferences],
    );

    const updateEnabledFeature = useCallback(
        async (featureKey: FeatureKey, enabled: boolean) => {
            if (!(featureKey in DEFAULT_ENABLED_FEATURES)) return false;
            const next = normalizeEnabledFeatures({
                ...enabledFeatures,
                [featureKey]: !!enabled,
            });
            try {
                const data = await updateUserProfile(apiFetch, {
                    enabled_features: next,
                });
                applyProfileData(data, accountingMonthStartDay);
                return true;
            } catch (e) {
                logError("updateEnabledFeature:", e);
                return false;
            }
        },
        [apiFetch, enabledFeatures, accountingMonthStartDay, applyProfileData],
    );

    const updateTransactionPreference = useCallback(
        async (prefKey: TransactionPreferenceKey, value: boolean) => {
            if (!(prefKey in DEFAULT_TRANSACTION_PREFERENCES)) return false;
            const previous = transactionPrefs;
            // Optimistic update so the toggle flips immediately; rollback on failure.
            setTransactionPrefs((prev) => ({ ...prev, [prefKey]: !!value }));
            try {
                const data = await updateUserProfile(apiFetch, {
                    transaction_preferences: { [prefKey]: !!value },
                });
                applyProfileData(data, accountingMonthStartDay);
                return true;
            } catch (e) {
                setTransactionPrefs(previous);
                logError("updateTransactionPreference:", e);
                return false;
            }
        },
        [
            apiFetch,
            transactionPrefs,
            accountingMonthStartDay,
            applyProfileData,
            setTransactionPrefs,
        ],
    );

    const isFeatureEnabled = useCallback(
        (featureKey: FeatureKey) => !!enabledFeatures[featureKey],
        [enabledFeatures],
    );

    const isPrivacyValueTemporarilyRevealed = useCallback(
        (scope: string, key: string) => {
            const expiresAt =
                temporaryPrivacyReveals[scope] ??
                temporaryPrivacyReveals[privacyKey(scope, key)];
            return !!expiresAt && expiresAt > Date.now();
        },
        [temporaryPrivacyReveals],
    );

    const isPrivacyScopeTemporarilyRevealed = useCallback(
        (scope: string) => {
            const expiresAt = temporaryPrivacyReveals[scope];
            return !!expiresAt && expiresAt > Date.now();
        },
        [temporaryPrivacyReveals],
    );

    const revealPrivacyValue = useCallback(
        (scope: string, _key: string, durationMs = PRIVACY_REVEAL_MS) => {
            const id = scope;
            const expiresAt = Date.now() + durationMs;
            if (privacyRevealTimersRef.current[id]) {
                clearTimeout(privacyRevealTimersRef.current[id]);
            }
            setTemporaryPrivacyReveals((prev) => ({
                ...prev,
                [id]: expiresAt,
            }));
            privacyRevealTimersRef.current[id] = setTimeout(() => {
                setTemporaryPrivacyReveals((prev) => {
                    const next = { ...prev };
                    delete next[id];
                    return next;
                });
                delete privacyRevealTimersRef.current[id];
            }, durationMs);
        },
        [privacyRevealTimersRef, setTemporaryPrivacyReveals],
    );

    const hidePrivacyScope = useCallback(
        (scope: string) => {
            if (privacyRevealTimersRef.current[scope]) {
                clearTimeout(privacyRevealTimersRef.current[scope]);
                delete privacyRevealTimersRef.current[scope];
            }
            setTemporaryPrivacyReveals((prev) => {
                const next = { ...prev };
                delete next[scope];
                return next;
            });
        },
        [privacyRevealTimersRef, setTemporaryPrivacyReveals],
    );

    const isValueHidden = useCallback(
        (scope: string, key: string) =>
            !!privacyPreferences?.[scope]?.[key] &&
            !isPrivacyValueTemporarilyRevealed(scope, key),
        [privacyPreferences, isPrivacyValueTemporarilyRevealed],
    );

    const isPrivacyPreferenceEnabled = useCallback(
        (scope: string, key: string) => !!privacyPreferences[scope]?.[key],
        [privacyPreferences],
    );

    const isPrivacyScopeEnabled = useCallback(
        (scope: string) =>
            Object.values(privacyPreferences[scope] || {}).some(
                (enabled) => !!enabled,
            ),
        [privacyPreferences],
    );

    return {
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
    };
}
