import { useCallback, useEffect, useRef, useState } from "react";
import type { TokenResponse } from "../api/auth";
import type { GrantsResponse } from "../api/sharing";
import type { PortfolioSummaryResponse } from "../api/portfolio";
import type { ProfileResponse } from "../api/profile";
import { clearAccessToken, setAccessToken } from "../utils/api";
import { logError } from "../utils/logger";
import {
    authenticateWithBiometric,
    clearStoredCredentialId,
    deleteCredential,
    listCredentials,
    registerBiometric,
} from "../utils/webauthn";
import {
    requestDemoLogin,
    requestLogin,
    requestLogout,
    requestRegister,
} from "../api/auth";
import { useSharing } from "./useSharing";
import { useAuthenticatedFetch } from "./useAuthenticatedFetch";
import {
    APPLOCK_BG_MS,
    DEFAULT_ENABLED_FEATURES,
    DEFAULT_PRIVACY_PREFERENCES,
    DEFAULT_TRANSACTION_PREFERENCES,
    clampAccountingMonthStartDay,
    clearDashboardLocalCache,
    cloneDashConfig,
    emptyProfilePatchQueue,
    firstEnabledTab,
    isTabEnabled,
    mergeDashConfig,
    normalizeEnabledFeatures,
    normalizeMonthlyOverviewPrefs,
    normalizePrivacyPreferences,
    normalizeTransactionPreferences,
    normalizeWealthMetrics,
    scrollToTop,
} from "./appContextHelpers";
import type {
    EnabledFeatures,
    PrivacyPreferences,
    ProfilePatchQueue,
    TransactionPreferences,
} from "./appContextHelpers";
import type { AppProviderState } from "./useAppProviderState";
import type { ViewAsAccount } from "./useAuthenticatedFetch";

type ClientCache<T> = {
    data: T | null;
    ts: number;
    inFlight: Promise<T> | null;
};

type UserProfile = {
    email: string;
    name: string;
    accounting_month_start_day: number;
    enabled_features: EnabledFeatures;
};

type ProfileApplyResult = {
    startDay: number;
    enabledFeatures: EnabledFeatures;
};

