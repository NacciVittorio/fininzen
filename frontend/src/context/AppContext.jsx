/* @refresh reset */
import {
  createContext,
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from "react";
import {
  API,
  LONG_FETCH_TIMEOUT_MS,
  authHeaders,
  fetchWithTimeout,
  setAccessToken,
  clearAccessToken,
  getCsrfToken,
} from "../utils/api";
import {
  today,
  currentYear,
  currentMonth,
  parseCSV,
  parseAmount,
  parseFlexibleDecimal,
  parseMoneyToString,
} from "../utils/formatters";
import { buildCashflowImportRows } from "../utils/csvImport";
import {
  buildTxForm,
  buildTransferForm,
  buildExpenseForm,
  buildRecurringForm,
  buildPacForm,
} from "./formBuilders";
import { useThemeLang } from "./useThemeLang";
import { REFRESH_REASONS } from "../utils/refreshReasons";
import { logDebug, logError, logWarn } from "../utils/logger";
import {
  registerBiometric,
  authenticateWithBiometric,
  clearStoredCredentialId,
  listCredentials,
  deleteCredential,
} from "../utils/webauthn";

export const AppContext = createContext(null);

import {
  CLIENT_CACHE_TTL_MS,
  APPLOCK_BG_MS,
  DEFAULT_PRIVACY_PREFERENCES,
  PRIVACY_REVEAL_MS,
  DEFAULT_ENABLED_FEATURES,
  DEFAULT_TRANSACTION_PREFERENCES,
  PROFILE_PATCH_DEBOUNCE_MS,
  clampAccountingMonthStartDay,
  accountingMonthDateRange,
  currentAccountingMonth,
  getCurrentAccountingMonthDateRange,
  normalizeBorsaFundInput,
  normalizePrivacyPreferences,
  normalizeEnabledFeatures,
  normalizeTransactionPreferences,
  cloneDashConfig,
  clearDashboardLocalCache,
  mergeDashConfig,
  normalizeMonthlyOverviewPrefs,
  normalizeWealthMetrics,
  emptyProfilePatchQueue,
  firstEnabledTab,
  isTabEnabled,
  privacyKey,
  scrollToTop,
} from "./appContextHelpers";

// Ri-esportati per preservare la superficie di import pubblica.
export {
  mergeDashConfig,
  normalizeMonthlyOverviewPrefs,
  normalizeWealthMetrics,
} from "./appContextHelpers";

export function AppProvider({ children }) {
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
  const setTabSwipeEnabled = (val) => {
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
  const bgTimestampRef = useRef(null);
  const [showDemoModal, setShowDemoModal] = useState(false);
  const categoriesCacheRef = useRef({ data: null, ts: 0, inFlight: null });
  const assetsCacheRef = useRef({ data: null, ts: 0, inFlight: null });
  const summaryCacheRef = useRef({ data: null, ts: 0, inFlight: null });
  const cacheContextRef = useRef("__none__");
  const profilePatchQueueRef = useRef(emptyProfilePatchQueue());

  function resetQueuedProfilePatch() {
    const queued = profilePatchQueueRef.current;
    if (queued.timer) clearTimeout(queued.timer);
    profilePatchQueueRef.current = emptyProfilePatchQueue(queued.chain);
  }

  function resetClientState() {
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
  }

  // Returns true and shows the demo modal if in demo mode — use as early guard in mutating actions
  const guardDemo = useCallback(() => {
    if (localStorage.getItem("is_demo") === "true") {
      setShowDemoModal(true);
      return true;
    }
    return false;
  }, []);
  const [user, setUser] = useState(null);

  const login = useCallback(async (email, password) => {
    try {
      const res = await fetchWithTimeout(`${API}/auth/token/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: email, password }),
      });
      if (!res.ok) return false;
      const data = await res.json();
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
  }, []);

  const register = useCallback(async (email, password, password2) => {
    try {
      const res = await fetchWithTimeout(`${API}/auth/register/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, password2 }),
      });
      if (res.ok) return { ok: true };
      const data = await res.json().catch(() => ({}));
      const errors = Object.values(data).flat().filter(Boolean);
      return {
        ok: false,
        status: res.status,
        errors: errors.length ? errors : null,
      };
    } catch {
      return { ok: false };
    }
  }, []);

  const demoLogin = useCallback(async () => {
    try {
      const res = await fetchWithTimeout(`${API}/auth/demo/`, {
        method: "POST",
        timeoutMs: LONG_FETCH_TIMEOUT_MS,
      });
      if (!res.ok) return false;
      const data = await res.json();
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
  }, []);

  const [decimalSeparator, setDecimalSeparator] = useState(",");
  const [accountingMonthStartDay, setAccountingMonthStartDay] = useState(1);
  const [profile, setProfile] = useState({
    email: "",
    name: "",
    accounting_month_start_day: 1,
    enabled_features: DEFAULT_ENABLED_FEATURES,
  });
  const [privacyPreferences, setPrivacyPreferences] = useState(
    DEFAULT_PRIVACY_PREFERENCES,
  );
  const [enabledFeatures, setEnabledFeatures] = useState(
    DEFAULT_ENABLED_FEATURES,
  );
  const [transactionPrefs, setTransactionPrefs] = useState(
    DEFAULT_TRANSACTION_PREFERENCES,
  );
  const [temporaryPrivacyReveals, setTemporaryPrivacyReveals] = useState({});
  const privacyRevealTimersRef = useRef({});

  useEffect(() => {
    const timers = privacyRevealTimersRef.current;
    return () => {
      Object.values(timers).forEach(clearTimeout);
    };
  }, []);
  const applyProfileData = useCallback((data, fallbackStartDay = 1) => {
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
    if (Object.prototype.hasOwnProperty.call(data, "transaction_preferences")) {
      setTransactionPrefs(
        normalizeTransactionPreferences(data.transaction_preferences),
      );
    }
    // Dashboard layout + section view-prefs: server is the source of truth once
    // authenticated, so all of the user's devices share one ordering and the
    // same Monthly Net Worth / wealth-chart selection. Mirror into localStorage
    // as a fast pre-auth cache. (Demo users don't get these fields — they keep
    // their local-only values.)
    if (Object.prototype.hasOwnProperty.call(data, "dashboard_config")) {
      const mergedDash =
        mergeDashConfig(data.dashboard_config) ?? cloneDashConfig();
      setDashConfig(mergedDash);
      try {
        localStorage.setItem("dashConfig", JSON.stringify(mergedDash));
      } catch {}
    }
    if (Object.prototype.hasOwnProperty.call(data, "dashboard_preferences")) {
      const dprefs =
        data.dashboard_preferences &&
        typeof data.dashboard_preferences === "object" &&
        !Array.isArray(data.dashboard_preferences)
          ? data.dashboard_preferences
          : {};
      const mp = normalizeMonthlyOverviewPrefs(dprefs.monthly_overview);
      const wm = normalizeWealthMetrics(dprefs.wealth_metrics);
      setMonthlyOverviewPrefs(mp);
      setWealthMetrics(wm);
      try {
        localStorage.setItem("monthlyOverviewPrefs", JSON.stringify(mp));
        localStorage.setItem("wealthChartMetrics", JSON.stringify(wm));
      } catch {}
    }
    return { startDay, enabledFeatures: features };
  }, []);
  const logout = useCallback(() => {
    // Best-effort server-side logout: clears + blacklists the refresh cookie.
    // Fire-and-forget (uses plain fetch, never apiFetch, to avoid a refresh loop).
    try {
      fetchWithTimeout(`${API}/auth/logout/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": getCsrfToken(),
        },
      }).catch(() => {});
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
  }, []);

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
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  // viewAs: { userId, email, permission } | null
  const [viewAs, setViewAs] = useState(null);
  const [grants, setGrants] = useState({ given: [], received: [] });

  // Shared promise for in-flight token refresh. Prevents concurrent 401 handlers
  // from each calling /token/refresh/ simultaneously — with ROTATE_REFRESH_TOKENS=True
  // only the first call succeeds; all others blacklist the token and force logout.
  const refreshingRef = useRef(null);

  // apiFetch: adds auth headers + X-View-As when active, handles 401
  const apiFetch = useCallback(
    async (url, options = {}) => {
      const viewAsHeaders = viewAs
        ? { "X-View-As": String(viewAs.userId) }
        : {};
      const opts = {
        ...options,
        headers: {
          ...authHeaders(),
          ...viewAsHeaders,
          ...(options.headers || {}),
        },
      };
      let res = await fetchWithTimeout(url, opts);
      if (res.status === 401) {
        // HIGH-21: the refresh token is an httpOnly cookie the browser attaches
        // automatically; we only echo the double-submit CSRF token. A shared
        // promise dedupes concurrent 401s (rotation invalidates the old token).
        if (!refreshingRef.current) {
          refreshingRef.current = (async () => {
            try {
              const refreshRes = await fetchWithTimeout(
                `${API}/auth/token/refresh/`,
                {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    "X-CSRF-Token": getCsrfToken(),
                  },
                },
              );
              if (refreshRes.ok) {
                const data = await refreshRes.json();
                setAccessToken(data.access);
                return true;
              }
              logout();
              return false;
            } catch {
              logout();
              return false;
            } finally {
              refreshingRef.current = null;
            }
          })();
        }
        const refreshed = await refreshingRef.current;
        if (refreshed) {
          const retryOpts = {
            ...options,
            headers: {
              ...authHeaders(),
              ...viewAsHeaders,
              ...(options.headers || {}),
            },
          };
          res = await fetchWithTimeout(url, retryOpts);
        }
      }
      return res;
    },
    [logout, viewAs],
  );

  const [tab, setTab] = useState(
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

  // i18n + tema (light/dark/auto) — concern estratto in context/useThemeLang.js
  const {
    lang,
    setLang,
    T,
    theme,
    themePreference,
    setTheme,
    toggleTheme,
    MONTHS,
  } = useThemeLang();

  // Dashboard config — layout (order + visibility) synced server-side via the
  // profile (applyProfileData). localStorage is a cache/fallback for offline
  // and pre-auth render.
  const [dashConfig, setDashConfig] = useState(() => {
    try {
      const merged = mergeDashConfig(
        JSON.parse(localStorage.getItem("dashConfig") || "null"),
      );
      if (merged) {
        localStorage.setItem("dashConfig", JSON.stringify(merged));
        return merged;
      }
    } catch {}
    return cloneDashConfig();
  });
  const [showDashSettings, setShowDashSettings] = useState(false);

  // Data
  const [expenses, setExpenses] = useState([]);
  const [trendExpenses, setTrendExpenses] = useState([]);
  const [trendIncomes, setTrendIncomes] = useState([]);
  const [categories, setCategories] = useState([]);
  const [assets, setAssets] = useState([]);
  const [summary, setSummary] = useState(null);
  const [expSummary, setExpSummary] = useState(null);
  const [recurringStatus, setRecurringStatus] = useState(null);
  // Always for the current calendar month — drives Dashboard widgets that
  // shouldn't follow the Cash Flow tab's filterMonth.
  const [expSummaryCurrentMonth, setExpSummaryCurrentMonth] = useState({
    total: 0,
    by_category: [],
  });

  const [monthlyInvestmentStats, setMonthlyInvestmentStats] = useState(null);
  // Mese/anno dedicati alla card statistiche investimenti (tab Investimenti):
  // navigano indipendentemente dal filterMonth del Cash Flow.
  const [invStatsMonth, setInvStatsMonth] = useState(currentMonth);
  const [invStatsYear, setInvStatsYear] = useState(currentYear);

  // Investment types
  const [investmentTypes, setInvestmentTypes] = useState([]);
  const [contributionSources, setContributionSources] = useState([]);
  const [showInvTypeModal, setShowInvTypeModal] = useState(false);
  const [invTypeForm, setInvTypeForm] = useState({
    name: "",
    color: "#4f7fff",
    icon: "📈",
    supports_ticker: true,
    is_liquid_default: true,
    is_bank_account: false,
    supports_contribution_source: false,
    tax_rate: "0",
  });
  const [editingInvTypeId, setEditingInvTypeId] = useState(null);

  // Allocation
  const [allocationData, setAllocationData] = useState([]);

  // Budgets
  const [budgets, setBudgets] = useState([]);
  const [editingBudgetCat, setEditingBudgetCat] = useState(null);
  const [budgetInputVal, setBudgetInputVal] = useState("");

  // Recurring
  const [recurringExpenses, setRecurringExpenses] = useState([]);
  const [showRecurringModal, setShowRecurringModal] = useState(false);
  const [editingRecurringId, setEditingRecurringId] = useState(null);
  const [recurringForm, setRecurringForm] = useState(() =>
    buildRecurringForm(),
  );
  const [recurringError, setRecurringError] = useState(null);
  const [recurringSaving, setRecurringSaving] = useState(false);
  const [generateRecurringMsg, setGenerateRecurringMsg] = useState(null);
  const [recurringInvestmentPlans, setRecurringInvestmentPlans] = useState([]);
  const [showPacModal, setShowPacModal] = useState(false);
  const [editingPacId, setEditingPacId] = useState(null);
  const [pacForm, setPacForm] = useState(() => buildPacForm());
  const [pacError, setPacError] = useState(null);
  const [pacSaving, setPacSaving] = useState(false);
  const [generatePacMsg, setGeneratePacMsg] = useState(null);

  // ── Cash Flow Feed (K-3.1) ──
  const [cfItems, setCfItems] = useState([]);
  const [cfSummary, setCfSummary] = useState({
    income: "0.00",
    outcome: "0.00",
    net: "0.00",
  });
  const cfPageRef = useRef(1);
  const cfRequestSeqRef = useRef(0);
  // HIGH-28: holds the in-flight cashflow request so a newer load (e.g. a
  // filter change) can abort a slow previous one instead of only discarding it.
  const cfAbortRef = useRef(null);
  const [cfHasMore, setCfHasMore] = useState(false);
  const [cfLoading, setCfLoading] = useState(false);
  const [cfTotalCount, setCfTotalCount] = useState(0);

  // ── Cash Flow bulk selection (K-3.7) ──
  const [cfSelectionMode, setCfSelectionMode] = useState(false);
  // When cfSelectAllFiltered is false: cfSelectedIds holds the explicit set
  // of feed ids the user picked. When true: every filtered row is selected
  // and cfSelectedIds is interpreted as the inverse — rows the user un-ticked.
  const [cfSelectedIds, setCfSelectedIds] = useState(() => new Set());
  const [cfSelectAllFiltered, setCfSelectAllFiltered] = useState(false);
  const [cfBulkPreview, setCfBulkPreview] = useState(null);
  const [cfBulkLoading, setCfBulkLoading] = useState(false);
  const [cfBulkError, setCfBulkError] = useState(null);
  const [cfBulkEditOpen, setCfBulkEditOpen] = useState(false);
  // The first row picked in selection mode locks the kind for the rest of the
  // session. Subsequent picks of a different kind are rejected with a toast,
  // surfaced via the rejection tick (monotonic counter so the view layer can
  // observe each rejection).
  const [cfSelectionKind, setCfSelectionKind] = useState(null);
  const [cfSelectionRejectionTick, setCfSelectionRejectionTick] = useState(0);
  const getCurrentMonthDateRange = () => {
    const { from, to } = getCurrentAccountingMonthDateRange(1);
    return { from, to };
  };

  const [cfFilters, setCfFilters] = useState(() => {
    const { from, to } = getCurrentMonthDateRange();
    return {
      types: ["income", "outcome", "transfer", "adjustment"],
      verified: null,
      category_ids: [],
      account_ids: [],
      date_from: from,
      date_to: to,
      search: "",
      ordering: "-date",
    };
  });
  // ── Asset Transactions Feed (Portfolio) ──
  const [assetTxItems, setAssetTxItems] = useState([]);
  const assetTxPageRef = useRef(1);
  const assetTxRequestSeqRef = useRef(0);
  const [assetTxHasMore, setAssetTxHasMore] = useState(false);
  const [assetTxLoading, setAssetTxLoading] = useState(false);
  const [assetTxTotalCount, setAssetTxTotalCount] = useState(0);
  const [assetTxFilters, setAssetTxFilters] = useState(() => {
    const { from, to } = getCurrentMonthDateRange();
    return {
      asset_ids: [],
      types: ["buy", "sell", "adjustment"],
      date_from: from,
      date_to: to,
      verified: null,
      search: "",
      ordering: "-date",
    };
  });
  const [assetTxSelectionMode, setAssetTxSelectionMode] = useState(false);
  const [assetTxSelectedIds, setAssetTxSelectedIds] = useState(() => new Set());
  const [assetTxSelectAllFiltered, setAssetTxSelectAllFiltered] =
    useState(false);
  const [assetTxBulkLoading, setAssetTxBulkLoading] = useState(false);
  const [assetTxBulkError, setAssetTxBulkError] = useState(null);

  const [cfEditTransferItem, setCfEditTransferItem] = useState(null);
  const [cfEditTransferForm, setCfEditTransferForm] = useState({
    date: "",
    notes: "",
    is_verified: false,
    amount: "",
  });
  const [cfEditTransferError, setCfEditTransferError] = useState(null);
  const [cfEditTransferLoading, setCfEditTransferLoading] = useState(false);

  // Expense filters
  const [filterMonth, setFilterMonth] = useState(currentMonth);
  const [filterYear, setFilterYear] = useState(currentYear);
  const [filterCat, setFilterCat] = useState([]);
  const [filterAccount, setFilterAccount] = useState("");
  const [viewMode, setViewMode] = useState("month");
  const [cashflowDir, setCashflowDir] = useState("expense");
  const [filterVerified, setFilterVerified] = useState(null);

  // Global loading / error
  const [appLoading, setAppLoading] = useState(true);
  const [bootstrapReady, setBootstrapReady] = useState(false);
  const [fetchError, setFetchError] = useState(null);

  // UI state
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState(null);
  const [priceRefreshCounter, setPriceRefreshCounter] = useState(0);
  const [showExpModal, setShowExpModal] = useState(false);
  const [editingExpenseId, setEditingExpenseId] = useState(null);
  const [expError, setExpError] = useState(null);
  const [modalDir, setModalDir] = useState("expense");
  const [pieHover, setPieHover] = useState(null);
  const [showAssetModal, setShowAssetModal] = useState(false);
  const [editingAssetId, setEditingAssetId] = useState(null);
  const [assetError, setAssetError] = useState(null);
  const [assetSaving, setAssetSaving] = useState(false);
  const [allocChartType, setAllocChartType] = useState("bar");

  // Settings state
  const [settingsCatType, setSettingsCatType] = useState("expense");
  const [settingsMenu, setSettingsMenu] = useState(null);
  const [showCatAddModal, setShowCatAddModal] = useState(false);
  const [catAddContext, setCatAddContext] = useState({
    type: "expense",
    parent: null,
  });
  const [editingCatId, setEditingCatId] = useState(null);
  const [catAddError, setCatAddError] = useState("");
  const [demoLoading, setDemoLoading] = useState(false);
  const [demoError, setDemoError] = useState("");
  const [invTypeError, setInvTypeError] = useState("");

  // Accordion
  const [expandedCats, setExpandedCats] = useState(new Set());

  // Delete flows
  const [deleteExpenseTarget, setDeleteExpenseTarget] = useState(null);
  const [resetConfirm, setResetConfirm] = useState(null);
  const [resetUnderstood, setResetUnderstood] = useState(false);
  const [resetMsg, setResetMsg] = useState(null);
  const [demoConfirm, setDemoConfirm] = useState(false);
  const [demoUnderstood, setDemoUnderstood] = useState(false);
  const [deleteCatFlow, setDeleteCatFlow] = useState(null);
  const [deleteInvTypeFlow, setDeleteInvTypeFlow] = useState(null);
  // Choice popup shown when a tax-rate change (asset override or investment type)
  // could affect existing sells. Shape: { kind: 'asset'|'invtype', run: (propagation)=>Promise }.
  // run("all") propagates the new rate to existing auto sells; run("forward")
  // applies it only to future transactions.
  const [taxPropagationFlow, setTaxPropagationFlow] = useState(null);
  // Original effective tax rates captured at modal-open, to detect a change on save.
  const editingAssetOrigOverrideRef = useRef(null);
  const editingInvTypeOrigRateRef = useRef(null);

  // Transaction panel
  const [txPanel, setTxPanel] = useState(null);
  const [assetTransactions, setAssetTransactions] = useState([]);
  const [txAddMode, setTxAddMode] = useState(false);
  const [editingTxId, setEditingTxId] = useState(null);
  const [txDeleteConfirm, setTxDeleteConfirm] = useState(null);
  const [txForm, setTxForm] = useState(() => buildTxForm());
  const [txLoading, setTxLoading] = useState(false);
  const [txError, setTxError] = useState(null);
  const [txWarning, setTxWarning] = useState(null);
  const [txAutofilling, setTxAutofilling] = useState(false);

  // Transfer modal
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferForm, setTransferForm] = useState(() => buildTransferForm());
  const [transferWarning, setTransferWarning] = useState(null);
  const [transferError, setTransferError] = useState(null);
  const [transferLoading, setTransferLoading] = useState(false);

  // Ticker autocomplete
  const [tickerQuery, setTickerQuery] = useState("");
  const [tickerResults, setTickerResults] = useState([]);
  const [tickerLoading, setTickerLoading] = useState(false);
  const [showTickerDrop, setShowTickerDrop] = useState(false);
  const [tickerSearchOrigin, setTickerSearchOrigin] = useState("ticker");
  const tickerDebounceRef = useRef(null);

  // CSV import
  const [csvFile, setCsvFile] = useState(null);
  const [csvParsed, setCsvParsed] = useState(null);
  const [csvSep, setCsvSep] = useState(";");
  const [csvImportType, setCsvImportType] = useState("cashflow");
  const [csvMap, setCsvMap] = useState({
    type: "",
    date: "",
    description: "",
    amount: "",
    category_name: "",
    linked_asset_name: "",
    expense_category_id: "",
    income_category_id: "",
    is_verified: "",
  });
  const [csvSignConv, setCsvSignConv] = useState("neg");
  const [csvImportResult, setCsvImportResult] = useState(null);
  const [csvImporting, setCsvImporting] = useState(false);
  const [csvImportPreview, setCsvImportPreview] = useState(null);

  // Forms
  const [expForm, setExpForm] = useState(() => buildExpenseForm());
  const [assetForm, setAssetForm] = useState({
    name: "",
    ticker: "",
    price_source: "AUTO",
    source_symbol: "",
    source_url: "",
    isin: "",
    investment_type: "",
    tracking_type: "AUTO",
    initial_balance: "",
    tax_rate_override: "",
    notes: "",
    source_account: "",
    contribution_source_mode: "inherit",
    contribution_source_ids: [],
  });
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [adjustAssetId, setAdjustAssetId] = useState(null);
  const [adjustForm, setAdjustForm] = useState({ new_balance: "" });
  const [adjustError, setAdjustError] = useState(null);
  const [catForm, setCatForm] = useState({
    name: "",
    color: "#4f7fff",
    icon: "💰",
  });

  // Wealth trend
  const [portfolioHistory, setPortfolioHistory] = useState([]);
  const [wealthTimeRange, setWealthTimeRange] = useState("1W");
  const [wealthRangeOffset, setWealthRangeOffset] = useState(0); // months back from today (0 = current)
  const [wealthMetrics, setWealthMetrics] = useState(() => {
    try {
      return normalizeWealthMetrics(
        JSON.parse(localStorage.getItem("wealthChartMetrics") || '["wealth"]'),
      );
    } catch {
      return ["wealth"];
    }
  });
  const [fireGoal, setFireGoal] = useState(null);

  const _initMonthlyPrefs = () => {
    try {
      return normalizeMonthlyOverviewPrefs(
        JSON.parse(localStorage.getItem("monthlyOverviewPrefs") || "{}"),
      );
    } catch {
      return normalizeMonthlyOverviewPrefs({});
    }
  };
  const [monthlyOverview, setMonthlyOverview] = useState(null);
  const [monthlyOverviewAvailableYears, setMonthlyOverviewAvailableYears] =
    useState([]);
  const [monthlyOverviewPrefs, setMonthlyOverviewPrefs] =
    useState(_initMonthlyPrefs);
  // Bumped on data mutations so Compare mode and prev-year fetches re-run.
  const [monthlyOverviewRefreshKey, setMonthlyOverviewRefreshKey] = useState(0);

  // ── Fetch ──

  const fetchExpenses = useCallback(async () => {
    try {
      if (viewMode === "month" && !filterMonth) {
        setExpenses([]);
        return;
      }
      const params = new URLSearchParams();
      if (viewMode === "month") params.set("month", filterMonth);
      params.set("year", filterYear);
      params.set("type", cashflowDir);
      if (filterVerified !== null) params.set("is_verified", filterVerified);
      const res = await apiFetch(`${API}/expenses/?${params}`);
      if (!res.ok) return;
      const data = await res.json();
      setExpenses(data.results || data);
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
  ]);

  const fetchTrends = useCallback(async () => {
    try {
      const res = await apiFetch(`${API}/expenses/trends/`);
      if (!res.ok) return;
      const data = await res.json();
      setTrendExpenses(data.expenses || []);
      setTrendIncomes(data.incomes || []);
    } catch (e) {
      logError("fetchTrends:", e);
    }
  }, [apiFetch]);

  // Backwards-compatible aliases for views that explicitly refresh one chart.
  // Both directions come from the same aggregate endpoint.
  const fetchTrendExpenses = fetchTrends;
  const fetchTrendIncomes = fetchTrends;

  // Dashboard preference writes are debounced and serialized. UI/localStorage
  // update immediately, while the server receives only the latest pending state
  // in request order, avoiding out-of-order PATCH overwrites.
  const queueProfilePatch = useCallback(
    (patch) => {
      const queued = profilePatchQueueRef.current;
      if (Object.prototype.hasOwnProperty.call(patch, "dashboard_config")) {
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
        const body = {};
        if (current.dashboardConfig !== undefined) {
          body.dashboard_config = current.dashboardConfig;
        }
        if (Object.keys(current.dashboardPreferences).length > 0) {
          body.dashboard_preferences = current.dashboardPreferences;
        }
        profilePatchQueueRef.current = emptyProfilePatchQueue(current.chain);
        if (Object.keys(body).length === 0) return;
        const nextChain = current.chain
          .catch(() => {})
          .then(async () => {
            const res = await apiFetch(`${API}/auth/profile/`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            });
            if (!res.ok) {
              logError("queueProfilePatch:", res.status);
            }
          })
          .catch((e) => logError("queueProfilePatch:", e));
        profilePatchQueueRef.current.chain = nextChain;
      }, PROFILE_PATCH_DEBOUNCE_MS);
    },
    [apiFetch],
  );

  useEffect(() => {
    return () => {
      const queued = profilePatchQueueRef.current;
      if (queued.timer) clearTimeout(queued.timer);
    };
  }, []);

  // Persist a layout to the localStorage cache and best-effort sync it to the
  // profile so every device sees the same order/visibility.
  const persistDashConfig = useCallback(
    (next) => {
      try {
        localStorage.setItem("dashConfig", JSON.stringify(next));
      } catch {}
      queueProfilePatch({ dashboard_config: next });
    },
    [queueProfilePatch],
  );

  const toggleDashCard = useCallback(
    (id) => {
      setDashConfig((prev) => {
        const next = prev.map((c) =>
          c.id === id ? { ...c, visible: !c.visible } : c,
        );
        persistDashConfig(next);
        return next;
      });
    },
    [persistDashConfig],
  );

  const moveDashCard = useCallback(
    (id, dir) => {
      setDashConfig((prev) => {
        const idx = prev.findIndex((c) => c.id === id);
        const swapIdx = idx + dir;
        if (idx < 0 || swapIdx < 0 || swapIdx >= prev.length) return prev;
        const next = [...prev];
        [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
        persistDashConfig(next);
        return next;
      });
    },
    [persistDashConfig],
  );

  // Drag-to-reorder commit: applies a full new id order (ids not present in
  // orderedIds keep their relative position at the end).
  const reorderDashCards = useCallback(
    (orderedIds) => {
      setDashConfig((prev) => {
        const byId = new Map(prev.map((c) => [c.id, c]));
        const next = orderedIds
          .map((id) => byId.get(id))
          .filter(Boolean)
          .concat(prev.filter((c) => !orderedIds.includes(c.id)));
        persistDashConfig(next);
        return next;
      });
    },
    [persistDashConfig],
  );

  const resetDashConfig = useCallback(() => {
    const next = cloneDashConfig();
    setDashConfig(next);
    persistDashConfig(next);
  }, [persistDashConfig]);

  // Best-effort server sync for dashboard section view-prefs. Sends only the
  // changed top-level keys; the backend merges them into dashboard_preferences.
  const syncDashboardPreferences = useCallback(
    ({ monthlyOverview: mo, wealthMetrics: wm } = {}) => {
      const dashboard_preferences = {};
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
    (patch) => {
      setMonthlyOverviewPrefs((prev) => {
        const next = { ...prev, ...patch };
        try {
          localStorage.setItem("monthlyOverviewPrefs", JSON.stringify(next));
        } catch {}
        syncDashboardPreferences({ monthlyOverview: next });
        return next;
      });
    },
    [syncDashboardPreferences],
  );

  const fetchProfile = useCallback(async () => {
    try {
      const res = await apiFetch(`${API}/auth/profile/`);
      if (!res.ok) return;
      const data = await res.json();
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
  }, [apiFetch, applyProfileData]);

  const updateProfile = useCallback(
    async (payload) => {
      try {
        const res = await apiFetch(`${API}/auth/profile/`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) return false;
        const data = await res.json();
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
    async (oldPassword, newPassword) => {
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
        if (!res.ok) return { ok: false, errorKey: "error_save_failed" };
        return { ok: true };
      } catch (e) {
        logError("changePassword:", e);
        return { ok: false, errorKey: "error_network" };
      }
    },
    [apiFetch],
  );

  const deleteAccount = useCallback(
    async (password, confirm = "DELETE") => {
      try {
        const res = await apiFetch(`${API}/auth/account/`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password, confirm }),
        });
        if (res.status === 400) {
          const err = await res.json().catch(() => ({}));
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
    async (sep) => {
      try {
        const res = await apiFetch(`${API}/auth/profile/`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ decimal_separator: sep }),
        });
        if (!res.ok) return false;
        const data = await res.json();
        setDecimalSeparator(data.decimal_separator);
        applyProfileData(data, accountingMonthStartDay);
        return true;
      } catch (e) {
        logError("updateDecimalSeparator:", e);
        return false;
      }
    },
    [apiFetch, accountingMonthStartDay, applyProfileData],
  );

  const updatePrivacyPreferences = useCallback(
    async (nextPrefs) => {
      const normalized = normalizePrivacyPreferences(nextPrefs);
      try {
        const res = await apiFetch(`${API}/auth/profile/`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ privacy_preferences: normalized }),
        });
        if (!res.ok) return false;
        const data = await res.json();
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
    async (scope, key, hidden) => {
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
    async (featureKey, enabled) => {
      if (!(featureKey in DEFAULT_ENABLED_FEATURES)) return false;
      const next = normalizeEnabledFeatures({
        ...enabledFeatures,
        [featureKey]: !!enabled,
      });
      try {
        const res = await apiFetch(`${API}/auth/profile/`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ enabled_features: next }),
        });
        if (!res.ok) return false;
        const data = await res.json();
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
    async (prefKey, value) => {
      if (!(prefKey in DEFAULT_TRANSACTION_PREFERENCES)) return false;
      const previous = transactionPrefs;
      // Optimistic update so the toggle flips immediately; rollback on failure.
      setTransactionPrefs((prev) => ({ ...prev, [prefKey]: !!value }));
      try {
        const res = await apiFetch(`${API}/auth/profile/`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            transaction_preferences: { [prefKey]: !!value },
          }),
        });
        if (!res.ok) {
          setTransactionPrefs(previous);
          return false;
        }
        const data = await res.json();
        applyProfileData(data, accountingMonthStartDay);
        return true;
      } catch (e) {
        setTransactionPrefs(previous);
        logError("updateTransactionPreference:", e);
        return false;
      }
    },
    [apiFetch, transactionPrefs, accountingMonthStartDay, applyProfileData],
  );

  const isFeatureEnabled = useCallback(
    (featureKey) => !!enabledFeatures[featureKey],
    [enabledFeatures],
  );

  const isPrivacyValueTemporarilyRevealed = useCallback(
    (scope, key) => {
      const expiresAt =
        temporaryPrivacyReveals[scope] ??
        temporaryPrivacyReveals[privacyKey(scope, key)];
      return !!expiresAt && expiresAt > Date.now();
    },
    [temporaryPrivacyReveals],
  );

  const isPrivacyScopeTemporarilyRevealed = useCallback(
    (scope) => {
      const expiresAt = temporaryPrivacyReveals[scope];
      return !!expiresAt && expiresAt > Date.now();
    },
    [temporaryPrivacyReveals],
  );

  const revealPrivacyValue = useCallback(
    (scope, key, durationMs = PRIVACY_REVEAL_MS) => {
      const id = scope;
      const expiresAt = Date.now() + durationMs;
      if (privacyRevealTimersRef.current[id]) {
        clearTimeout(privacyRevealTimersRef.current[id]);
      }
      setTemporaryPrivacyReveals((prev) => ({ ...prev, [id]: expiresAt }));
      privacyRevealTimersRef.current[id] = setTimeout(() => {
        setTemporaryPrivacyReveals((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
        delete privacyRevealTimersRef.current[id];
      }, durationMs);
    },
    [],
  );

  const hidePrivacyScope = useCallback((scope) => {
    if (privacyRevealTimersRef.current[scope]) {
      clearTimeout(privacyRevealTimersRef.current[scope]);
      delete privacyRevealTimersRef.current[scope];
    }
    setTemporaryPrivacyReveals((prev) => {
      const next = { ...prev };
      delete next[scope];
      return next;
    });
  }, []);

  const isValueHidden = useCallback(
    (scope, key) =>
      !!privacyPreferences?.[scope]?.[key] &&
      !isPrivacyValueTemporarilyRevealed(scope, key),
    [privacyPreferences, isPrivacyValueTemporarilyRevealed],
  );

  const isPrivacyPreferenceEnabled = useCallback(
    (scope, key) => !!privacyPreferences?.[scope]?.[key],
    [privacyPreferences],
  );

  const isPrivacyScopeEnabled = useCallback(
    (scope) =>
      Object.values(privacyPreferences?.[scope] || {}).some(
        (enabled) => !!enabled,
      ),
    [privacyPreferences],
  );

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
      const res = await apiFetch(`${API}/expenses/categories/`);
      if (!res.ok) throw new Error("fetchCategories failed");
      const raw = await res.json();
      const data = raw.results || raw;
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
  }, [apiFetch]);

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
      const res = await apiFetch(`${API}/portfolio/?include_archived=true`);
      if (!res.ok) throw new Error("fetchAssets failed");
      const raw = await res.json();
      const data = raw.results || raw;
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
  }, [apiFetch]);

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
      const res = await apiFetch(`${API}/portfolio/summary/`);
      if (!res.ok) throw new Error("fetchPortfolioSummary failed");
      const data = await res.json();
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
  }, [apiFetch]);

  const fetchMonthlyOverview = useCallback(
    async (year) => {
      try {
        const y = year || new Date().getFullYear();
        const res = await apiFetch(
          `${API}/portfolio/monthly-overview/?year=${y}`,
        );
        if (!res.ok) return;
        const data = await res.json();
        setMonthlyOverview(data);
        setMonthlyOverviewAvailableYears(data.available_years ?? []);
      } catch (e) {
        logError("fetchMonthlyOverview:", e);
      }
    },
    [apiFetch],
  );

  const fetchMonthlyOverviewForYear = useCallback(
    async (year) => {
      try {
        const res = await apiFetch(
          `${API}/portfolio/monthly-overview/?year=${year}`,
        );
        if (!res.ok) return null;
        return await res.json();
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
      params.set("month", filterMonth);
      params.set("year", filterYear);
      const res = await apiFetch(`${API}/expenses/summary/?${params}`);
      if (!res.ok) return;
      setExpSummary(await res.json());
    } catch (e) {
      logError("fetchExpSummary:", e);
    }
  }, [apiFetch, filterMonth, filterYear]);

  const fetchMonthlyInvestmentStats = useCallback(async () => {
    try {
      if (!invStatsMonth) return;
      const params = new URLSearchParams();
      params.set("month", invStatsMonth);
      params.set("year", invStatsYear);
      const res = await apiFetch(
        `${API}/portfolio/monthly-investment-stats/?${params}`,
      );
      if (!res.ok) return;
      setMonthlyInvestmentStats(await res.json());
    } catch (e) {
      logError("fetchMonthlyInvestmentStats:", e);
    }
  }, [apiFetch, invStatsMonth, invStatsYear]);

  const fetchRecurringStatus = useCallback(async () => {
    try {
      const now = new Date();
      const params = new URLSearchParams();
      params.set("month", now.getMonth() + 1);
      params.set("year", now.getFullYear());
      const res = await apiFetch(`${API}/expenses/recurring/status/?${params}`);
      if (!res.ok) return;
      setRecurringStatus(await res.json());
    } catch (e) {
      logError("fetchRecurringStatus:", e);
    }
  }, [apiFetch]);

  // Dashboard widgets that always refer to "this month" (e.g. Budget Progress)
  // need a summary independent from the user-controlled filterMonth on the
  // Cash Flow tab. Fetched at boot and refreshed after expense mutations.
  const fetchExpSummaryCurrentMonth = useCallback(
    async (startDayOverride) => {
      try {
        const currentPeriod = currentAccountingMonth(
          startDayOverride ?? accountingMonthStartDay,
        );
        const params = new URLSearchParams();
        params.set("month", currentPeriod.month);
        params.set("year", currentPeriod.year);
        params.set("type", "expense");
        const res = await apiFetch(`${API}/expenses/summary/?${params}`);
        if (!res.ok) return;
        setExpSummaryCurrentMonth(await res.json());
      } catch (e) {
        logError("fetchExpSummaryCurrentMonth:", e);
      }
    },
    [apiFetch, accountingMonthStartDay],
  );

  const updateAccountingMonthStartDay = useCallback(
    async (day) => {
      const startDay = clampAccountingMonthStartDay(day);
      try {
        const res = await apiFetch(`${API}/auth/profile/`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accounting_month_start_day: startDay }),
        });
        if (!res.ok) return false;
        const data = await res.json();
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
    ],
  );

  const fetchPortfolioHistory = useCallback(async () => {
    const now = new Date();
    // Apply offset: shift the window back by wealthRangeOffset months
    const endDate = new Date(now);
    if (wealthRangeOffset > 0)
      endDate.setMonth(endDate.getMonth() - wealthRangeOffset);
    let startDate = new Date(endDate);
    switch (wealthTimeRange) {
      case "MAX":
        startDate = new Date("2000-01-01");
        break;
      case "5Y":
        startDate.setFullYear(endDate.getFullYear() - 5);
        break;
      case "1Y":
        startDate.setFullYear(endDate.getFullYear() - 1);
        break;
      case "6M":
        startDate.setMonth(endDate.getMonth() - 6);
        break;
      case "1M":
        startDate.setMonth(endDate.getMonth() - 1);
        break;
      case "1W":
        startDate.setDate(endDate.getDate() - 7);
        break;
      case "5D":
        startDate.setDate(endDate.getDate() - 5);
        break;
      case "1D":
        startDate.setDate(endDate.getDate() - 1);
        break;
      default:
        startDate.setFullYear(endDate.getFullYear() - 1);
    }
    const needBreakdown = wealthMetrics.some((m) =>
      ["balance", "investing"].includes(m),
    );
    const params = new URLSearchParams();
    params.set("start_date", startDate.toISOString().split("T")[0]);
    params.set("end_date", endDate.toISOString().split("T")[0]);
    if (needBreakdown) params.set("include_breakdown", "true");
    try {
      const res = await apiFetch(`${API}/portfolio/history/?${params}`);
      if (!res.ok) {
        logError("fetchPortfolioHistory:", res.status, await res.text());
        setPortfolioHistory([]);
        return;
      }
      const json = await res.json();
      setPortfolioHistory(Array.isArray(json) ? json : []);
    } catch (e) {
      logError("fetchPortfolioHistory:", e);
      setPortfolioHistory([]);
    }
  }, [apiFetch, wealthTimeRange, wealthMetrics, wealthRangeOffset]);

  const fetchFireGoal = useCallback(async () => {
    try {
      const res = await apiFetch(`${API}/portfolio/fire/`);
      if (!res.ok) return;
      const data = await res.json();
      const goal = data?.settings?.net_worth_goal;
      setFireGoal(goal ? parseFloat(goal) : null);
    } catch {
      /* silent */
    }
  }, [apiFetch]);

  const toggleWealthMetric = useCallback(
    (metric) => {
      setWealthMetrics((prev) => {
        const after = prev.filter((m) => m !== metric);
        // "goal" is a horizontal line, not a series — require at least one real series to stay active
        const stillHasSeries = after.some((m) => m !== "goal");
        const next = prev.includes(metric)
          ? stillHasSeries
            ? after
            : prev
          : [...prev, metric];
        if (next !== prev) {
          localStorage.setItem("wealthChartMetrics", JSON.stringify(next));
          syncDashboardPreferences({ wealthMetrics: next });
        }
        return next;
      });
    },
    [syncDashboardPreferences],
  );

  const changeWealthTimeRange = useCallback((range) => {
    setWealthTimeRange(range);
    setWealthRangeOffset(0);
  }, []);

  const fetchAllocationData = useCallback(async () => {
    try {
      const res = await apiFetch(`${API}/portfolio/allocation-targets/`);
      if (!res.ok) return;
      setAllocationData(await res.json());
    } catch {
      /* silent */
    }
  }, [apiFetch]);

  const fetchBudgets = useCallback(async () => {
    try {
      const res = await apiFetch(`${API}/expenses/budgets/`);
      if (!res.ok) return;
      const data = await res.json();
      setBudgets(data.results || data);
    } catch {
      /* silent */
    }
  }, [apiFetch]);

  const fetchRecurringExpenses = useCallback(async () => {
    try {
      const res = await apiFetch(`${API}/expenses/recurring/`);
      if (!res.ok) return;
      const data = await res.json();
      setRecurringExpenses(data.results || data);
    } catch {
      /* silent */
    }
  }, [apiFetch]);

  const fetchRecurringInvestmentPlans = useCallback(async () => {
    try {
      const res = await apiFetch(`${API}/portfolio/recurring-investments/`);
      if (!res.ok) return;
      const data = await res.json();
      setRecurringInvestmentPlans(data.results || data);
    } catch {
      /* silent */
    }
  }, [apiFetch]);

  const fetchInvestmentTypes = useCallback(async () => {
    try {
      const res = await apiFetch(`${API}/portfolio/investment-types/`);
      if (!res.ok) return;
      const data = await res.json();
      const types = data.results || data;
      setInvestmentTypes(types);
      setAssetForm((prev) =>
        !prev.investment_type && types.length > 0
          ? { ...prev, investment_type: types[0].id }
          : prev,
      );
    } catch (e) {
      logError("fetchInvestmentTypes:", e);
    }
  }, [apiFetch]);

  const fetchContributionSources = useCallback(async () => {
    try {
      const res = await apiFetch(`${API}/portfolio/contribution-sources/`);
      if (!res.ok) return;
      const data = await res.json();
      setContributionSources(data.results || data);
    } catch (e) {
      logError("fetchContributionSources:", e);
    }
  }, [apiFetch]);

  // ── Refresh orchestration ──

  // Bump refresh key so MonthlyNetWorthTable re-fetches Compare-mode (yearA/yearB)
  // and prev-year overviews after a mutation, since those fetches live in the component.
  const bumpMonthlyRefresh = () => setMonthlyOverviewRefreshKey((k) => k + 1);

  const [assetTxRefreshKey, setAssetTxRefreshKey] = useState(0);
  const bumpAssetTxRefresh = () => setAssetTxRefreshKey((k) => k + 1);

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
    ({ includeHistory = true, includeOverview = true } = {}) => {
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
    ],
  );

  const refreshAfter = useCallback(
    (reason) => {
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
          refreshPortfolioArea({ includeHistory: true, includeOverview: true });
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
    ],
  );

  const openRecurringModal = useCallback(
    (recurring = null) => {
      setRecurringError(null);
      setGenerateRecurringMsg(null);
      if (recurring) {
        const rawAmount =
          recurring.amount == null || recurring.amount === ""
            ? ""
            : String(recurring.amount);
        setEditingRecurringId(recurring.id);
        setRecurringForm(
          buildRecurringForm({
            description: recurring.description || "",
            amount:
              decimalSeparator === ","
                ? rawAmount.replace(".", ",")
                : rawAmount.replace(",", "."),
            category: recurring.category ? String(recurring.category) : "",
            linked_asset: recurring.linked_asset
              ? String(recurring.linked_asset)
              : "",
            frequency: recurring.frequency || "MONTHLY",
            day_of_month: String(recurring.day_of_month || 1),
            month_of_year: recurring.month_of_year
              ? String(recurring.month_of_year)
              : "",
            start_date: recurring.start_date || today(),
            end_date: recurring.end_date || "",
            is_active:
              recurring.status != null
                ? recurring.status === "ACTIVE"
                : recurring.is_active !== false,
            status:
              recurring.status ||
              (recurring.is_active === false ? "DISABLED" : "ACTIVE"),
          }),
        );
      } else {
        setEditingRecurringId(null);
        setRecurringForm(buildRecurringForm());
      }
      setShowRecurringModal(true);
    },
    [buildRecurringForm, decimalSeparator],
  );

  const closeRecurringModal = useCallback(() => {
    setShowRecurringModal(false);
    setEditingRecurringId(null);
    setRecurringError(null);
    setRecurringForm(buildRecurringForm());
  }, [buildRecurringForm]);

  const refreshRecurringMutation = useCallback(() => {
    fetchRecurringExpenses();
    refreshAfter(REFRESH_REASONS.RECURRING_GENERATED);
  }, [fetchRecurringExpenses, refreshAfter]);

  const submitRecurring = useCallback(async () => {
    if (guardDemo()) return false;
    const missing = [];
    if (!recurringForm.description.trim())
      missing.push(T("required_description"));
    if (!recurringForm.amount) missing.push(T("required_amount"));
    if (!recurringForm.start_date) missing.push(T("recurring_start_date"));
    if (missing.length) {
      setRecurringError(`${T("error_required_fields")} ${missing.join(", ")}`);
      return false;
    }

    const parsedAmount = parseAmount(recurringForm.amount, decimalSeparator);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setRecurringError(T("error_invalid_amount"));
      return false;
    }

    const dayNum = parseInt(recurringForm.day_of_month, 10);
    if (!Number.isFinite(dayNum) || dayNum < 1 || dayNum > 31) {
      setRecurringError(T("recurring_day_error"));
      return false;
    }
    if (recurringForm.frequency === "YEARLY") {
      const monthNum = parseInt(recurringForm.month_of_year, 10);
      if (!Number.isFinite(monthNum) || monthNum < 1 || monthNum > 12) {
        setRecurringError(T("recurring_month_error"));
        return false;
      }
    }

    const bodyPayload = {
      description: recurringForm.description.trim(),
      // CRIT-04: send the canonical decimal string (parseAmount above already
      // validated finiteness/sign) so the value never round-trips through Number.
      amount: parseMoneyToString(recurringForm.amount, decimalSeparator),
      category: recurringForm.category
        ? parseInt(recurringForm.category)
        : null,
      linked_asset: recurringForm.linked_asset
        ? parseInt(recurringForm.linked_asset)
        : null,
      frequency: recurringForm.frequency || "MONTHLY",
      day_of_month: dayNum,
      month_of_year:
        recurringForm.frequency === "YEARLY" && recurringForm.month_of_year
          ? parseInt(recurringForm.month_of_year, 10)
          : null,
      is_active: recurringForm.is_active,
      status: recurringForm.is_active ? "ACTIVE" : "DISABLED",
      start_date: recurringForm.start_date,
      end_date: recurringForm.end_date || null,
    };

    setRecurringSaving(true);
    setRecurringError(null);
    try {
      const url = editingRecurringId
        ? `${API}/expenses/recurring/${editingRecurringId}/`
        : `${API}/expenses/recurring/`;
      const res = await apiFetch(url, {
        method: editingRecurringId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyPayload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setRecurringError(
          Object.values(err).flat().join(" ") || T("error_save_failed"),
        );
        return false;
      }
      closeRecurringModal();
      refreshRecurringMutation();
      return true;
    } catch {
      setRecurringError(T("error_network"));
      return false;
    } finally {
      setRecurringSaving(false);
    }
  }, [
    apiFetch,
    closeRecurringModal,
    decimalSeparator,
    editingRecurringId,
    guardDemo,
    recurringForm,
    refreshRecurringMutation,
    T,
  ]);

  const toggleRecurringStatus = useCallback(
    async (recurring) => {
      if (guardDemo()) return false;
      if (!recurring?.id) return false;
      const action = recurring.status === "ACTIVE" ? "disable" : "enable";
      setRecurringSaving(true);
      setRecurringError(null);
      try {
        const res = await apiFetch(
          `${API}/expenses/recurring/${recurring.id}/${action}/`,
          { method: "POST" },
        );
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          setRecurringError(err.error || T("error_save_failed"));
          return false;
        }
        refreshRecurringMutation();
        return true;
      } catch {
        setRecurringError(T("error_network"));
        return false;
      } finally {
        setRecurringSaving(false);
      }
    },
    [apiFetch, guardDemo, refreshRecurringMutation, T],
  );

  const deleteRecurring = useCallback(
    async (recurring) => {
      if (guardDemo()) return false;
      if (!recurring?.id) return false;
      setRecurringSaving(true);
      setRecurringError(null);
      try {
        const res = await apiFetch(
          `${API}/expenses/recurring/${recurring.id}/`,
          { method: "DELETE" },
        );
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          setRecurringError(err.error || T("error_save_failed"));
          return false;
        }
        refreshRecurringMutation();
        return true;
      } catch {
        setRecurringError(T("error_network"));
        return false;
      } finally {
        setRecurringSaving(false);
      }
    },
    [apiFetch, guardDemo, refreshRecurringMutation, T],
  );

  const generateRecurringForMonth = useCallback(
    async ({ month = currentMonth, year = currentYear } = {}) => {
      if (guardDemo()) return null;
      setRecurringSaving(true);
      setRecurringError(null);
      try {
        const res = await apiFetch(`${API}/expenses/recurring/generate/`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ month, year }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          setRecurringError(err.error || T("error_save_failed"));
          return null;
        }
        const data = await res.json();
        setGenerateRecurringMsg(data);
        refreshRecurringMutation();
        return data;
      } catch {
        setRecurringError(T("error_network"));
        return null;
      } finally {
        setRecurringSaving(false);
      }
    },
    [apiFetch, guardDemo, refreshRecurringMutation, T],
  );

  const openPacModal = useCallback(
    (plan = null) => {
      setPacError(null);
      setGeneratePacMsg(null);
      if (plan) {
        const rawAmount =
          plan.amount == null || plan.amount === "" ? "" : String(plan.amount);
        setEditingPacId(plan.id);
        setPacForm(
          buildPacForm({
            name: plan.name || "",
            asset: plan.asset ? String(plan.asset) : "",
            source_account: plan.source_account
              ? String(plan.source_account)
              : "",
            amount:
              decimalSeparator === ","
                ? rawAmount.replace(".", ",")
                : rawAmount.replace(",", "."),
            frequency: plan.frequency || "MONTHLY",
            day_of_week: plan.day_of_week ? String(plan.day_of_week) : "1",
            day_of_month: String(plan.day_of_month || 1),
            anchor_month: plan.anchor_month ? String(plan.anchor_month) : "",
            generated_transactions_verified:
              plan.generated_transactions_verified === true,
            start_date: plan.start_date || today(),
            end_date: plan.end_date || "",
            is_active:
              plan.status != null
                ? plan.status === "ACTIVE"
                : plan.is_active !== false,
            status:
              plan.status || (plan.is_active === false ? "DISABLED" : "ACTIVE"),
          }),
        );
      } else {
        setEditingPacId(null);
        setPacForm(buildPacForm());
      }
      setShowPacModal(true);
    },
    [buildPacForm, decimalSeparator],
  );

  const closePacModal = useCallback(() => {
    setShowPacModal(false);
    setEditingPacId(null);
    setPacError(null);
    setPacForm(buildPacForm());
  }, [buildPacForm]);

  const refreshPacMutation = useCallback(() => {
    fetchRecurringInvestmentPlans();
    refreshAfter(REFRESH_REASONS.TRANSACTION_CREATED);
  }, [fetchRecurringInvestmentPlans, refreshAfter]);

  const submitPac = useCallback(async () => {
    if (guardDemo()) return false;
    const missing = [];
    if (!pacForm.name.trim()) missing.push(T("label_name"));
    if (!pacForm.asset) missing.push(T("label_asset"));
    if (!pacForm.source_account) missing.push(T("pac_source_account"));
    if (!pacForm.amount) missing.push(T("required_amount"));
    if (!pacForm.start_date) missing.push(T("recurring_start_date"));
    if (missing.length) {
      setPacError(`${T("error_required_fields")} ${missing.join(", ")}`);
      return false;
    }
    const parsedAmount = parseAmount(pacForm.amount, decimalSeparator);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setPacError(T("error_invalid_amount"));
      return false;
    }
    const dayNum = parseInt(pacForm.day_of_month, 10);
    if (!Number.isFinite(dayNum) || dayNum < 1 || dayNum > 31) {
      setPacError(T("recurring_day_error"));
      return false;
    }
    const dayOfWeek = parseInt(pacForm.day_of_week, 10);
    if (
      pacForm.frequency === "WEEKLY" &&
      (!Number.isFinite(dayOfWeek) || dayOfWeek < 1 || dayOfWeek > 7)
    ) {
      setPacError(T("pac_weekday_error"));
      return false;
    }
    const anchorMonth = parseInt(pacForm.anchor_month, 10);
    const needsAnchor = ["QUARTERLY", "SEMIANNUAL", "ANNUAL"].includes(
      pacForm.frequency,
    );
    if (
      needsAnchor &&
      (!Number.isFinite(anchorMonth) || anchorMonth < 1 || anchorMonth > 12)
    ) {
      setPacError(T("recurring_month_error"));
      return false;
    }

    const bodyPayload = {
      name: pacForm.name.trim(),
      asset: parseInt(pacForm.asset, 10),
      source_account: parseInt(pacForm.source_account, 10),
      amount: parseMoneyToString(pacForm.amount, decimalSeparator),
      frequency: pacForm.frequency || "MONTHLY",
      day_of_week: pacForm.frequency === "WEEKLY" ? dayOfWeek : null,
      day_of_month: dayNum,
      anchor_month: needsAnchor ? anchorMonth : null,
      generated_transactions_verified:
        pacForm.generated_transactions_verified === true,
      is_active: pacForm.is_active,
      status: pacForm.is_active ? "ACTIVE" : "DISABLED",
      start_date: pacForm.start_date,
      end_date: pacForm.end_date || null,
    };

    setPacSaving(true);
    setPacError(null);
    try {
      const url = editingPacId
        ? `${API}/portfolio/recurring-investments/${editingPacId}/`
        : `${API}/portfolio/recurring-investments/`;
      const res = await apiFetch(url, {
        method: editingPacId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyPayload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setPacError(
          Object.values(err).flat().join(" ") || T("error_save_failed"),
        );
        return false;
      }
      closePacModal();
      refreshPacMutation();
      return true;
    } catch {
      setPacError(T("error_network"));
      return false;
    } finally {
      setPacSaving(false);
    }
  }, [
    apiFetch,
    closePacModal,
    decimalSeparator,
    editingPacId,
    guardDemo,
    pacForm,
    refreshPacMutation,
    T,
  ]);

  const togglePacStatus = useCallback(
    async (plan) => {
      if (guardDemo()) return false;
      if (!plan?.id) return false;
      const action = plan.status === "ACTIVE" ? "disable" : "enable";
      setPacSaving(true);
      setPacError(null);
      try {
        const res = await apiFetch(
          `${API}/portfolio/recurring-investments/${plan.id}/${action}/`,
          { method: "POST" },
        );
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          setPacError(err.error || T("error_save_failed"));
          return false;
        }
        refreshPacMutation();
        return true;
      } catch {
        setPacError(T("error_network"));
        return false;
      } finally {
        setPacSaving(false);
      }
    },
    [apiFetch, guardDemo, refreshPacMutation, T],
  );

  const deletePac = useCallback(
    async (plan) => {
      if (guardDemo()) return false;
      if (!plan?.id) return false;
      setPacSaving(true);
      setPacError(null);
      try {
        const res = await apiFetch(
          `${API}/portfolio/recurring-investments/${plan.id}/`,
          { method: "DELETE" },
        );
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          setPacError(err.error || T("error_save_failed"));
          return false;
        }
        refreshPacMutation();
        return true;
      } catch {
        setPacError(T("error_network"));
        return false;
      } finally {
        setPacSaving(false);
      }
    },
    [apiFetch, guardDemo, refreshPacMutation, T],
  );

  const generatePacForMonth = useCallback(
    async ({ month = currentMonth, year = currentYear } = {}) => {
      if (guardDemo()) return null;
      setPacSaving(true);
      setPacError(null);
      try {
        const res = await apiFetch(
          `${API}/portfolio/recurring-investments/generate/`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ month, year }),
          },
        );
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          setPacError(err.error || T("error_save_failed"));
          return null;
        }
        const data = await res.json();
        setGeneratePacMsg(data);
        refreshPacMutation();
        return data;
      } catch {
        setPacError(T("error_network"));
        return null;
      } finally {
        setPacSaving(false);
      }
    },
    [apiFetch, guardDemo, refreshPacMutation, T],
  );

  // ── Transaction panel ──

  const openTxPanel = useCallback(
    async (asset) => {
      setTxPanel(asset);
      setTxAddMode(false);
      setEditingTxId(null);
      setTxDeleteConfirm(null);
      setTxError(null);
      setTxForm(
        buildTxForm({
          linked_account_id: asset.source_account
            ? String(asset.source_account)
            : "",
        }),
      );
      setTxWarning(null);
      try {
        setTxLoading(true);
        const res = await apiFetch(
          `${API}/portfolio/${asset.id}/transactions/`,
        );
        if (!res.ok) return;
        setAssetTransactions(await res.json());
      } catch {
        setAssetTransactions([]);
      } finally {
        setTxLoading(false);
      }
    },
    [apiFetch],
  );

  const closeTxPanel = useCallback(() => {
    setTxPanel(null);
    setAssetTransactions([]);
    setTxAddMode(false);
    setTxDeleteConfirm(null);
    setTxError(null);
    setTxWarning(null);
  }, []);

  const submitTxAdd = useCallback(async () => {
    if (guardDemo()) return;
    if (!txPanel) return;
    if (!txForm.shares || !txForm.price_per_share || !txForm.date) {
      setTxError(T("tx_error_fields"));
      return;
    }
    try {
      setTxLoading(true);
      setTxError(null);
      setTxWarning(null);
      const url = editingTxId
        ? `${API}/portfolio/${txPanel.id}/transactions/${editingTxId}/`
        : `${API}/portfolio/${txPanel.id}/transactions/`;

      // Build body — map linked account to source/destination account.
      const body = { ...txForm };
      const parsedShares = parseFlexibleDecimal(txForm.shares);
      const parsedPrice = parseFlexibleDecimal(txForm.price_per_share);
      const parsedFee = txForm.fee ? parseFlexibleDecimal(txForm.fee) : 0;
      const parsedTaxAmount = txForm.tax_amount
        ? parseFlexibleDecimal(txForm.tax_amount)
        : 0;
      if (
        Number.isNaN(parsedShares) ||
        Number.isNaN(parsedPrice) ||
        Number.isNaN(parsedFee) ||
        Number.isNaN(parsedTaxAmount) ||
        parsedShares <= 0 ||
        parsedPrice <= 0 ||
        parsedFee < 0 ||
        parsedTaxAmount < 0
      ) {
        setTxError(T("error_invalid_amount"));
        return;
      }
      // CRIT-04: stringify from the raw input (sep=null heuristic, as
      // parseFlexibleDecimal) instead of String(Number) — preserves precision.
      body.shares = parseMoneyToString(txForm.shares, null);
      body.price_per_share = parseMoneyToString(txForm.price_per_share, null);
      body.fee = txForm.fee ? parseMoneyToString(txForm.fee, null) : "0";
      body.tax_amount =
        txForm.transaction_type === "sell" && txForm.tax_amount
          ? parseMoneyToString(txForm.tax_amount, null)
          : "0";
      body.tax_amount_is_manual =
        txForm.transaction_type === "sell" && !!txForm.tax_amount;
      if (body.transaction_type !== "buy" || txForm.linked_account_id) {
        body.contribution_source = null;
      } else if (body.contribution_source) {
        body.contribution_source = parseInt(body.contribution_source, 10);
      } else {
        body.contribution_source = null;
      }
      if (txForm.transaction_type === "buy") {
        if (editingTxId || txForm.linked_account_id) {
          body.source_account_id = txForm.linked_account_id || "";
        }
      } else if (editingTxId || txForm.linked_account_id) {
        body.dest_account_id = txForm.linked_account_id || "";
      }
      delete body.linked_account_id;

      const res = await apiFetch(url, {
        method: editingTxId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setTxError(
          Object.values(err).flat().join(" ") || T("error_save_failed"),
        );
        return;
      }
      const savedTx = await res.json();
      if (savedTx.warning) setTxWarning(T("balance_warning"));
      if (editingTxId) {
        setAssetTransactions((prev) =>
          prev.map((t) => (t.id === editingTxId ? savedTx : t)),
        );
      } else {
        setAssetTransactions((prev) => [savedTx, ...prev]);
      }
      setTxAddMode(false);
      setEditingTxId(null);
      setTxForm(buildTxForm());
      refreshAfter(
        editingTxId
          ? REFRESH_REASONS.TRANSACTION_UPDATED
          : REFRESH_REASONS.TRANSACTION_CREATED,
      );
    } catch {
      setTxError(T("error_network"));
    } finally {
      setTxLoading(false);
    }
  }, [
    apiFetch,
    txPanel,
    txForm,
    editingTxId,
    refreshAfter,
    buildTxForm,
    parseFlexibleDecimal,
    T,
  ]);

  const submitAddTxFromModal = useCallback(
    async (assetId, form, editingTxId = null, options = {}) => {
      if (guardDemo()) return { ok: false };
      if (!assetId) {
        return { ok: false, errorKey: "tx_error_fields" };
      }
      if (!form.shares || !form.price_per_share || !form.date) {
        return { ok: false, errorKey: "tx_error_fields" };
      }
      try {
        const body = { ...form };
        const parsedShares = parseFlexibleDecimal(form.shares);
        const parsedPrice = parseFlexibleDecimal(form.price_per_share);
        const parsedFee = form.fee ? parseFlexibleDecimal(form.fee) : 0;
        const parsedTaxAmount = form.tax_amount
          ? parseFlexibleDecimal(form.tax_amount)
          : 0;
        if (
          Number.isNaN(parsedShares) ||
          Number.isNaN(parsedPrice) ||
          Number.isNaN(parsedFee) ||
          Number.isNaN(parsedTaxAmount) ||
          parsedShares <= 0 ||
          parsedPrice <= 0 ||
          parsedFee < 0 ||
          parsedTaxAmount < 0
        ) {
          return { ok: false, errorKey: "error_invalid_amount" };
        }
        // CRIT-04: preserve precision by stringifying the raw input.
        body.shares = parseMoneyToString(form.shares, null);
        body.price_per_share = parseMoneyToString(form.price_per_share, null);
        body.fee = form.fee ? parseMoneyToString(form.fee, null) : "0";
        body.tax_amount =
          form.transaction_type === "sell" && form.tax_amount
            ? parseMoneyToString(form.tax_amount, null)
            : "0";
        // is_manual is driven by whether the user hand-edited the tax field
        // (options.taxIsManual); fall back to "non-empty = manual" for callers
        // that don't track touch state. An auto (non-manual) value is treated as
        // a snapshot the backend recomputes from the current rate.
        body.tax_amount_is_manual =
          options.taxIsManual != null
            ? !!options.taxIsManual
            : form.transaction_type === "sell" && !!form.tax_amount;
        if (body.transaction_type !== "buy" || form.linked_account_id) {
          body.contribution_source = null;
        } else if (body.contribution_source) {
          body.contribution_source = parseInt(body.contribution_source, 10);
        } else {
          body.contribution_source = null;
        }
        if (form.transaction_type === "buy") {
          if (editingTxId || form.linked_account_id) {
            body.source_account_id = form.linked_account_id || "";
          }
        } else if (editingTxId || form.linked_account_id) {
          body.dest_account_id = form.linked_account_id || "";
        }
        delete body.linked_account_id;
        const url = editingTxId
          ? `${API}/portfolio/${assetId}/transactions/${editingTxId}/`
          : `${API}/portfolio/${assetId}/transactions/`;
        const res = await apiFetch(url, {
          method: editingTxId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          return {
            ok: false,
            error:
              Object.values(err).flat().join(" ") || T("error_save_failed"),
          };
        }
        refreshAfter(
          editingTxId
            ? REFRESH_REASONS.TRANSACTION_UPDATED
            : REFRESH_REASONS.TRANSACTION_CREATED,
        );
        return { ok: true };
      } catch {
        return { ok: false, errorKey: "error_network" };
      }
    },
    [apiFetch, refreshAfter, guardDemo, parseFlexibleDecimal, T],
  );

  const autofillAbortRef = useRef(null);

  const autofillTxPrice = useCallback(
    async (dateStr) => {
      if (!txPanel || !txPanel.ticker || editingTxId || !dateStr) return;
      // Abort any in-flight autofill before starting a new one so we never
      // race two responses against each other (and avoid setState after unmount).
      if (autofillAbortRef.current) autofillAbortRef.current.abort();
      const controller = new AbortController();
      autofillAbortRef.current = controller;
      try {
        setTxAutofilling(true);
        const res = await apiFetch(
          `${API}/portfolio/${txPanel.id}/historical-price/?date=${dateStr}`,
          { signal: controller.signal },
        );
        if (controller.signal.aborted || !res.ok) return;
        const data = await res.json();
        if (controller.signal.aborted) return;
        if (data?.close)
          setTxForm((p) => ({
            ...p,
            price_per_share: String(data.close),
          }));
      } catch (e) {
        if (e?.name === "AbortError") return;
      } finally {
        if (autofillAbortRef.current === controller) {
          autofillAbortRef.current = null;
        }
        if (!controller.signal.aborted) setTxAutofilling(false);
      }
    },
    [apiFetch, txPanel, editingTxId],
  );

  useEffect(() => {
    if (
      txAddMode &&
      !editingTxId &&
      txPanel?.ticker &&
      !txForm.price_per_share &&
      txForm.date
    ) {
      autofillTxPrice(txForm.date);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [txAddMode, editingTxId]);

  // Abort any in-flight autofill on unmount (or when the tx panel goes away).
  useEffect(() => {
    return () => {
      if (autofillAbortRef.current) {
        autofillAbortRef.current.abort();
        autofillAbortRef.current = null;
      }
    };
  }, []);

  const openEditTx = useCallback(
    (tx) => {
      setEditingTxId(tx.id);
      setTxForm(
        buildTxForm({
          transaction_type: tx.transaction_type || "buy",
          date: tx.date || today(),
          shares: String(tx.shares ?? ""),
          price_per_share: String(tx.price_per_share ?? ""),
          fee: String(tx.fee ?? ""),
          tax_amount: tx.tax_amount_is_manual
            ? String(tx.tax_amount ?? "")
            : "",
          notes: tx.notes || "",
          linked_account_id: tx.linked_account_id
            ? String(tx.linked_account_id)
            : "",
          contribution_source: tx.contribution_source
            ? String(tx.contribution_source)
            : "",
        }),
      );
      setTxAddMode(true);
      setTxError(null);
    },
    [buildTxForm],
  );

  const deleteTx = useCallback(
    async (txId, assetId) => {
      if (!assetId) {
        logError("deleteTx: missing assetId");
        return;
      }
      try {
        await apiFetch(`${API}/portfolio/${assetId}/transactions/${txId}/`, {
          method: "DELETE",
        });
        setTxDeleteConfirm(null);
        refreshAfter(REFRESH_REASONS.TRANSACTION_DELETED);
      } catch {
        setTxError(T("error_network"));
      }
    },
    [apiFetch, refreshAfter],
  );

  // ── Effects ──

  useEffect(() => {
    if (!isAuthenticated) {
      setAppLoading(false);
      setBootstrapReady(false);
      return;
    }
    let cancelled = false;
    setAppLoading(true);
    setBootstrapReady(false);
    setFetchError(null);
    cacheContextRef.current = `${user || "anon"}::${viewAs ? viewAs.userId : "self"}`;
    Promise.allSettled([
      fetchProfile(),
      fetchCategories(),
      fetchAssets(),
      fetchPortfolioSummary(),
      fetchContributionSources(),
    ])
      .then((results) => {
        if (cancelled) return;
        const failed = results.filter((r) => r.status === "rejected");
        if (failed.length === results.length) {
          setFetchError(T("error_network"));
        }
      })
      .finally(() => {
        if (cancelled) return;
        setAppLoading(false);
        setBootstrapReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isAuthenticated || !bootstrapReady) return;
    Promise.allSettled([
      fetchInvestmentTypes(),
      fetchContributionSources(),
      fetchAllocationData(),
      fetchBudgets(),
      fetchRecurringExpenses(),
      fetchRecurringInvestmentPlans(),
      fetchTrends(),
      fetchExpSummaryCurrentMonth(),
    ]);
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
  }, [isAuthenticated, bootstrapReady]); // eslint-disable-line react-hooks/exhaustive-deps

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
  ]);

  // ── Ticker autocomplete ──

  useEffect(
    () => () => {
      if (tickerDebounceRef.current) clearTimeout(tickerDebounceRef.current);
    },
    [],
  );

  const searchTickerCandidates = (val, origin, fallbackName = "") => {
    setTickerSearchOrigin(origin);
    setShowTickerDrop(true);
    if (tickerDebounceRef.current) clearTimeout(tickerDebounceRef.current);
    if (!val || val.length < 1) {
      setTickerResults([]);
      setShowTickerDrop(false);
      return;
    }
    tickerDebounceRef.current = setTimeout(async () => {
      setTickerLoading(true);
      try {
        const fallback = fallbackName
          ? `&name=${encodeURIComponent(fallbackName)}`
          : "";
        const res = await apiFetch(
          `${API}/portfolio/search-ticker/?q=${encodeURIComponent(val)}${fallback}`,
        );
        const data = await res.json();
        setTickerResults(Array.isArray(data) ? data : []);
        setShowTickerDrop(true);
      } catch {
        setTickerResults([]);
      } finally {
        setTickerLoading(false);
      }
    }, 350);
  };

  const handleTickerInput = (val) => {
    const borsa = normalizeBorsaFundInput(val);
    const symbol = borsa?.symbol || val;
    setTickerQuery(val);
    setAssetForm((prev) => {
      const selectedSource = prev.price_source || "AUTO";
      const shouldKeepBorsaUrl =
        borsa &&
        (selectedSource === "AUTO" || selectedSource === "BORSA_ITALIANA");
      return {
        ...prev,
        ticker: symbol,
        price_source: selectedSource,
        source_symbol: symbol,
        source_url: shouldKeepBorsaUrl ? borsa.url : "",
      };
    });
    searchTickerCandidates(val, "ticker");
  };

  const handleIsinInput = (val) => {
    const isin = String(val || "").toUpperCase();
    setAssetForm((prev) => ({ ...prev, isin }));
    searchTickerCandidates(isin, "isin", assetForm.name);
  };

  const selectTicker = (result) => {
    const item =
      typeof result === "string" ? { symbol: result, source: "YAHOO" } : result;
    const symbol = item.symbol || "";
    const source = item.source || "YAHOO";
    setAssetForm((prev) => ({
      ...prev,
      ticker: symbol,
      price_source: source,
      source_symbol: symbol,
      source_url: item.url || "",
    }));
    setTickerQuery(symbol);
    setShowTickerDrop(false);
    setTickerResults([]);
    setTickerSearchOrigin("ticker");
  };

  const handlePriceSourceChange = (source) => {
    setAssetForm((prev) => {
      const borsa = normalizeBorsaFundInput(prev.source_symbol || prev.ticker);
      const symbol = borsa?.symbol || prev.source_symbol || prev.ticker || "";
      return {
        ...prev,
        price_source: source,
        ticker: symbol,
        source_symbol: symbol,
        source_url:
          borsa && (source === "AUTO" || source === "BORSA_ITALIANA")
            ? borsa.url
            : "",
      };
    });
  };

  // ── CSV ──

  const _normalizeCsvHeader = (value) =>
    String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ");

  const _findCsvHeader = (headers, aliases) =>
    headers.find((header) => aliases.includes(_normalizeCsvHeader(header))) ||
    "";

  const _inferCashflowCsvMap = (headers) => ({
    type: _findCsvHeader(headers, ["type", "tipo"]),
    date: _findCsvHeader(headers, ["date", "data"]),
    description: _findCsvHeader(headers, [
      "description",
      "descrizione",
      "notes",
      "note",
    ]),
    amount: _findCsvHeader(headers, ["amount", "importo", "value", "valore"]),
    category_name: _findCsvHeader(headers, ["category", "categoria"]),
    linked_asset_name: _findCsvHeader(headers, [
      "link to account",
      "linked account",
      "account",
      "conto",
      "collega a conto",
    ]),
    is_verified: _findCsvHeader(headers, ["status", "stato", "verified"]),
  });

  const _applyInferredCsvMap = (parsed) => {
    if (!parsed || csvImportType !== "cashflow") return;
    const inferred = _inferCashflowCsvMap(parsed.headers || []);
    setCsvMap((prev) => ({ ...prev, ...inferred }));
  };

  const handleCSVUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setCsvImportResult({
        imported: 0,
        skipped: 0,
        errors: [T("error_csv_too_large")],
      });
      e.target.value = "";
      return;
    }
    setCsvFile(file);
    setCsvImportResult(null);
    setCsvImportPreview(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const parsed = parseCSV(ev.target.result, csvSep);
      setCsvParsed(parsed);
      _applyInferredCsvMap(parsed);
    };
    reader.readAsText(file, "UTF-8");
  };

  const handleCsvSepChange = (sep) => {
    setCsvSep(sep);
    setCsvImportPreview(null);
    if (csvFile) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const parsed = parseCSV(ev.target.result, sep);
        setCsvParsed(parsed);
        _applyInferredCsvMap(parsed);
      };
      reader.readAsText(csvFile, "UTF-8");
    }
  };

  const _colValue = (row, header) => {
    if (!csvParsed || !header) return "";
    const idx = csvParsed.headers.indexOf(header);
    return idx >= 0 ? row[idx] || "" : "";
  };

  const _normalizeCsvImportErrors = (errors) => {
    if (!Array.isArray(errors)) return [];
    return errors
      .map((err) => {
        if (typeof err === "string") return err;
        if (!err || typeof err !== "object") return String(err || "");
        const row = Number.isInteger(err.row) ? err.row : null;
        const message = String(err.error || err.message || "").trim();
        if (!message)
          return row
            ? `${T("csv_row_label")} ${row}: ${T("csv_import_error")}`
            : T("csv_import_error");
        return row ? `${T("csv_row_label")} ${row}: ${message}` : message;
      })
      .filter(Boolean);
  };

  const _buildImportPayload = () => {
    if (!csvParsed) return null;

    if (csvImportType === "cashflow") {
      if (!csvMap.date || !csvMap.amount) return null;
      const rows = buildCashflowImportRows({
        csvParsed,
        csvMap,
        csvSignConv,
        categories,
        bankAccounts,
      });
      return { endpoint: `${API}/expenses/import-csv/`, rows };
    }

    if (csvImportType === "assets") {
      if (
        !csvMap.transaction_type ||
        !csvMap.date ||
        !csvMap.shares ||
        !csvMap.price_per_share
      )
        return null;
      if (!csvMap.isin && !csvMap.name) return null;
      const rows = csvParsed.rows.map((r) => ({
        name: _colValue(r, csvMap.name),
        isin: _colValue(r, csvMap.isin),
        transaction_type: _colValue(r, csvMap.transaction_type),
        date: _colValue(r, csvMap.date),
        shares: _colValue(r, csvMap.shares),
        price_per_share: _colValue(r, csvMap.price_per_share),
        source_account_id: _colValue(r, csvMap.source_account_id),
        contribution_source: _colValue(r, csvMap.contribution_source),
        is_verified: csvMap.is_verified ? _colValue(r, csvMap.is_verified) : "",
        notes: _colValue(r, csvMap.notes),
      }));
      return { endpoint: `${API}/portfolio/import-assets/`, rows };
    }

    return null;
  };

  const doImportCSV = async () => {
    let includeDuplicateRows = [];
    if (
      csvImportType === "assets" &&
      csvImportPreview &&
      Array.isArray(csvImportPreview.duplicate_rows)
    ) {
      includeDuplicateRows = csvImportPreview.duplicate_rows
        .filter((r) => r && r.include === true)
        .map((r) => r.row);
    }
    const payload = _buildImportPayload();
    if (!payload) return;
    setCsvImporting(true);
    try {
      const res = await apiFetch(payload.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        timeoutMs: LONG_FETCH_TIMEOUT_MS,
        body: JSON.stringify({
          rows: payload.rows,
          include_duplicate_rows: includeDuplicateRows,
        }),
      });
      const data = await res.json();
      const warnings = Array.isArray(data?.warnings) ? data.warnings : [];
      if (
        csvImportType === "cashflow" &&
        data?.imported === 0 &&
        data?.skipped === 0 &&
        payload.rows.length > 0 &&
        warnings.length === 0 &&
        !data?.errors?.length
      ) {
        warnings.push(T("import_no_rows_diagnostic"));
      }
      setCsvImportResult({
        ...data,
        errors: _normalizeCsvImportErrors(data?.errors),
        warnings,
      });
      if (data.imported > 0) {
        if (csvImportType === "cashflow") {
          refreshAfter(REFRESH_REASONS.CSV_IMPORTED);
        } else {
          refreshAfter(REFRESH_REASONS.ASSET_CREATED);
        }
      }
    } catch {
      setCsvImportResult({
        imported: 0,
        skipped: 0,
        errors: [T("error_network")],
      });
    } finally {
      setCsvImporting(false);
    }
  };

  const previewImportCSV = async () => {
    const payload = _buildImportPayload();
    if (!payload || csvImportType !== "assets") return null;
    setCsvImporting(true);
    try {
      const res = await apiFetch(payload.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        timeoutMs: LONG_FETCH_TIMEOUT_MS,
        body: JSON.stringify({ rows: payload.rows, preview_only: true }),
      });
      const data = await res.json();
      const normalized = {
        ...data,
        duplicate_rows: (data.duplicate_rows || []).map((r) => ({
          ...r,
          include: false,
        })),
      };
      setCsvImportPreview(normalized);
      return normalized;
    } catch {
      setCsvImportPreview(null);
      return null;
    } finally {
      setCsvImporting(false);
    }
  };

  // ── Expense actions ──

  const openExpenseModal = (expense = null) => {
    setExpError(null);
    if (expense) {
      const prefillAmount = (() => {
        if (expense.amount == null || expense.amount === "") return "";
        const raw = String(expense.amount);
        return decimalSeparator === ","
          ? raw.replace(".", ",")
          : raw.replace(",", ".");
      })();
      setEditingExpenseId(expense.id);
      const cat = categories.find((c) => c.id === expense.category);
      setModalDir(cat?.category_type === "income" ? "income" : "expense");
      setExpForm(
        buildExpenseForm({
          description: expense.description || "",
          amount: prefillAmount,
          category: expense.category ? String(expense.category) : "",
          date: expense.date || today(),
          linked_asset: expense.linked_asset
            ? String(expense.linked_asset)
            : "",
          is_verified: expense.is_verified ?? false,
        }),
      );
    } else {
      setEditingExpenseId(null);
      setModalDir(cashflowDir);
      setExpForm(
        buildExpenseForm({
          is_verified: transactionPrefs.cashflow_default_verified,
        }),
      );
    }
    setShowExpModal(true);
  };

  const closeExpenseModal = () => {
    setShowExpModal(false);
    setEditingExpenseId(null);
    setExpError(null);
    setExpForm(buildExpenseForm());
    setTransferForm(buildTransferForm());
    setTransferWarning(null);
    setTransferError(null);
  };

  const submitExpense = async () => {
    if (guardDemo()) return;
    const missing = [];
    if (!expForm.description) missing.push(T("required_description"));
    if (!expForm.amount) missing.push(T("required_amount"));
    if (!expForm.category) missing.push(T("required_category"));
    if (missing.length) {
      setExpError(`${T("error_required_fields")} ${missing.join(", ")}`);
      return;
    }
    const parsedExpAmount = parseAmount(expForm.amount, decimalSeparator);
    if (isNaN(parsedExpAmount) || parsedExpAmount <= 0) {
      setExpError(null);
      return;
    }
    setExpError(null);
    const url = editingExpenseId
      ? `${API}/expenses/${editingExpenseId}/`
      : `${API}/expenses/`;
    const body = {
      ...expForm,
      // CRIT-04: canonical decimal string (validated above via parseAmount).
      amount: parseMoneyToString(expForm.amount, decimalSeparator),
      category: expForm.category || null,
      linked_asset: expForm.linked_asset
        ? parseInt(expForm.linked_asset)
        : null,
      is_verified: expForm.is_verified,
    };
    const res = await apiFetch(url, {
      method: editingExpenseId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      setExpError(
        Object.values(err).flat().join(" ") || T("error_save_failed"),
      );
      return;
    }
    closeExpenseModal();
    refreshAfter(
      editingExpenseId
        ? REFRESH_REASONS.EXPENSE_UPDATED
        : REFRESH_REASONS.EXPENSE_CREATED,
    );
  };

  const deleteExpense = async (id) => {
    if (guardDemo()) return;
    await apiFetch(`${API}/expenses/${id}/`, { method: "DELETE" });
    setDeleteExpenseTarget(null);
    refreshAfter(REFRESH_REASONS.EXPENSE_DELETED);
  };

  // ── Asset actions ──

  const openAssetAdd = (preferredType) => {
    const firstType =
      preferredType !== undefined ? preferredType : investmentTypes[0];
    setEditingAssetId(null);
    editingAssetOrigOverrideRef.current = null;
    setAssetForm({
      name: "",
      ticker: "",
      price_source: "AUTO",
      source_symbol: "",
      source_url: "",
      isin: "",
      investment_type: firstType?.id || "",
      tracking_type: "AUTO",
      initial_balance: "",
      tax_rate_override: "",
      notes: "",
      source_account: "",
      contribution_source_mode: "inherit",
      contribution_source_ids: [],
    });
    setTickerQuery("");
    setTickerResults([]);
    setTickerSearchOrigin("ticker");
    setAssetError(null);
    setShowAssetModal(true);
  };

  const openAssetEdit = (a) => {
    setEditingAssetId(a.id);
    editingAssetOrigOverrideRef.current =
      a.tax_rate_override !== null && a.tax_rate_override !== undefined
        ? Number(a.tax_rate_override)
        : null;
    setAssetForm({
      name: a.name,
      ticker: a.ticker || "",
      price_source: a.price_source || "AUTO",
      source_symbol: a.source_symbol || a.ticker || "",
      source_url: a.source_url || "",
      isin: a.isin || "",
      investment_type: a.investment_type,
      tracking_type: a.tracking_type || "AUTO",
      initial_balance: "",
      tax_rate_override:
        a.tax_rate_override !== null && a.tax_rate_override !== undefined
          ? String(parseFloat(a.tax_rate_override) * 100)
          : "",
      notes: a.notes || "",
      source_account: a.source_account ? String(a.source_account) : "",
      contribution_source_mode: a.contribution_source_mode || "inherit",
      contribution_source_ids: (a.custom_contribution_source_ids || []).map(
        (id) => String(id),
      ),
    });
    setTickerQuery(a.ticker || "");
    setTickerResults([]);
    setTickerSearchOrigin("ticker");
    setAssetError(null);
    setShowAssetModal(true);
  };

  const closeAssetModal = () => {
    setShowAssetModal(false);
    setEditingAssetId(null);
    setAssetError(null);
    setTickerQuery("");
    setTickerResults([]);
    setTickerSearchOrigin("ticker");
  };

  const saveAsset = async () => {
    if (guardDemo()) return;
    if (assetSaving) return;
    if (!assetForm.name) {
      setAssetError(T("error_name_required"));
      return;
    }
    if (!assetForm.investment_type) {
      setAssetError(T("error_type_required"));
      return;
    }
    setAssetError(null);
    setAssetSaving(true);
    const selectedType = investmentTypes.find(
      (t) => t.id === parseInt(assetForm.investment_type),
    );
    const isBankAccount = !!selectedType?.is_bank_account;
    const isManual = isBankAccount || assetForm.tracking_type === "MANUAL";
    const activeContributionSourceIds = new Set(
      contributionSources
        .filter((source) => source.is_active !== false)
        .map((source) => String(source.id)),
    );
    const body = {
      name: assetForm.name,
      ticker: isManual ? "" : assetForm.ticker || "",
      price_source: isManual ? "AUTO" : assetForm.price_source || "AUTO",
      source_symbol: isManual
        ? ""
        : assetForm.source_symbol || assetForm.ticker || "",
      source_url: isManual ? "" : assetForm.source_url || "",
      isin: assetForm.isin || "",
      investment_type: parseInt(assetForm.investment_type),
      tracking_type: isManual ? "MANUAL" : "AUTO",
      notes: assetForm.notes || "",
      source_account:
        !isBankAccount && assetForm.source_account
          ? parseInt(assetForm.source_account)
          : null,
      contribution_source_mode:
        !isBankAccount && assetForm.contribution_source_mode
          ? assetForm.contribution_source_mode
          : "inherit",
      contribution_source_ids: !isBankAccount
        ? (assetForm.contribution_source_ids || [])
            .filter((id) => activeContributionSourceIds.has(String(id)))
            .map((id) => parseInt(id, 10))
        : [],
    };
    if (!isBankAccount && assetForm.tax_rate_override !== "") {
      const parsedTaxRate = parseFlexibleDecimal(assetForm.tax_rate_override);
      if (Number.isNaN(parsedTaxRate) || parsedTaxRate < 0) {
        setAssetError(T("error_invalid_amount"));
        setAssetSaving(false);
        return;
      }
      body.tax_rate_override = String(parsedTaxRate / 100);
    } else {
      body.tax_rate_override = null;
    }
    if (!editingAssetId) {
      body.currency = "EUR";
    }
    if (!editingAssetId && isManual && assetForm.initial_balance) {
      const parsedInitialBalance = parseFlexibleDecimal(
        assetForm.initial_balance,
      );
      if (Number.isNaN(parsedInitialBalance) || parsedInitialBalance < 0) {
        setAssetError(T("error_invalid_amount"));
        setAssetSaving(false);
        return;
      }
      body.initial_balance = String(parsedInitialBalance);
    }
    const doSave = async (propagation) => {
      const finalBody =
        propagation && editingAssetId
          ? { ...body, tax_propagation: propagation }
          : body;
      try {
        const res = await apiFetch(
          editingAssetId
            ? `${API}/portfolio/${editingAssetId}/`
            : `${API}/portfolio/`,
          {
            method: editingAssetId ? "PATCH" : "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(finalBody),
          },
        );
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          setAssetError(
            Object.values(err).flat().join(" ") || `Error ${res.status}`,
          );
          return false;
        }
        closeAssetModal();
        setAssetForm({
          name: "",
          ticker: "",
          price_source: "AUTO",
          source_symbol: "",
          source_url: "",
          isin: "",
          investment_type: "",
          tracking_type: "AUTO",
          initial_balance: "",
          tax_rate_override: "",
          notes: "",
          source_account: "",
          contribution_source_mode: "inherit",
          contribution_source_ids: [],
        });
        refreshAfter(
          editingAssetId
            ? REFRESH_REASONS.ASSET_UPDATED
            : REFRESH_REASONS.ASSET_CREATED,
        );
        return true;
      } catch {
        setAssetError(T("error_network"));
        return false;
      } finally {
        setAssetSaving(false);
      }
    };

    // If the asset's tax override changed on an existing asset, ask whether to
    // propagate the new rate to its already-created sells before saving.
    const newOverride =
      body.tax_rate_override != null ? Number(body.tax_rate_override) : null;
    const taxChanged =
      !!editingAssetId && newOverride !== editingAssetOrigOverrideRef.current;
    if (taxChanged) {
      setAssetSaving(false);
      setTaxPropagationFlow({
        kind: "asset",
        run: async (propagation) => {
          setAssetSaving(true);
          const ok = await doSave(propagation);
          setTaxPropagationFlow(null);
          return ok;
        },
      });
      return;
    }
    await doSave(null);
  };

  const openAdjustBalance = (a) => {
    setAdjustAssetId(a.id);
    setAdjustForm({ new_balance: String(a.current_value || "") });
    setAdjustError(null);
    setShowAdjustModal(true);
  };

  const closeAdjustModal = () => {
    setShowAdjustModal(false);
    setAdjustAssetId(null);
    setAdjustError(null);
  };

  // ── Cash Flow Feed actions (K-3) ──

  const deleteCfExpense = useCallback(
    async (id) => {
      if (guardDemo()) return;
      const res = await apiFetch(`${API}/expenses/${id}/`, {
        method: "DELETE",
      });
      if (!res.ok) return;
      setCfItems((prev) => prev.filter((item) => item.id !== `expense_${id}`));
    },
    [apiFetch],
  );

  const deleteCfTx = useCallback(
    async (item) => {
      if (guardDemo()) return;
      if (item.type === "transfer") {
        if (!item.from_account) return;
        const res = await apiFetch(
          `${API}/portfolio/${item.from_account.id}/transactions/${item.paired_id}/`,
          { method: "DELETE" },
        );
        if (!res.ok) return;
        setCfItems((prev) => prev.filter((i) => i.id !== item.id));
      } else if (item.type === "adjustment") {
        const res = await apiFetch(
          `${API}/portfolio/${item.account.id}/transactions/${item.source_id}/`,
          { method: "DELETE" },
        );
        if (!res.ok) return;
        setCfItems((prev) => prev.filter((i) => i.id !== item.id));
      }
    },
    [apiFetch],
  );

  const buildCashflowQueryParams = useCallback(
    (filters, { page, pageSize = 50 } = {}) => {
      const params = new URLSearchParams();
      params.set("page", page || 1);
      params.set("page_size", pageSize);

      if (
        filters.types &&
        filters.types.length > 0 &&
        filters.types.length < 4
      ) {
        params.set("types", filters.types.join(","));
      }
      if (filters.date_from) params.set("date_from", filters.date_from);
      if (filters.date_to) params.set("date_to", filters.date_to);

      if (
        Array.isArray(filters.category_ids) &&
        filters.category_ids.length > 0
      ) {
        const parentIds = [];
        const childIds = [];
        filters.category_ids.forEach((id) => {
          const cat = categories.find((c) => String(c.id) === String(id));
          if (cat && !cat.parent) parentIds.push(String(id));
          else childIds.push(String(id));
        });
        if (parentIds.length > 0)
          params.set("parent_category", parentIds.join(","));
        if (childIds.length > 0) params.set("category", childIds.join(","));
      }

      if (
        Array.isArray(filters.account_ids) &&
        filters.account_ids.length > 0
      ) {
        params.set("account", filters.account_ids.join(","));
      }
      if (filters.verified !== null && filters.verified !== undefined) {
        params.set("verified", filters.verified);
      }
      if (filters.search && filters.search.trim()) {
        params.set("search", filters.search.trim());
      }
      if (filters.ordering && filters.ordering !== "-date") {
        params.set("ordering", filters.ordering);
      }
      return params;
    },
    [categories],
  );

  const loadCfFeed = useCallback(
    async (page = 1, overrideFilters) => {
      const requestSeq = ++cfRequestSeqRef.current;
      // HIGH-28: abort any previous in-flight feed request so a stale response
      // can't keep the connection busy (the seq guard still protects against
      // out-of-order resolution).
      if (cfAbortRef.current) cfAbortRef.current.abort();
      const controller = new AbortController();
      cfAbortRef.current = controller;
      setCfLoading(true);
      try {
        const f = overrideFilters || cfFilters;
        const params = buildCashflowQueryParams(f, { page });
        const res = await apiFetch(`${API}/expenses/cashflow/?${params}`, {
          signal: controller.signal,
        });
        if (!res.ok) return;
        const data = await res.json();
        if (requestSeq !== cfRequestSeqRef.current) return;
        if (page === 1) {
          setCfItems(data.results);
          setCfSummary(
            data.summary || { income: "0.00", outcome: "0.00", net: "0.00" },
          );
        } else {
          setCfItems((prev) => [...prev, ...data.results]);
        }
        setCfHasMore(data.next_page !== null);
        setCfTotalCount(data.count ?? 0);
        cfPageRef.current = page;
      } catch (e) {
        if (e?.name === "AbortError") return;
        logError("loadCfFeed:", e);
      } finally {
        if (cfAbortRef.current === controller) cfAbortRef.current = null;
        // Only the request that is still current owns the loading flag — an
        // aborted older request must not flip it off under a newer one.
        if (requestSeq === cfRequestSeqRef.current) setCfLoading(false);
      }
    },
    [apiFetch, cfFilters, buildCashflowQueryParams],
  );

  const loadMoreCf = useCallback(
    () => loadCfFeed(cfPageRef.current + 1),
    [loadCfFeed],
  );

  const buildAssetTxQueryParams = useCallback(
    (filters, { page, pageSize = 50 } = {}) => {
      const params = new URLSearchParams();
      params.set("page", String(page || 1));
      params.set("page_size", String(pageSize));
      // Portfolio surface shows only investment-relevant types: buy, sell, adjustment.
      // cash_in/cash_out are cash mirror legs living in the Cash Flow feed.
      const portfolioTypes = ["buy", "sell", "adjustment"];
      const requested = Array.isArray(filters.types) ? filters.types : [];
      const effective = requested.filter((t) => portfolioTypes.includes(t));
      const send = effective.length > 0 ? effective : portfolioTypes;
      params.set("type", send.join(","));
      if (Array.isArray(filters.asset_ids) && filters.asset_ids.length > 0) {
        params.set("asset", filters.asset_ids.join(","));
      }
      if (filters.date_from) params.set("date_from", filters.date_from);
      if (filters.date_to) params.set("date_to", filters.date_to);
      if (filters.verified !== null && filters.verified !== undefined) {
        params.set("verified", filters.verified);
      }
      if (filters.search && filters.search.trim()) {
        params.set("search", filters.search.trim());
      }
      if (filters.ordering && filters.ordering !== "-date") {
        params.set("ordering", filters.ordering);
      }
      return params;
    },
    [],
  );

  const loadAssetTxFeed = useCallback(
    async (page = 1, overrideFilters) => {
      const requestSeq = ++assetTxRequestSeqRef.current;
      setAssetTxLoading(true);
      try {
        const f = overrideFilters || assetTxFilters;
        const params = buildAssetTxQueryParams(f, { page });
        const res = await apiFetch(`${API}/portfolio/transactions/?${params}`);
        if (!res.ok) return;
        const data = await res.json();
        if (requestSeq !== assetTxRequestSeqRef.current) return;
        if (page === 1) {
          setAssetTxItems(data.results);
        } else {
          setAssetTxItems((prev) => [...prev, ...data.results]);
        }
        setAssetTxHasMore(data.next_page !== null);
        setAssetTxTotalCount(data.count);
        assetTxPageRef.current = page;
      } catch (e) {
        logError("loadAssetTxFeed:", e);
      } finally {
        setAssetTxLoading(false);
      }
    },
    [apiFetch, assetTxFilters, buildAssetTxQueryParams],
  );

  const loadMoreAssetTx = useCallback(
    () => loadAssetTxFeed(assetTxPageRef.current + 1),
    [loadAssetTxFeed],
  );

  const loadAllAssetTx = useCallback(async () => {
    const requestSeq = ++assetTxRequestSeqRef.current;
    setAssetTxLoading(true);
    try {
      const results = [];
      let page = 1;
      let data;
      do {
        const params = buildAssetTxQueryParams(assetTxFilters, {
          page,
          pageSize: 200,
        });
        const res = await apiFetch(`${API}/portfolio/transactions/?${params}`);
        if (!res.ok) return;
        data = await res.json();
        results.push(...data.results);
        page = data.next_page;
      } while (page !== null);
      if (requestSeq !== assetTxRequestSeqRef.current) return;
      setAssetTxItems(results);
      setAssetTxHasMore(false);
      setAssetTxTotalCount(data.count);
    } catch (e) {
      logError("loadAllAssetTx:", e);
    } finally {
      setAssetTxLoading(false);
    }
  }, [apiFetch, assetTxFilters, buildAssetTxQueryParams]);

  const toggleAssetTxType = useCallback((type) => {
    const ALL = ["buy", "sell", "adjustment"];
    setAssetTxFilters((prev) => {
      let types;
      if (prev.types.length === ALL.length) {
        types = [type];
      } else if (prev.types.includes(type)) {
        types = prev.types.filter((t) => t !== type);
      } else {
        types = [...prev.types, type];
      }
      if (types.length === 0) types = [type];
      return { ...prev, types };
    });
  }, []);

  const clearAssetTxSelection = useCallback(() => {
    setAssetTxSelectedIds(new Set());
    setAssetTxSelectAllFiltered(false);
    setAssetTxBulkError(null);
  }, []);

  const enterAssetTxSelectionMode = useCallback(() => {
    setAssetTxSelectionMode(true);
    clearAssetTxSelection();
  }, [clearAssetTxSelection]);

  const exitAssetTxSelectionMode = useCallback(() => {
    setAssetTxSelectionMode(false);
    clearAssetTxSelection();
  }, [clearAssetTxSelection]);

  const toggleAssetTxItemSelected = useCallback((id) => {
    setAssetTxSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectVisibleAssetTx = useCallback(() => {
    setAssetTxSelectAllFiltered(false);
    setAssetTxSelectedIds(
      new Set(
        (assetTxItems || [])
          .filter((item) => !item.asset?.is_archived)
          .map((item) => item.id),
      ),
    );
  }, [assetTxItems]);

  const selectAllFilteredAssetTx = useCallback(() => {
    setAssetTxSelectAllFiltered(true);
    setAssetTxSelectedIds(new Set());
  }, []);

  const isAssetTxItemSelected = useCallback(
    (id) => {
      if (assetTxSelectAllFiltered) return !assetTxSelectedIds.has(id);
      return assetTxSelectedIds.has(id);
    },
    [assetTxSelectAllFiltered, assetTxSelectedIds],
  );

  const assetTxSelectedCount = useMemo(() => {
    if (assetTxSelectAllFiltered) {
      return Math.max(0, (assetTxTotalCount || 0) - assetTxSelectedIds.size);
    }
    return assetTxSelectedIds.size;
  }, [assetTxSelectAllFiltered, assetTxSelectedIds, assetTxTotalCount]);

  const assetTxFilterFingerprintRef = useRef("");
  useEffect(() => {
    const fp = JSON.stringify(assetTxFilters);
    if (fp !== assetTxFilterFingerprintRef.current) {
      assetTxFilterFingerprintRef.current = fp;
      if (assetTxSelectionMode) clearAssetTxSelection();
    }
  }, [assetTxFilters, assetTxSelectionMode, clearAssetTxSelection]);

  const buildAssetTxBulkSelectionPayload = useCallback(() => {
    if (assetTxSelectAllFiltered) {
      const f = assetTxFilters;
      const filters = {};
      const portfolioTypes = ["buy", "sell", "adjustment"];
      const types = Array.isArray(f.types)
        ? f.types.filter((t) => portfolioTypes.includes(t))
        : portfolioTypes;
      if (types.length > 0) filters.type = types.join(",");
      if (Array.isArray(f.asset_ids) && f.asset_ids.length > 0) {
        filters.asset = f.asset_ids.join(",");
      }
      if (f.date_from) filters.date_from = f.date_from;
      if (f.date_to) filters.date_to = f.date_to;
      if (f.verified !== null && f.verified !== undefined) {
        filters.verified = f.verified;
      }
      if (f.search && f.search.trim()) filters.search = f.search.trim();
      if (f.ordering && f.ordering !== "-date") filters.ordering = f.ordering;
      return {
        mode: "filtered",
        filters,
        exclude_ids: Array.from(assetTxSelectedIds),
      };
    }
    return { mode: "ids", ids: Array.from(assetTxSelectedIds) };
  }, [assetTxFilters, assetTxSelectAllFiltered, assetTxSelectedIds]);

  const applyAssetTxBulkVerify = useCallback(
    async (value) => {
      if (guardDemo()) return null;
      setAssetTxBulkLoading(true);
      setAssetTxBulkError(null);
      try {
        const res = await apiFetch(`${API}/portfolio/transactions/bulk/`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "edit",
            patch: { is_verified: value },
            selection: buildAssetTxBulkSelectionPayload(),
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          const message =
            Array.isArray(data?.errors) && data.errors.length > 0
              ? data.errors.join(", ")
              : T("cf_bulk_err_generic");
          setAssetTxBulkError(message);
          return null;
        }
        refreshAfter(REFRESH_REASONS.TRANSACTION_UPDATED);
        await loadAssetTxFeed(1);
        clearAssetTxSelection();
        setAssetTxSelectionMode(false);
        return data;
      } catch {
        setAssetTxBulkError(T("error_network"));
        return null;
      } finally {
        setAssetTxBulkLoading(false);
      }
    },
    [
      apiFetch,
      buildAssetTxBulkSelectionPayload,
      clearAssetTxSelection,
      guardDemo,
      loadAssetTxFeed,
      refreshAfter,
      T,
    ],
  );

  const loadAllCf = useCallback(async () => {
    const requestSeq = ++cfRequestSeqRef.current;
    setCfLoading(true);
    try {
      const f = cfFilters;
      const results = [];
      let page = 1;
      let data;
      do {
        const params = buildCashflowQueryParams(f, { page, pageSize: 200 });
        const res = await apiFetch(`${API}/expenses/cashflow/?${params}`);
        if (!res.ok) return;
        data = await res.json();
        results.push(...data.results);
        page = data.next_page;
      } while (page !== null);
      if (requestSeq !== cfRequestSeqRef.current) return;
      setCfItems(results);
      setCfHasMore(false);
      setCfTotalCount(data?.count ?? results.length);
    } catch (e) {
      logError("loadAllCf:", e);
    } finally {
      setCfLoading(false);
    }
  }, [apiFetch, cfFilters, buildCashflowQueryParams]);

  const toggleCfType = useCallback((type) => {
    setCfFilters((prev) => {
      let types;
      // From "all types", selecting one should focus to that single type.
      if (prev.types.length === 4) {
        types = [type];
      } else if (prev.types.includes(type)) {
        types = prev.types.filter((t) => t !== type);
      } else {
        types = [...prev.types, type];
      }
      // Keep at least one selected type.
      if (types.length === 0) types = [type];
      return { ...prev, types };
    });
  }, []);

  const openCfEditTransfer = useCallback((item) => {
    setCfEditTransferItem(item);
    setCfEditTransferForm({
      date: item.date,
      notes: item.description || "",
      is_verified: item.is_verified ?? false,
      amount: item.amount,
    });
    setCfEditTransferError(null);
  }, []);

  const closeCfEditTransfer = useCallback(() => {
    setCfEditTransferItem(null);
    setCfEditTransferError(null);
  }, []);

  const submitCfEditTransfer = useCallback(async () => {
    if (guardDemo()) return;
    const item = cfEditTransferItem;
    if (!item) return;
    const parsedAmount = parseAmount(
      cfEditTransferForm.amount,
      decimalSeparator,
    );
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setCfEditTransferError(T("error_invalid_amount"));
      return;
    }
    setCfEditTransferLoading(true);
    setCfEditTransferError(null);
    try {
      const body = {
        date: cfEditTransferForm.date,
        notes: cfEditTransferForm.notes,
        is_verified: cfEditTransferForm.is_verified,
        // CRIT-04: canonical decimal string (validated above via parseAmount).
        price_per_share: parseMoneyToString(
          cfEditTransferForm.amount,
          decimalSeparator,
        ),
      };
      const r1 = await apiFetch(
        `${API}/portfolio/${item.to_account.id}/transactions/${item.source_id}/`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      if (!r1.ok) {
        setCfEditTransferError(T("error_generic"));
        return;
      }
      if (item.paired_id && item.from_account?.id) {
        await apiFetch(
          `${API}/portfolio/${item.from_account.id}/transactions/${item.paired_id}/`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          },
        );
      }
      setCfItems((prev) =>
        prev.map((i) =>
          i.id === item.id
            ? {
                ...i,
                date: body.date,
                description: body.notes ?? i.description,
                is_verified: body.is_verified,
                amount: cfEditTransferForm.amount,
              }
            : i,
        ),
      );
      closeCfEditTransfer();
    } catch {
      setCfEditTransferError(T("error_generic"));
    } finally {
      setCfEditTransferLoading(false);
    }
  }, [
    apiFetch,
    guardDemo,
    cfEditTransferItem,
    cfEditTransferForm,
    closeCfEditTransfer,
    T,
    decimalSeparator,
  ]);

  // ── Cash Flow bulk selection (K-3.7) ──────────────────────────────────────

  const clearCfSelection = useCallback(() => {
    setCfSelectedIds(new Set());
    setCfSelectAllFiltered(false);
    setCfSelectionKind(null);
    setCfBulkPreview(null);
    setCfBulkError(null);
  }, []);

  const enterCfSelectionMode = useCallback(() => {
    setCfSelectionMode(true);
    clearCfSelection();
  }, [clearCfSelection]);

  const exitCfSelectionMode = useCallback(() => {
    setCfSelectionMode(false);
    clearCfSelection();
    setCfBulkEditOpen(false);
  }, [clearCfSelection]);

  const toggleCfItemSelected = useCallback(
    (id, itemType) => {
      setCfSelectedIds((prev) => {
        // Removing a row: always allowed. If the selection drops to zero,
        // unlock the kind so the next pick can be of any type.
        if (prev.has(id)) {
          const next = new Set(prev);
          next.delete(id);
          if (next.size === 0) setCfSelectionKind(null);
          return next;
        }
        // Adding a row: must match the locked kind (if any). The first pick
        // sets the kind; later picks of a different kind are rejected.
        if (cfSelectionKind && itemType && cfSelectionKind !== itemType) {
          setCfSelectionRejectionTick((t) => t + 1);
          return prev;
        }
        if (!cfSelectionKind && itemType) {
          setCfSelectionKind(itemType);
        }
        const next = new Set(prev);
        next.add(id);
        return next;
      });
    },
    [cfSelectionKind],
  );

  const selectVisibleCf = useCallback(() => {
    setCfSelectAllFiltered(false);
    // Restrict to items matching the current kind. If no kind is set yet, the
    // first visible item's type locks the selection.
    const lockedKind =
      cfSelectionKind || (cfItems.length > 0 ? cfItems[0].type : null);
    const eligible = cfItems.filter(
      (i) => !lockedKind || i.type === lockedKind,
    );
    if (lockedKind && lockedKind !== cfSelectionKind) {
      setCfSelectionKind(lockedKind);
    }
    setCfSelectedIds(new Set(eligible.map((i) => i.id)));
  }, [cfItems, cfSelectionKind]);

  const selectAllFilteredCf = useCallback(() => {
    // Only meaningful when the active filter narrows to a single kind —
    // otherwise the resulting selection would be mixed and the backend rejects
    // it. The ExpensesView disables the trigger button accordingly.
    const types = Array.isArray(cfFilters.types) ? cfFilters.types : [];
    if (types.length !== 1) return;
    setCfSelectAllFiltered(true);
    setCfSelectedIds(new Set());
    setCfSelectionKind(types[0]);
  }, [cfFilters]);

  const isCfItemSelected = useCallback(
    (id) => {
      if (cfSelectAllFiltered) return !cfSelectedIds.has(id);
      return cfSelectedIds.has(id);
    },
    [cfSelectAllFiltered, cfSelectedIds],
  );

  // Which toolbar actions are allowed for the current selection kind. The
  // backend gates the same way; this is the UI mirror so we don't render
  // buttons that would always 400.
  const bulkActionsAllowed = useMemo(() => {
    if (cfSelectionKind === "adjustment") {
      return { verify: false, edit: false, delete: true };
    }
    return { verify: true, edit: true, delete: true };
  }, [cfSelectionKind]);

  const cfSelectedCount = useMemo(() => {
    if (cfSelectAllFiltered) {
      return Math.max(0, (cfTotalCount || 0) - cfSelectedIds.size);
    }
    return cfSelectedIds.size;
  }, [cfSelectAllFiltered, cfSelectedIds, cfTotalCount]);

  const cfSelectedSum = useMemo(() => {
    // We can only sum what's currently loaded; for select-all-filtered the
    // server's preview returns the authoritative total. This is an estimate
    // used only for inline display before the user opens the modal.
    let total = 0;
    cfItems.forEach((item) => {
      if (!isCfItemSelected(item.id)) return;
      const amt = parseFloat(item.amount || 0);
      if (item.type === "income") total += amt;
      else if (item.type === "outcome") total -= amt;
    });
    return total;
  }, [cfItems, isCfItemSelected]);

  // Reset selection when filters change — the row identity behind a feed-id
  // is stable but the comprehension of "all selected" is filter-bound.
  const cfFilterFingerprintRef = useRef("");
  useEffect(() => {
    const fp = JSON.stringify(cfFilters);
    if (fp !== cfFilterFingerprintRef.current) {
      cfFilterFingerprintRef.current = fp;
      // Only clear if user is in selection mode (avoids noisy resets at boot)
      if (cfSelectionMode) clearCfSelection();
    }
  }, [cfFilters, cfSelectionMode, clearCfSelection]);

  const buildCfBulkSelectionPayload = useCallback(() => {
    if (cfSelectAllFiltered) {
      // Mirror what the backend expects for filtered mode.
      const f = cfFilters;
      const filters = {};
      if (f.types && f.types.length > 0 && f.types.length < 4)
        filters.types = f.types;
      if (f.date_from) filters.date_from = f.date_from;
      if (f.date_to) filters.date_to = f.date_to;
      if (Array.isArray(f.category_ids) && f.category_ids.length > 0) {
        const parents = [];
        const children = [];
        f.category_ids.forEach((id) => {
          const cat = categories.find((c) => String(c.id) === String(id));
          if (cat && !cat.parent) parents.push(Number(id));
          else children.push(Number(id));
        });
        if (children.length > 0) filters.category_ids = children;
        if (parents.length > 0) filters.parent_category_ids = parents;
      }
      if (Array.isArray(f.account_ids) && f.account_ids.length > 0) {
        filters.account_ids = f.account_ids;
      }
      if (f.verified !== null && f.verified !== undefined) {
        filters.verified = f.verified;
      }
      if (f.search && f.search.trim()) {
        filters.search = f.search.trim();
      }
      return {
        mode: "filtered",
        filters,
        exclude_ids: Array.from(cfSelectedIds),
      };
    }
    return { mode: "ids", ids: Array.from(cfSelectedIds) };
  }, [cfFilters, cfSelectAllFiltered, cfSelectedIds, categories]);

  // i18n keys for backend error_codes — single source of truth.
  const cfBulkErrorCodeKeys = useMemo(
    () => ({
      asset_refresh_failed: "cf_bulk_err_refresh_failed",
      category_direction_mismatch: "cf_bulk_err_category_direction_mismatch",
      account_not_bank: "cf_bulk_err_account_not_bank",
      invalid_date: "cf_bulk_err_invalid_date",
      empty_patch: "cf_bulk_err_empty_patch",
      filtered_too_large: "cf_bulk_err_filtered_too_large",
    }),
    [],
  );

  const formatCfBulkError = useCallback(
    (data) => {
      const codes = Array.isArray(data?.error_codes) ? data.error_codes : [];
      const localized = codes
        .map((c) => cfBulkErrorCodeKeys[c])
        .filter(Boolean)
        .map((k) => T(k));
      if (localized.length > 0) return localized.join(" ");
      if (Array.isArray(data?.errors) && data.errors.length > 0) {
        return data.errors.join(", ");
      }
      return T("cf_bulk_err_generic");
    },
    [cfBulkErrorCodeKeys, T],
  );

  const cfBulkPreviewAbortRef = useRef(null);
  // HIGH-29: signature of the *selection* (filters + ids) the shown preview was
  // computed for. The abort logic below already stops a slow response from
  // overwriting a newer one, but the previously-rendered preview keeps showing
  // until the next response lands — counts for filters the user has already
  // changed. When the selection signature changes we drop the stale preview at
  // once so the panel shows a loading state, never numbers for a dead filter.
  const cfBulkPreviewSelSigRef = useRef(null);

  const runCfBulkPreview = useCallback(
    async ({ action, patch }) => {
      // Cancel any in-flight preview before starting a new one — live preview
      // fires on every keystroke (debounced), so without abort the slowest
      // response could overwrite the latest.
      if (cfBulkPreviewAbortRef.current) {
        cfBulkPreviewAbortRef.current.abort();
      }
      const controller = new AbortController();
      cfBulkPreviewAbortRef.current = controller;

      const selection = buildCfBulkSelectionPayload();
      const selSig = JSON.stringify(selection);
      // Invalidate a preview that belonged to a different selection (changed
      // filters/ids). Keyed on the selection only — not the patch — so ordinary
      // edit keystrokes don't blank the panel between debounced responses.
      if (
        cfBulkPreviewSelSigRef.current !== null &&
        cfBulkPreviewSelSigRef.current !== selSig
      ) {
        setCfBulkPreview(null);
      }
      cfBulkPreviewSelSigRef.current = selSig;

      setCfBulkLoading(true);
      setCfBulkError(null);
      try {
        const res = await apiFetch(`${API}/expenses/cashflow/bulk/`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action,
            patch,
            selection,
            dry_run: true,
          }),
          signal: controller.signal,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setCfBulkError(formatCfBulkError(data));
          setCfBulkPreview(data || null);
          return null;
        }
        setCfBulkPreview(data);
        return data;
      } catch (err) {
        if (err?.name === "AbortError") return null;
        setCfBulkError(T("error_network"));
        return null;
      } finally {
        if (cfBulkPreviewAbortRef.current === controller) {
          cfBulkPreviewAbortRef.current = null;
          setCfBulkLoading(false);
        }
      }
    },
    [apiFetch, buildCfBulkSelectionPayload, formatCfBulkError, T],
  );

  const applyCfBulk = useCallback(
    async ({ action, patch }) => {
      if (guardDemo()) return null;
      // Cancel any pending preview to avoid race with apply response.
      if (cfBulkPreviewAbortRef.current) {
        cfBulkPreviewAbortRef.current.abort();
        cfBulkPreviewAbortRef.current = null;
      }
      setCfBulkLoading(true);
      setCfBulkError(null);
      try {
        const res = await apiFetch(`${API}/expenses/cashflow/bulk/`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action,
            patch,
            selection: buildCfBulkSelectionPayload(),
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setCfBulkError(formatCfBulkError(data));
          return null;
        }
        refreshAfter(
          action === "delete"
            ? REFRESH_REASONS.EXPENSE_DELETED
            : REFRESH_REASONS.EXPENSE_UPDATED,
        );
        clearCfSelection();
        setCfSelectionMode(false);
        setCfBulkEditOpen(false);
        void loadCfFeed(1);
        return data;
      } catch {
        setCfBulkError(T("error_network"));
        return null;
      } finally {
        setCfBulkLoading(false);
      }
    },
    [
      apiFetch,
      buildCfBulkSelectionPayload,
      clearCfSelection,
      formatCfBulkError,
      guardDemo,
      loadCfFeed,
      refreshAfter,
      T,
    ],
  );

  // Verify / unverify a single feed item without entering selection mode —
  // used by the detail sheet toggle and the row swipe action. Reuses the
  // existing cashflow bulk endpoint with an explicit single-id selection, so
  // there is no new backend surface.
  const setCfItemVerified = useCallback(
    async (item, value) => {
      if (guardDemo()) return null;
      if (!item?.id) return null;
      setCfBulkError(null);
      try {
        const res = await apiFetch(`${API}/expenses/cashflow/bulk/`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "edit",
            patch: { is_verified: value },
            selection: { mode: "ids", ids: [item.id] },
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setCfBulkError(formatCfBulkError(data));
          return null;
        }
        refreshAfter(REFRESH_REASONS.EXPENSE_UPDATED);
        void loadCfFeed(1);
        return data;
      } catch {
        setCfBulkError(T("error_network"));
        return null;
      }
    },
    [apiFetch, formatCfBulkError, guardDemo, loadCfFeed, refreshAfter, T],
  );

  const saveAdjustBalance = async () => {
    if (guardDemo()) return;
    if (!adjustAssetId) return;
    // HIGH-25 / CRIT-04: parseFloat mangled IT-formatted input ("1.234,56" →
    // 1.234) and let Infinity slip past isNaN. parseAmount honors the user's
    // separator and rejects Infinity / >1e12; the balance may legitimately be
    // negative or zero (overdraft), which parseAmount preserves.
    const val = parseAmount(adjustForm.new_balance, decimalSeparator);
    if (isNaN(val)) {
      setAdjustError(T("error_generic"));
      return;
    }
    // Send the canonical decimal string (no Number round-trip) so precision is
    // preserved on the backend DecimalField.
    const newBalanceStr = parseMoneyToString(
      adjustForm.new_balance,
      decimalSeparator,
    );
    setAdjustError(null);
    try {
      const res = await apiFetch(
        `${API}/portfolio/${adjustAssetId}/adjust-balance/`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ new_balance: newBalanceStr }),
        },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setAdjustError(
          Object.values(err).flat().join(" ") || T("error_save_failed"),
        );
        return;
      }
      closeAdjustModal();
      refreshAfter(REFRESH_REASONS.BALANCE_ADJUSTED);
    } catch {
      setAdjustError(T("error_network"));
    }
  };

  const deleteAsset = async (id) => {
    if (guardDemo()) return;
    await apiFetch(`${API}/portfolio/${id}/`, { method: "DELETE" });
    refreshAfter(REFRESH_REASONS.ASSET_DELETED);
  };

  const archiveAsset = async (id) => {
    if (guardDemo()) return;
    const res = await apiFetch(`${API}/portfolio/${id}/archive/`, {
      method: "POST",
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return { ok: false, data };
    }
    refreshAfter(REFRESH_REASONS.ASSET_UPDATED);
    return { ok: true };
  };

  const unarchiveAsset = async (id) => {
    if (guardDemo()) return;
    const res = await apiFetch(`${API}/portfolio/${id}/unarchive/`, {
      method: "POST",
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return { ok: false, data };
    }
    const data = await res.json().catch(() => ({}));
    refreshAfter(REFRESH_REASONS.ASSET_UPDATED);
    return { ok: true, rollbackCandidates: data.rollback_candidates || [] };
  };

  const moveAsset = async (id, destinationAccountId) => {
    if (guardDemo()) return;
    const res = await apiFetch(`${API}/portfolio/${id}/move/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ destination_account_id: destinationAccountId }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return { ok: false, data };
    }
    refreshAfter(REFRESH_REASONS.ASSET_UPDATED);
    return { ok: true };
  };

  const refreshPrices = async () => {
    setRefreshing(true);
    setRefreshMsg(null);
    try {
      const res = await apiFetch(`${API}/portfolio/refresh-prices/`, {
        method: "POST",
        timeoutMs: LONG_FETCH_TIMEOUT_MS,
      });
      if (!res.ok) {
        setRefreshMsg(T("error_network"));
        return;
      }
      const data = await res.json();
      refreshAfter(REFRESH_REASONS.PRICE_REFRESH_COMPLETED);
      setPriceRefreshCounter((c) => c + 1);
      const failed = (data.details || [])
        .filter((d) => d.status === "error")
        .map((d) => d.ticker || d.name);
      let msg = `${data.updated}/${data.total} ${T("refresh_done")}`;
      if (failed.length) msg += ` · ⚠ ${failed.join(", ")}`;
      setRefreshMsg(msg);
    } catch {
      setRefreshMsg(T("error_network"));
    } finally {
      setRefreshing(false);
    }
  };

  // ── Category actions ──

  const addCategory = async () => {
    if (guardDemo()) return;
    if (!catForm.name.trim()) {
      setCatAddError(T("error_name_required"));
      return;
    }
    setCatAddError("");
    try {
      const isEdit = editingCatId !== null;
      const url = isEdit
        ? `${API}/expenses/categories/${editingCatId}/`
        : `${API}/expenses/categories/`;
      const body = isEdit
        ? {
            name: catForm.name.trim(),
            color: catForm.color,
            icon: catForm.icon,
          }
        : {
            name: catForm.name.trim(),
            color: catForm.color,
            icon: catForm.icon,
            category_type: catAddContext.type,
            parent: catAddContext.parent,
          };
      const res = await apiFetch(url, {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        setCatAddError(T("error_save_failed"));
        return;
      }
      setShowCatAddModal(false);
      setEditingCatId(null);
      setCatForm({ name: "", color: "#4f7fff", icon: "💰" });
      refreshAfter(
        editingCatId !== null
          ? REFRESH_REASONS.CATEGORY_UPDATED
          : REFRESH_REASONS.CATEGORY_CREATED,
      );
    } catch {
      setCatAddError(T("error_network"));
    }
  };

  const openDeleteCatFlow = (cat) => {
    const isRoot = !cat.parent;
    const subs = categories.filter((c) => c.parent === cat.id);
    if (isRoot && subs.length > 0) {
      setDeleteCatFlow({
        cat,
        step: "subs",
        subsChoice: null,
        subsTarget: null,
        expChoice: null,
        expTarget: null,
      });
    } else {
      setDeleteCatFlow({
        cat,
        step: "expenses",
        subsChoice: null,
        subsTarget: null,
        expChoice: null,
        expTarget: null,
      });
    }
  };

  const confirmDeleteCategory = async () => {
    if (!deleteCatFlow) return;
    const { cat, subsChoice, subsTarget, expChoice, expTarget } = deleteCatFlow;
    await apiFetch(`${API}/expenses/categories/${cat.id}/`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subs_action: subsChoice || "null",
        reassign_subs_to: subsTarget || null,
        expenses_action: expChoice || "null",
        reassign_expenses_to: expTarget || null,
      }),
    });
    setDeleteCatFlow(null);
    refreshAfter(REFRESH_REASONS.CATEGORY_DELETED);
  };

  const openAddMain = (type) => {
    setEditingCatId(null);
    setCatAddContext({ type, parent: null });
    setCatForm({ name: "", color: "#4f7fff", icon: "💰" });
    setCatAddError("");
    setShowCatAddModal(true);
  };
  const openAddSub = (parentCat) => {
    setEditingCatId(null);
    setCatAddContext({
      type: parentCat.category_type,
      parent: parentCat.id,
    });
    setCatForm({ name: "", color: parentCat.color, icon: parentCat.icon });
    setCatAddError("");
    setShowCatAddModal(true);
  };
  const openEditCat = (cat) => {
    setEditingCatId(cat.id);
    setCatAddContext({
      type: cat.category_type,
      parent: cat.parent || null,
    });
    setCatForm({ name: cat.name, color: cat.color, icon: cat.icon });
    setCatAddError("");
    setShowCatAddModal(true);
  };
  const toggleExpandCat = (catId) => {
    setExpandedCats((prev) => {
      const n = new Set(prev);
      n.has(catId) ? n.delete(catId) : n.add(catId);
      return n;
    });
  };

  // ── Investment type actions ──

  const closeInvTypeModal = () => {
    setShowInvTypeModal(false);
    setEditingInvTypeId(null);
    editingInvTypeOrigRateRef.current = null;
    setInvTypeForm({
      name: "",
      color: "#4f7fff",
      icon: "📈",
      supports_ticker: true,
      is_liquid_default: true,
      is_bank_account: false,
      supports_contribution_source: false,
      tax_rate: "0",
    });
    setInvTypeError("");
  };

  const openEditInvType = (invType) => {
    setEditingInvTypeId(invType.id);
    editingInvTypeOrigRateRef.current = Number(invType.tax_rate || 0);
    setInvTypeForm({
      name: invType.name,
      color: invType.color,
      icon: invType.icon,
      supports_ticker: invType.supports_ticker,
      is_liquid_default: invType.is_liquid_default,
      is_bank_account: !!invType.is_bank_account,
      supports_contribution_source: !!invType.supports_contribution_source,
      tax_rate: String(
        (parseFloat(invType.tax_rate || 0) * 100).toFixed(2),
      ).replace(/\.00$/, ""),
    });
    setInvTypeError("");
    setShowInvTypeModal(true);
  };

  const addInvestmentType = async () => {
    if (guardDemo()) return;
    if (!invTypeForm.name.trim()) {
      setInvTypeError(T("error_name_required"));
      return;
    }
    setInvTypeError("");
    const isEdit = editingInvTypeId !== null;
    const body = {
      ...invTypeForm,
      name: invTypeForm.name.trim(),
      tax_rate: (parseFloat(invTypeForm.tax_rate || "0") / 100).toFixed(4),
    };

    const doSave = async (propagation) => {
      const finalBody =
        propagation && isEdit
          ? { ...body, tax_propagation: propagation }
          : body;
      try {
        const url = isEdit
          ? `${API}/portfolio/investment-types/${editingInvTypeId}/`
          : `${API}/portfolio/investment-types/`;
        const res = await apiFetch(url, {
          method: isEdit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(finalBody),
        });
        if (!res.ok) {
          setInvTypeError(T("error_save_failed"));
          return false;
        }
      } catch {
        setInvTypeError(T("error_network"));
        return false;
      }
      closeInvTypeModal();
      refreshAfter(
        isEdit
          ? REFRESH_REASONS.INVESTMENT_TYPE_UPDATED
          : REFRESH_REASONS.INVESTMENT_TYPE_CREATED,
      );
      return true;
    };

    // If an existing type's tax rate changed, offer to propagate it to the
    // already-created sells of its assets (those without their own override).
    const newRate = Number(body.tax_rate);
    const taxChanged = isEdit && newRate !== editingInvTypeOrigRateRef.current;
    if (taxChanged) {
      setTaxPropagationFlow({
        kind: "invtype",
        run: async (propagation) => {
          const ok = await doSave(propagation);
          setTaxPropagationFlow(null);
          return ok;
        },
      });
      return;
    }
    await doSave(null);
  };

  const openDeleteInvTypeFlow = (invType) =>
    setDeleteInvTypeFlow({
      invType,
      assetsChoice: null,
      assetsTarget: null,
    });

  const confirmDeleteInvType = async () => {
    if (!deleteInvTypeFlow) return;
    const { invType, assetsChoice, assetsTarget } = deleteInvTypeFlow;
    await apiFetch(`${API}/portfolio/investment-types/${invType.id}/`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        assets_action: assetsChoice || "null",
        reassign_to: assetsTarget || null,
      }),
    });
    setDeleteInvTypeFlow(null);
    refreshAfter(REFRESH_REASONS.INVESTMENT_TYPE_DELETED);
  };

  // ── Transfer ──

  const openTransferModal = useCallback(() => {
    setTransferForm(
      buildTransferForm({
        is_verified: transactionPrefs.cashflow_default_verified,
      }),
    );
    setTransferWarning(null);
    setTransferError(null);
    setShowTransferModal(true);
  }, [buildTransferForm, transactionPrefs.cashflow_default_verified]);

  const closeTransferModal = useCallback(() => {
    setShowTransferModal(false);
    setTransferWarning(null);
    setTransferError(null);
  }, []);

  const submitTransfer = useCallback(async () => {
    if (guardDemo()) return;
    if (
      !transferForm.from_account_id ||
      !transferForm.to_account_id ||
      !transferForm.amount
    ) {
      setTransferError(T("tx_error_fields"));
      return;
    }
    const parsedTransferAmountStandalone = parseAmount(
      transferForm.amount,
      decimalSeparator,
    );
    if (
      isNaN(parsedTransferAmountStandalone) ||
      parsedTransferAmountStandalone <= 0
    ) {
      setTransferError(null);
      return;
    }
    setTransferLoading(true);
    setTransferError(null);
    setTransferWarning(null);
    try {
      const res = await apiFetch(`${API}/portfolio/transfer/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...transferForm,
          // CRIT-04: canonical decimal string (validated above via parseAmount).
          amount: parseMoneyToString(transferForm.amount, decimalSeparator),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setTransferError(err.error || T("error_save_failed"));
        return;
      }
      const data = await res.json();
      if (data.warning) {
        setTransferWarning(T("balance_warning"));
      }
      closeTransferModal();
      refreshAfter(REFRESH_REASONS.TRANSFER_COMPLETED);
    } catch {
      setTransferError(T("error_network"));
    } finally {
      setTransferLoading(false);
    }
  }, [
    apiFetch,
    transferForm,
    refreshAfter,
    closeTransferModal,
    decimalSeparator,
  ]);

  const submitTransferInCfModal = useCallback(async () => {
    if (guardDemo()) return;
    if (
      !transferForm.from_account_id ||
      !transferForm.to_account_id ||
      !transferForm.amount
    ) {
      setTransferError(T("tx_error_fields"));
      return;
    }
    const parsedTransferAmount = parseAmount(
      transferForm.amount,
      decimalSeparator,
    );
    if (isNaN(parsedTransferAmount) || parsedTransferAmount <= 0) {
      setTransferError(null);
      return;
    }
    setTransferLoading(true);
    setTransferError(null);
    setTransferWarning(null);
    try {
      const res = await apiFetch(`${API}/portfolio/transfer/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // CRIT-04: canonical decimal string (validated above via parseAmount).
          ...transferForm,
          amount: parseMoneyToString(transferForm.amount, decimalSeparator),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setTransferError(err.error || T("error_save_failed"));
        return;
      }
      const data = await res.json();
      if (data.warning) setTransferWarning(T("balance_warning"));
      closeExpenseModal();
      refreshAfter(REFRESH_REASONS.TRANSFER_COMPLETED);
    } catch {
      setTransferError(T("error_network"));
    } finally {
      setTransferLoading(false);
    }
  }, [
    apiFetch,
    transferForm,
    refreshAfter,
    closeExpenseModal,
    decimalSeparator,
  ]);

  // ── Reset / demo ──

  const resetTransactions = async () => {
    const res = await apiFetch(`${API}/expenses/reset/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm: true }),
    });
    const data = await res.json();
    setResetConfirm(null);
    setResetUnderstood(false);
    setResetMsg({ deleted: data.deleted, target: "transactions" });
    refreshAfter(REFRESH_REASONS.EXPENSES_RESET);
  };

  const resetPortfolio = async () => {
    const res = await apiFetch(`${API}/portfolio/reset/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm: true }),
    });
    const data = await res.json();
    setResetConfirm(null);
    setResetUnderstood(false);
    setResetMsg({ deleted: data.deleted, target: "portfolio" });
    refreshAfter(REFRESH_REASONS.PORTFOLIO_RESET);
  };

  const loadDemoData = async () => {
    setDemoLoading(true);
    setDemoError("");
    try {
      const res = await apiFetch(`${API}/expenses/seed-demo/`, {
        method: "POST",
        timeoutMs: LONG_FETCH_TIMEOUT_MS,
      });
      if (!res.ok) {
        setDemoError(T("error_save_failed"));
        setDemoLoading(false);
        return;
      }
    } catch {
      setDemoError(T("error_network"));
      setDemoLoading(false);
      return;
    }
    setDemoLoading(false);
    setDemoConfirm(false);
    setDemoUnderstood(false);
    refreshAfter(REFRESH_REASONS.DEMO_LOADED);
  };

  // ── Derived / memos ──

  const s = summary || {};
  const getYearMonthFromIso = (value) => {
    const m = String(value || "").match(/^(\d{4})-(\d{2})/);
    if (!m) return null;
    return { year: parseInt(m[1], 10), month: parseInt(m[2], 10) };
  };

  const filteredExpenses = useMemo(() => {
    if (!Array.isArray(filterCat) || filterCat.length === 0) return expenses;
    const selectedIds = new Set(filterCat.map((id) => parseInt(id, 10)));
    return expenses.filter((e) => {
      if (selectedIds.has(e.category)) return true;
      const cat = categories.find((c) => c.id === e.category);
      if (cat && cat.parent != null && selectedIds.has(cat.parent)) return true;
      return false;
    });
  }, [expenses, filterCat, categories]);

  const rootCategoriesForDir = useMemo(
    () =>
      categories.filter((c) => !c.parent && c.category_type === cashflowDir),
    [categories, cashflowDir],
  );

  const rootExpenseCategories = useMemo(
    () => categories.filter((c) => !c.parent && c.category_type === "expense"),
    [categories],
  );

  const cashflowBaseData = useMemo(
    () => (cashflowDir === "income" ? trendIncomes : trendExpenses),
    [cashflowDir, trendIncomes, trendExpenses],
  );

  const availableYears = useMemo(() => {
    const years = new Set();
    cashflowBaseData.forEach((e) => {
      const d = new Date(e.date);
      if (!Number.isNaN(d.getTime())) years.add(d.getFullYear());
    });
    years.add(currentYear);
    return Array.from(years).sort((a, b) => b - a);
  }, [cashflowBaseData]);

  const availableMonthsForYear = useMemo(() => {
    if (!filterYear) return [];
    const months = new Set();
    cashflowBaseData.forEach((e) => {
      const d = new Date(e.date);
      if (!Number.isNaN(d.getTime()) && d.getFullYear() === filterYear) {
        months.add(d.getMonth() + 1);
      }
    });
    if (months.size === 0 && filterYear === currentYear) {
      months.add(currentMonth);
    }
    return Array.from(months).sort((a, b) => a - b);
  }, [cashflowBaseData, filterYear]);

  useEffect(() => {
    if (availableYears.length === 0) return;
    if (!availableYears.includes(filterYear)) {
      setFilterYear(availableYears[0]);
    }
  }, [availableYears, filterYear]);

  const bankAccounts = useMemo(
    () =>
      assets.filter(
        (a) =>
          a.investment_type_detail?.is_bank_account === true && !a.is_archived,
      ),
    [assets],
  );

  const archivedBankAccounts = useMemo(
    () =>
      assets.filter(
        (a) =>
          a.investment_type_detail?.is_bank_account === true && a.is_archived,
      ),
    [assets],
  );

  const investments = useMemo(
    () =>
      assets.filter(
        (a) => !a.investment_type_detail?.is_bank_account && !a.is_archived,
      ),
    [assets],
  );

  const archivedInvestments = useMemo(
    () =>
      assets.filter(
        (a) => !a.investment_type_detail?.is_bank_account && a.is_archived,
      ),
    [assets],
  );

  const selectedInvType = useMemo(
    () =>
      investmentTypes.find((t) => t.id === parseInt(assetForm.investment_type)),
    [investmentTypes, assetForm.investment_type],
  );

  const kpiData = useMemo(() => {
    const monthlyExp =
      expSummary?.by_category
        ?.filter(
          (c) =>
            !c.category__category_type ||
            c.category__category_type === "expense",
        )
        .reduce((sum, c) => sum + parseFloat(c.total || 0), 0) || 0;
    const monthlyInc =
      expSummary?.by_category
        ?.filter((c) => c.category__category_type === "income")
        .reduce((sum, c) => sum + parseFloat(c.total || 0), 0) || 0;
    const returnRate = s.total_invested
      ? ((s.total_gain || 0) / s.total_invested) * 100
      : 0;
    const expenseRatio = s.total_current
      ? (monthlyExp / s.total_current) * 100
      : 0;
    return {
      monthlyExp,
      monthlyInc,
      returnRate,
      expenseRatio,
    };
  }, [expSummary, s]);

  const monthlyTrend = useMemo(() => {
    const trend = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const m = d.getMonth() + 1,
        y = d.getFullYear();
      const exp = trendExpenses.filter((e) => {
        const ym = getYearMonthFromIso(e.date);
        return ym && ym.month === m && ym.year === y;
      });
      trend.push({
        month: MONTHS[m - 1],
        value: exp.reduce((acc, e) => acc + parseFloat(e.amount || 0), 0),
      });
    }
    return trend;
  }, [trendExpenses, MONTHS]);

  const monthlyIncomeTrend = useMemo(() => {
    const trend = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const m = d.getMonth() + 1,
        y = d.getFullYear();
      const inc = trendIncomes.filter((e) => {
        const ym = getYearMonthFromIso(e.date);
        return ym && ym.month === m && ym.year === y;
      });
      trend.push({
        month: MONTHS[m - 1],
        value: inc.reduce((acc, e) => acc + parseFloat(e.amount || 0), 0),
      });
    }
    return trend;
  }, [trendIncomes, MONTHS]);

  const hasConfigurableDataFeatures =
    enabledFeatures.cashflow ||
    enabledFeatures.accounts ||
    enabledFeatures.investments;
  const settingsNavItems = [
    hasConfigurableDataFeatures && {
      key: "categories",
      icon: "📂",
      label: T("settings_categories"),
    },
    enabledFeatures.cashflow && {
      key: "budget",
      icon: "🎯",
      label: T("settings_budget"),
    },
    enabledFeatures.cashflow && {
      key: "recurring",
      icon: "🔄",
      label: T("settings_recurring"),
    },
    enabledFeatures.investments && {
      key: "pac",
      icon: "📆",
      label: T("settings_pac"),
    },
    enabledFeatures.investments && {
      key: "allocation",
      icon: "📊",
      label: T("settings_allocation"),
    },
    enabledFeatures.fire && {
      key: "fire",
      icon: "🔥",
      label: T("settings_fire"),
    },
    enabledFeatures.cashflow && {
      key: "cashflow_settings",
      icon: "💸",
      label: T("settings_cashflow"),
    },
    enabledFeatures.investments && {
      key: "investment_settings",
      icon: "📈",
      label: T("settings_investments"),
    },
    { key: "data", icon: "📥", label: T("settings_data") },
    { key: "account", icon: "👤", label: T("settings_user") },
    { key: "preferences", icon: "⚙️", label: T("settings_preferences") },
  ].filter(Boolean);

  const fetchGrants = useCallback(async () => {
    const res = await apiFetch(`${API}/auth/grants/`);
    if (res.ok) setGrants(await res.json());
  }, [apiFetch]);

  const switchAccount = useCallback((grant) => {
    setViewAs(
      grant
        ? {
            userId: grant.owner_id,
            email: grant.owner_email,
            permission: grant.permission,
          }
        : null,
    );
  }, []);

  const value = {
    // auth
    isAuthenticated,
    isDemo,
    authSessionNonce,
    demoLogin,
    showDemoModal,
    setShowDemoModal,
    user,
    login,
    logout,
    register,
    // app-lock (biometric)
    appLockEnabled,
    tabSwipeEnabled,
    setTabSwipeEnabled,
    isLocked,
    enableAppLock,
    disableAppLock,
    unlock,
    // preferences
    decimalSeparator,
    updateDecimalSeparator,
    accountingMonthStartDay,
    updateAccountingMonthStartDay,
    accountingMonthDateRange: (year, month) =>
      accountingMonthDateRange(year, month, accountingMonthStartDay),
    currentAccountingMonth: () =>
      currentAccountingMonth(accountingMonthStartDay),
    profile,
    updateProfile,
    enabledFeatures,
    updateEnabledFeature,
    isFeatureEnabled,
    transactionPrefs,
    updateTransactionPreference,
    privacyPreferences,
    temporaryPrivacyReveals,
    updatePrivacyPreferences,
    updatePrivacyPreference,
    revealPrivacyValue,
    hidePrivacyScope,
    isPrivacyValueTemporarilyRevealed,
    isPrivacyScopeTemporarilyRevealed,
    isPrivacyPreferenceEnabled,
    isPrivacyScopeEnabled,
    isValueHidden,
    changePassword,
    deleteAccount,
    // sharing
    viewAs,
    switchAccount,
    grants,
    fetchGrants,
    // navigation
    tab,
    setTab,
    // i18n
    lang,
    setLang,
    T,
    MONTHS,
    // theme
    theme,
    themePreference,
    setTheme,
    toggleTheme,
    // dashboard config
    dashConfig,
    setDashConfig,
    showDashSettings,
    setShowDashSettings,
    toggleDashCard,
    moveDashCard,
    reorderDashCards,
    resetDashConfig,
    // data
    expenses,
    setExpenses,
    trendExpenses,
    trendIncomes,
    categories,
    setCategories,
    assets,
    setAssets,
    summary,
    s,
    expSummary,
    setExpSummary,
    expSummaryCurrentMonth,
    fetchExpSummaryCurrentMonth,
    monthlyInvestmentStats,
    fetchMonthlyInvestmentStats,
    invStatsMonth,
    invStatsYear,
    setInvStatsMonth,
    setInvStatsYear,
    recurringStatus,
    fetchRecurringStatus,
    investmentTypes,
    setInvestmentTypes,
    contributionSources,
    setContributionSources,
    showInvTypeModal,
    setShowInvTypeModal,
    invTypeForm,
    setInvTypeForm,
    editingInvTypeId,
    allocationData,
    budgets,
    setBudgets,
    editingBudgetCat,
    setEditingBudgetCat,
    budgetInputVal,
    setBudgetInputVal,
    recurringExpenses,
    setRecurringExpenses,
    showRecurringModal,
    setShowRecurringModal,
    editingRecurringId,
    setEditingRecurringId,
    recurringForm,
    setRecurringForm,
    recurringError,
    setRecurringError,
    recurringSaving,
    generateRecurringMsg,
    setGenerateRecurringMsg,
    recurringInvestmentPlans,
    setRecurringInvestmentPlans,
    showPacModal,
    setShowPacModal,
    editingPacId,
    setEditingPacId,
    pacForm,
    setPacForm,
    pacError,
    setPacError,
    pacSaving,
    generatePacMsg,
    setGeneratePacMsg,
    // expense filters
    filterMonth,
    setFilterMonth,
    filterYear,
    setFilterYear,
    filterCat,
    setFilterCat,
    filterAccount,
    setFilterAccount,
    viewMode,
    setViewMode,
    cashflowDir,
    setCashflowDir,
    filterVerified,
    setFilterVerified,
    availableYears,
    availableMonthsForYear,
    // UI state
    refreshing,
    refreshMsg,
    setRefreshMsg,
    priceRefreshCounter,
    showExpModal,
    setShowExpModal,
    editingExpenseId,
    expError,
    setExpError,
    modalDir,
    setModalDir,
    pieHover,
    setPieHover,
    showAssetModal,
    editingAssetId,
    assetError,
    setAssetError,
    assetSaving,
    showAdjustModal,
    adjustForm,
    setAdjustForm,
    adjustError,
    allocChartType,
    setAllocChartType,
    settingsCatType,
    setSettingsCatType,
    settingsMenu,
    setSettingsMenu,
    showCatAddModal,
    setShowCatAddModal,
    catAddContext,
    catAddError,
    setCatAddError,
    editingCatId,
    demoLoading,
    demoError,
    setDemoLoading,
    setDemoError,
    invTypeError,
    setInvTypeError,
    expandedCats,
    deleteExpenseTarget,
    setDeleteExpenseTarget,
    resetConfirm,
    setResetConfirm,
    resetUnderstood,
    setResetUnderstood,
    resetMsg,
    setResetMsg,
    demoConfirm,
    setDemoConfirm,
    demoUnderstood,
    setDemoUnderstood,
    deleteCatFlow,
    setDeleteCatFlow,
    deleteInvTypeFlow,
    setDeleteInvTypeFlow,
    taxPropagationFlow,
    setTaxPropagationFlow,
    // transaction panel
    txPanel,
    assetTransactions,
    setAssetTransactions,
    txAddMode,
    setTxAddMode,
    editingTxId,
    setEditingTxId,
    txDeleteConfirm,
    setTxDeleteConfirm,
    txForm,
    setTxForm,
    txLoading,
    txError,
    setTxError,
    txWarning,
    setTxWarning,
    txAutofilling,
    showTransferModal,
    transferForm,
    setTransferForm,
    transferWarning,
    transferError,
    setTransferError,
    transferLoading,
    // ticker
    tickerQuery,
    setTickerQuery,
    tickerResults,
    setTickerResults,
    tickerLoading,
    showTickerDrop,
    tickerSearchOrigin,
    setShowTickerDrop,
    // CSV
    csvFile,
    csvParsed,
    csvSep,
    csvImportType,
    setCsvImportType,
    csvMap,
    setCsvMap,
    csvSignConv,
    setCsvSignConv,
    csvImportResult,
    csvImporting,
    csvImportPreview,
    setCsvImportPreview,
    // forms
    expForm,
    setExpForm,
    assetForm,
    setAssetForm,
    catForm,
    setCatForm,
    // wealth trend
    portfolioHistory,
    wealthTimeRange,
    setWealthTimeRange: changeWealthTimeRange,
    wealthRangeOffset,
    setWealthRangeOffset,
    // wealth chart
    wealthMetrics,
    toggleWealthMetric,
    API,
    apiFetch,
    fireGoal,
    fetchFireGoal,
    // monthly overview
    monthlyOverview,
    setMonthlyOverview,
    monthlyOverviewAvailableYears,
    monthlyOverviewPrefs,
    setMonthlyOverviewPrefs,
    updateMonthlyOverviewPrefs,
    fetchMonthlyOverview,
    fetchMonthlyOverviewForYear,
    monthlyOverviewRefreshKey,
    // derived
    filteredExpenses,
    rootCategoriesForDir,
    rootExpenseCategories,
    bankAccounts,
    archivedBankAccounts,
    investments,
    archivedInvestments,
    selectedInvType,
    kpiData,
    monthlyTrend,
    monthlyIncomeTrend,
    settingsNavItems,
    // fetch
    fetchExpenses,
    fetchExpSummary,
    fetchTrendExpenses,
    fetchTrendIncomes,
    fetchAssets,
    fetchPortfolioSummary,
    fetchPortfolioHistory,
    fetchCategories,
    fetchInvestmentTypes,
    fetchContributionSources,
    fetchBudgets,
    fetchRecurringExpenses,
    fetchRecurringInvestmentPlans,
    fetchAllocationData,
    refreshAfter,
    openRecurringModal,
    closeRecurringModal,
    submitRecurring,
    toggleRecurringStatus,
    deleteRecurring,
    generateRecurringForMonth,
    openPacModal,
    closePacModal,
    submitPac,
    togglePacStatus,
    deletePac,
    generatePacForMonth,
    // expense actions
    openExpenseModal,
    closeExpenseModal,
    submitExpense,
    deleteExpense,
    // asset actions
    openAssetAdd,
    openAssetEdit,
    closeAssetModal,
    saveAsset,
    deleteAsset,
    archiveAsset,
    unarchiveAsset,
    moveAsset,
    refreshPrices,
    openAdjustBalance,
    closeAdjustModal,
    saveAdjustBalance,
    openTxPanel,
    closeTxPanel,
    submitTxAdd,
    submitAddTxFromModal,
    autofillTxPrice,
    openEditTx,
    deleteTx,
    openTransferModal,
    closeTransferModal,
    submitTransfer,
    submitTransferInCfModal,
    handleTickerInput,
    handleIsinInput,
    handlePriceSourceChange,
    selectTicker,
    // category actions
    addCategory,
    openDeleteCatFlow,
    confirmDeleteCategory,
    openAddMain,
    openAddSub,
    openEditCat,
    toggleExpandCat,
    // investment type actions
    addInvestmentType,
    openDeleteInvTypeFlow,
    confirmDeleteInvType,
    openEditInvType,
    closeInvTypeModal,
    // reset / demo
    resetTransactions,
    resetPortfolio,
    loadDemoData,
    // CSV actions
    handleCSVUpload,
    handleCsvSepChange,
    previewImportCSV,
    doImportCSV,
    // global loading / error
    appLoading,
    bootstrapReady,
    fetchError,
    setFetchError,
    // cash flow feed (K-3)
    cfItems,
    cfSummary,
    cfHasMore,
    cfLoading,
    cfTotalCount,
    cfFilters,
    setCfFilters,
    cfEditTransferItem,
    cfEditTransferForm,
    setCfEditTransferForm,
    cfEditTransferError,
    cfEditTransferLoading,
    loadCfFeed,
    loadMoreCf,
    loadAllCf,
    toggleCfType,
    deleteCfExpense,
    deleteCfTx,
    openCfEditTransfer,
    closeCfEditTransfer,
    submitCfEditTransfer,
    // cash flow bulk selection (K-3.7)
    cfSelectionMode,
    cfSelectedIds,
    cfSelectAllFiltered,
    cfSelectedCount,
    cfSelectedSum,
    cfBulkPreview,
    cfBulkLoading,
    cfBulkError,
    cfBulkEditOpen,
    setCfBulkEditOpen,
    enterCfSelectionMode,
    exitCfSelectionMode,
    toggleCfItemSelected,
    selectVisibleCf,
    selectAllFilteredCf,
    isCfItemSelected,
    clearCfSelection,
    runCfBulkPreview,
    applyCfBulk,
    setCfItemVerified,
    setCfBulkError,
    setCfBulkPreview,
    cfSelectionKind,
    cfSelectionRejectionTick,
    bulkActionsAllowed,
    // asset transactions feed (Portfolio)
    assetTxItems,
    assetTxHasMore,
    assetTxLoading,
    assetTxTotalCount,
    assetTxFilters,
    setAssetTxFilters,
    assetTxRefreshKey,
    loadAssetTxFeed,
    loadMoreAssetTx,
    loadAllAssetTx,
    toggleAssetTxType,
    assetTxSelectionMode,
    assetTxSelectedIds,
    assetTxSelectAllFiltered,
    assetTxSelectedCount,
    assetTxBulkLoading,
    assetTxBulkError,
    enterAssetTxSelectionMode,
    exitAssetTxSelectionMode,
    toggleAssetTxItemSelected,
    selectVisibleAssetTx,
    selectAllFilteredAssetTx,
    isAssetTxItemSelected,
    clearAssetTxSelection,
    applyAssetTxBulkVerify,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