export function useSessionController(providerState: AppProviderState) {
    const {
        setCategories,
        setAssets,
        setSummary,
        setInvestmentTypes,
        setContributionSources,
        setExpenses,
        setTrendExpenses,
        setTrendIncomes,
        setBudgets,
        setRecurringExpenses,
        setRecurringInvestmentPlans,
        setPortfolioHistory,
        setDashConfig,
        setMonthlyOverviewPrefs,
        setWealthMetrics,
        setDemoConfirm,
        setDemoUnderstood,
    } = providerState;
    // ── Auth ──
    // HIGH-21: the access token is in memory only, so it cannot survive a reload.
    // `fn_session` is a non-secret hint that a refresh cookie likely exists; we
    // start optimistically authenticated and let the boot silent-refresh confirm
    // (or the first 401 → refresh failure log out).
    const [isAuthenticated, setIsAuthenticated] = useState(
        () => localStorage.getItem("fn_session") === "1",
    );
    const [isDemo, setIsDemo] = useState(
        () => localStorage.getItem("is_demo") === "true",
    );
    const [authSessionNonce, setAuthSessionNonce] = useState(0);
    // ── App-lock (biometric) ──
    const [appLockEnabled, setAppLockEnabled] = useState(
        () => localStorage.getItem("applock_enabled") === "1",
    );
    // ── Tab swipe navigation ──
    const [tabSwipeEnabled, setTabSwipeEnabledState] = useState(
        () => localStorage.getItem("tab_swipe_enabled") !== "0",
    );
    const setTabSwipeEnabled = (val: boolean): void => {
        localStorage.setItem("tab_swipe_enabled", val ? "1" : "0");
        setTabSwipeEnabledState(val);
    };
    // Locked on first load/reload when a session already exists and the lock is on
    const [isLocked, setIsLocked] = useState(
        () =>
            localStorage.getItem("applock_enabled") === "1" &&
            localStorage.getItem("fn_session") === "1" &&
            localStorage.getItem("is_demo") !== "true",
    );
    const bgTimestampRef = useRef<number | null>(null);
    const [showDemoModal, setShowDemoModal] = useState(false);
    const categoriesCacheRef = useRef<
        ClientCache<AppProviderState["categories"]>
    >({
        data: null,
        ts: 0,
        inFlight: null,
    });
    const assetsCacheRef = useRef<ClientCache<AppProviderState["assets"]>>({
        data: null,
        ts: 0,
        inFlight: null,
    });
  const summaryCacheRef = useRef<ClientCache<PortfolioSummaryResponse>>({
        data: null,
        ts: 0,
        inFlight: null,
    });
    const cacheContextRef = useRef("__none__");
    const profilePatchQueueRef = useRef<ProfilePatchQueue>(
        emptyProfilePatchQueue(),
    );

    const resetQueuedProfilePatch = useCallback((): void => {
        const queued = profilePatchQueueRef.current;
        if (queued.timer) clearTimeout(queued.timer);
        profilePatchQueueRef.current = emptyProfilePatchQueue(queued.chain);
    }, []);

    const resetClientState = useCallback((): void => {
        categoriesCacheRef.current = { data: null, ts: 0, inFlight: null };
        assetsCacheRef.current = { data: null, ts: 0, inFlight: null };
        summaryCacheRef.current = { data: null, ts: 0, inFlight: null };
        cacheContextRef.current = "__none__";
        resetQueuedProfilePatch();
        clearDashboardLocalCache();
        setCategories([]);
        setAssets([]);
        setSummary({});
        setInvestmentTypes([]);
        setContributionSources([]);
        setExpenses([]);
        setTrendExpenses([]);
        setTrendIncomes([]);
        setBudgets([]);
        setRecurringExpenses([]);
        setRecurringInvestmentPlans([]);
        setPortfolioHistory([]);
        setDashConfig(cloneDashConfig());
        setMonthlyOverviewPrefs(normalizeMonthlyOverviewPrefs({}));
        setWealthMetrics(["wealth"]);
    }, [
        resetQueuedProfilePatch,
        setAssets,
        setBudgets,
        setCategories,
        setContributionSources,
        setDashConfig,
        setExpenses,
        setInvestmentTypes,
        setMonthlyOverviewPrefs,
        setPortfolioHistory,
        setRecurringExpenses,
        setRecurringInvestmentPlans,
        setSummary,
        setTrendExpenses,
        setTrendIncomes,
        setWealthMetrics,
    ]);

    // Returns true and shows the demo modal if in demo mode — use as early guard in mutating actions
    const guardDemo = useCallback(() => {
        if (localStorage.getItem("is_demo") === "true") {
            setShowDemoModal(true);
            return true;
        }
        return false;
    }, []);
    const [user, setUser] = useState<string | null>(null);

    const login = useCallback(
        async (email: string, password: string) => {
            try {
                const res = await requestLogin(email, password);
                if (!res.ok) return false;
                const data = (await res.json()) as TokenResponse;
                resetClientState();
                setAccessToken(data.access);
                localStorage.setItem("fn_session", "1");
                localStorage.setItem("auth_email", email);
                localStorage.removeItem("is_demo");
                setShowDemoModal(false);
                setDemoConfirm(false);
                setDemoUnderstood(false);
                setIsAuthenticated(true);
                setIsDemo(false);
                setUser(email);
                setTab("dashboard");
                scrollToTop();
                setAuthSessionNonce((n) => n + 1);
                // Fresh password login → never start locked (the user just authenticated)
                setIsLocked(false);
                return true;
            } catch {
                return false;
            }
        },
        [resetClientState, setDemoConfirm, setDemoUnderstood],
    );

    const register = useCallback(
        async (email: string, password: string, password2: string) => {
            return requestRegister(email, password, password2);
        },
        [],
    );

    const demoLogin = useCallback(async () => {
        try {
            const res = await requestDemoLogin();
            if (!res.ok) return false;
            const data = (await res.json()) as TokenResponse;
            resetClientState();
            setAccessToken(data.access);
            localStorage.setItem("fn_session", "1");
            localStorage.setItem("is_demo", "true");
            localStorage.setItem("auth_email", "demo@demo.com");
            setShowDemoModal(false);
            setDemoConfirm(false);
            setDemoUnderstood(false);
            setIsAuthenticated(true);
            setIsDemo(true);
            setUser("demo@demo.com");
            setIsLocked(false);
            setTab("dashboard");
            scrollToTop();
            setAuthSessionNonce((n) => n + 1);
            return true;
        } catch {
            return false;
        }
    }, [resetClientState, setDemoConfirm, setDemoUnderstood]);

    const [decimalSeparator, setDecimalSeparator] = useState<"," | ".">(",");
    const [accountingMonthStartDay, setAccountingMonthStartDay] = useState(1);
    const [profile, setProfile] = useState<UserProfile>({
        email: "",
        name: "",
        accounting_month_start_day: 1,
        enabled_features: DEFAULT_ENABLED_FEATURES,
    });
    const [privacyPreferences, setPrivacyPreferences] =
        useState<PrivacyPreferences>(DEFAULT_PRIVACY_PREFERENCES);
    const [enabledFeatures, setEnabledFeatures] = useState<EnabledFeatures>(
        DEFAULT_ENABLED_FEATURES,
    );
    const [transactionPrefs, setTransactionPrefs] =
        useState<TransactionPreferences>(DEFAULT_TRANSACTION_PREFERENCES);
    const [temporaryPrivacyReveals, setTemporaryPrivacyReveals] = useState<
        Record<string, number>
    >({});
    const privacyRevealTimersRef = useRef<
        Record<string, ReturnType<typeof setTimeout>>
    >({});

    useEffect(() => {
        const timers = privacyRevealTimersRef.current;
        return () => {
            Object.values(timers).forEach(clearTimeout);
        };
    }, [resetClientState, setDemoConfirm, setDemoUnderstood]);
    const applyProfileData = useCallback(
        (data: ProfileResponse, fallbackStartDay = 1): ProfileApplyResult => {
            const startDay = clampAccountingMonthStartDay(
                data.accounting_month_start_day ?? fallbackStartDay,
            );
            const features = normalizeEnabledFeatures(data.enabled_features);
            setAccountingMonthStartDay(startDay);
            setEnabledFeatures(features);
            // Keep auth_email fresh so the app-lock screen can re-authenticate by email
            if (data.email) localStorage.setItem("auth_email", data.email);
            setProfile({
                email: data.email ?? "",
                name: data.name ?? "",
                accounting_month_start_day: startDay,
                enabled_features: features,
            });
            setPrivacyPreferences(
                normalizePrivacyPreferences(data.privacy_preferences),
            );
            if (
                Object.prototype.hasOwnProperty.call(
                    data,
                    "transaction_preferences",
                )
            ) {
                setTransactionPrefs(
                    normalizeTransactionPreferences(
                        data.transaction_preferences,
                    ),
                );
            }
            // Dashboard layout + section view-prefs: server is the source of truth once
            // authenticated, so all of the user's devices share one ordering and the
            // same Monthly Net Worth / wealth-chart selection. Mirror into localStorage
            // as a fast pre-auth cache. (Demo users don't get these fields — they keep
            // their local-only values.)
            if (
                Object.prototype.hasOwnProperty.call(data, "dashboard_config")
            ) {
                const mergedDash =
                    mergeDashConfig(data.dashboard_config) ?? cloneDashConfig();
                setDashConfig(mergedDash);
                try {
                    localStorage.setItem(
                        "dashConfig",
                        JSON.stringify(mergedDash),
                    );
                } catch {
                    // localStorage is an optional cache and can be unavailable.
                }
            }
            if (
                Object.prototype.hasOwnProperty.call(
                    data,
                    "dashboard_preferences",
                )
            ) {
                const dprefs: Record<string, unknown> =
                    data.dashboard_preferences &&
                    typeof data.dashboard_preferences === "object" &&
                    !Array.isArray(data.dashboard_preferences)
                        ? (data.dashboard_preferences as Record<
                              string,
                              unknown
                          >)
                        : {};
                const mp = normalizeMonthlyOverviewPrefs(
                    dprefs.monthly_overview,
                );
                const wm = normalizeWealthMetrics(dprefs.wealth_metrics);
                setMonthlyOverviewPrefs(mp);
                setWealthMetrics(wm);
                try {
                    localStorage.setItem(
                        "monthlyOverviewPrefs",
                        JSON.stringify(mp),
                    );
                    localStorage.setItem(
                        "wealthChartMetrics",
                        JSON.stringify(wm),
                    );
                } catch {
                    // localStorage is an optional cache and can be unavailable.
                }
            }
            return { startDay, enabledFeatures: features };
        },
        [setDashConfig, setMonthlyOverviewPrefs, setWealthMetrics],
    );
    const logout = useCallback(() => {
        // Best-effort server-side logout: clears + blacklists the refresh cookie.
        // Fire-and-forget (uses plain fetch, never apiFetch, to avoid a refresh loop).
        try {
            requestLogout().catch(() => {});
        } catch {
            /* ignore */
        }
        clearAccessToken();
        resetClientState();
        localStorage.removeItem("fn_session");
        localStorage.removeItem("is_demo");
        localStorage.removeItem("auth_email");
        localStorage.removeItem("demoBannerDismissed");
        setShowDemoModal(false);
        setDemoConfirm(false);
        setDemoUnderstood(false);
        setIsAuthenticated(false);
        setIsDemo(false);
        setUser(null);
        setIsLocked(false);
        setViewAs(null);
        setTab("dashboard");
        scrollToTop();
        setDecimalSeparator(",");
        setAccountingMonthStartDay(1);
        setEnabledFeatures(DEFAULT_ENABLED_FEATURES);
        setProfile({
            email: "",
            name: "",
            accounting_month_start_day: 1,
            enabled_features: DEFAULT_ENABLED_FEATURES,
        });
        setPrivacyPreferences(DEFAULT_PRIVACY_PREFERENCES);
        setTransactionPrefs(DEFAULT_TRANSACTION_PREFERENCES);
        setAuthSessionNonce((n) => n + 1);
    }, [resetClientState, setDemoConfirm, setDemoUnderstood]);

    // ── App-lock methods ──
    // Enable: register a platform credential (prompts Face ID/Touch ID), then flag on.
    const enableAppLock = useCallback(async () => {
        await registerBiometric();
        localStorage.setItem("applock_enabled", "1");
        setAppLockEnabled(true);
        return true;
    }, []);

    // Disable: remove the server credential(s) for this user and clear local state.
    const disableAppLock = useCallback(async () => {
        try {
            const creds = await listCredentials();
            await Promise.all(creds.map((c) => deleteCredential(c.id)));
        } catch (e) {
            logError("disableAppLock:", e);
        }
        clearStoredCredentialId();
        localStorage.removeItem("applock_enabled");
        setAppLockEnabled(false);
        setIsLocked(false);
        return true;
    }, []);

    // Unlock: re-verify biometric (iOS falls back to device PIN natively on failure).
    // Adopts the fresh tokens returned by the server to keep the session warm.
    const unlock = useCallback(async () => {
        const email = localStorage.getItem("auth_email");
        if (!email) return false;
        const tokens = await authenticateWithBiometric(email);
        if (tokens?.access) {
            setAccessToken(tokens.access);
            localStorage.setItem("fn_session", "1");
            setIsLocked(false);
            return true;
        }
        return false;
    }, []);

    // Re-lock when the app returns to the foreground after being backgrounded > threshold
    useEffect(() => {
        const onVisibility = () => {
            if (document.visibilityState === "hidden") {
                bgTimestampRef.current = Date.now();
                return;
            }
            if (document.visibilityState === "visible") {
                const away = bgTimestampRef.current;
                bgTimestampRef.current = null;
                if (
                    away &&
                    Date.now() - away > APPLOCK_BG_MS &&
                    localStorage.getItem("applock_enabled") === "1" &&
                    localStorage.getItem("fn_session") === "1" &&
                    localStorage.getItem("is_demo") !== "true"
                ) {
                    setIsLocked(true);
                }
            }
        };
        document.addEventListener("visibilitychange", onVisibility);
        return () =>
            document.removeEventListener("visibilitychange", onVisibility);
    }, []);

    // viewAs: { userId, email, permission } | null
    const [viewAs, setViewAs] = useState<ViewAsAccount | null>(null);
    const [grants, setGrants] = useState<GrantsResponse>({
        given: [],
        received: [],
    });

    const apiFetch = useAuthenticatedFetch({ logout, viewAs });
    const sharingController = useSharing({
        apiFetch,
        setGrants,
        setViewAs,
    });
    const { fetchGrants, switchAccount } = sharingController;

    const [tab, setTab] = useState<string>(
        () => localStorage.getItem("tab") || "dashboard",
    );
    useEffect(() => {
        localStorage.setItem("tab", tab);
    }, [tab]);
    useEffect(() => {
        if (!isTabEnabled(tab, enabledFeatures)) {
            setTab(firstEnabledTab(enabledFeatures));
        }
    }, [enabledFeatures, tab]);
    return {
        isAuthenticated,
        isDemo,
        authSessionNonce,
        appLockEnabled,
        tabSwipeEnabled,
        setTabSwipeEnabled,
        isLocked,
        showDemoModal,
        setShowDemoModal,
        user,
        login,
        logout,
        register,
        demoLogin,
        guardDemo,
        decimalSeparator,
        setDecimalSeparator,
        accountingMonthStartDay,
        setAccountingMonthStartDay,
        profile,
        privacyPreferences,
        setPrivacyPreferences,
        enabledFeatures,
        setEnabledFeatures,
        transactionPrefs,
        setTransactionPrefs,
        temporaryPrivacyReveals,
        setTemporaryPrivacyReveals,
        privacyRevealTimersRef,
        applyProfileData,
        categoriesCacheRef,
        assetsCacheRef,
        summaryCacheRef,
        cacheContextRef,
        profilePatchQueueRef,
        enableAppLock,
        disableAppLock,
        unlock,
        viewAs,
        grants,
        apiFetch,
        sharingController,
        fetchGrants,
        switchAccount,
        tab,
        setTab,
    };
}

export type SessionController = ReturnType<typeof useSessionController>;
