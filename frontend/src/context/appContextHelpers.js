/**
 * Helper e costanti puri (nessuna dipendenza React) estratti da
 * AppContext.jsx (HIGH-30). Riusati sia dagli initializer localStorage sia
 * dalle callback del provider e da applyProfileData.
 */

const CLIENT_CACHE_TTL_MS = 30_000;
// Re-lock the app after returning from background for longer than this
const APPLOCK_BG_MS = 30_000;
const DEFAULT_PRIVACY_PREFERENCES = {};
const PRIVACY_REVEAL_MS = 60_000;
const DEFAULT_ENABLED_FEATURES = {
  dashboard: true,
  cashflow: true,
  accounts: true,
  investments: true,
  fire: true,
};
const TAB_FEATURES = {
  dashboard: "dashboard",
  expenses: "cashflow",
  accounts: "accounts",
  portfolio: "investments",
  fire: "fire",
};
// Transaction-creation preferences (synced server-side). All default to false
// so existing users keep the historical behaviour.
const DEFAULT_TRANSACTION_PREFERENCES = {
  cashflow_default_verified: false,
  cashflow_autofill_last_account: false,
  investments_default_verified: false,
};
const FALLBACK_TAB = "settings";

function clampAccountingMonthStartDay(value) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return 1;
  return Math.min(Math.max(n, 1), 31);
}

function isoDateLocal(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function accountingMonthStart(year, month, startDay) {
  const day = clampAccountingMonthStartDay(startDay);
  const lastDay = new Date(year, month, 0).getDate();
  return new Date(year, month - 1, Math.min(day, lastDay));
}

function accountingMonthDateRange(year, month, startDay) {
  const fromDate = accountingMonthStart(year, month, startDay);
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const toDate = accountingMonthStart(nextYear, nextMonth, startDay);
  toDate.setDate(toDate.getDate() - 1);
  return { from: isoDateLocal(fromDate), to: isoDateLocal(toDate) };
}

function accountingMonthLabelForDate(date, startDay) {
  const day = clampAccountingMonthStartDay(startDay);
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const currentStart = accountingMonthStart(year, month, day);
  if (date >= currentStart) return { year, month };
  if (month === 1) return { year: year - 1, month: 12 };
  return { year, month: month - 1 };
}

function currentAccountingMonth(startDay) {
  const now = new Date();
  return accountingMonthLabelForDate(now, startDay);
}

function getCurrentAccountingMonthDateRange(startDay) {
  const { year, month } = currentAccountingMonth(startDay);
  return { ...accountingMonthDateRange(year, month, startDay), year, month };
}

function normalizeBorsaFundInput(value) {
  const raw = String(value || "").trim();
  const urlMatch = raw.match(/\/borsa\/fondi\/dettaglio\/([^/.?#]+)/i);
  const symbol = (urlMatch?.[1] || raw).trim().toUpperCase();
  if (
    !urlMatch &&
    (raw.includes(".") ||
      raw.includes("-") ||
      /^[A-Z]{2}[A-Z0-9]{9}\d$/i.test(raw) ||
      !/^(?=.*\d)[A-Z0-9]{4,20}$/i.test(raw))
  ) {
    return null;
  }
  return {
    symbol,
    url: urlMatch
      ? raw
      : `https://www.borsaitaliana.it/borsa/fondi/dettaglio/${symbol}.html?lang=it`,
  };
}

function normalizePrivacyPreferences(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function normalizeEnabledFeatures(value) {
  const source =
    value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return Object.fromEntries(
    Object.entries(DEFAULT_ENABLED_FEATURES).map(([key, defaultValue]) => [
      key,
      typeof source[key] === "boolean" ? source[key] : defaultValue,
    ]),
  );
}

function normalizeTransactionPreferences(value) {
  const source =
    value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return Object.fromEntries(
    Object.entries(DEFAULT_TRANSACTION_PREFERENCES).map(
      ([key, defaultValue]) => [
        key,
        typeof source[key] === "boolean" ? source[key] : defaultValue,
      ],
    ),
  );
}

// ── Dashboard layout + view-pref normalization ──
// These live at module scope so they can be reused both by the localStorage
// initializers and by applyProfileData (server hydration). The dashboard layout
// and section view-prefs are synced server-side so they match across devices.
const RETIRED_DASH_SECTION_IDS = new Set([
  "cashflow_trend",
  "performance",
  "returns_heatmap",
  // Moved to the Investments tab (InvSummaryCard); drop from saved dash configs.
  "investment_kpi",
]);

const DASH_DEFAULT = [
  { id: "wealth_trend", visible: true },
  { id: "kpi_cards", visible: true },
  { id: "monthly_overview", visible: true },
  { id: "budget_progress", visible: true },
  { id: "expenses_pie", visible: true },
  { id: "expenses_trend", visible: true },
  { id: "portfolio_alloc", visible: true },
  { id: "currency_exposure", visible: true },
  { id: "recurring_overview", visible: true },
];
const PROFILE_PATCH_DEBOUNCE_MS = 300;

const cloneDashConfig = (config = DASH_DEFAULT) =>
  config.map((c) => ({ ...c }));

function clearDashboardLocalCache() {
  try {
    localStorage.removeItem("dashConfig");
    localStorage.removeItem("monthlyOverviewPrefs");
    localStorage.removeItem("wealthChartMetrics");
  } catch {}
}

// Merge a saved layout with the current catalog: drop retired sections and
// splice in newly-added defaults (after the first two cards, preserving the
// user's leading order). Returns null when `saved` is not a usable list.
function mergeDashConfig(saved) {
  if (!Array.isArray(saved)) return null;
  const seen = new Set();
  const patched = [];
  for (const c of saved) {
    if (
      !c ||
      typeof c.id !== "string" ||
      typeof c.visible !== "boolean" ||
      RETIRED_DASH_SECTION_IDS.has(c.id) ||
      seen.has(c.id)
    ) {
      continue;
    }
    seen.add(c.id);
    patched.push({ id: c.id, visible: c.visible });
  }
  if (patched.length === 0) return cloneDashConfig();
  const knownIds = new Set(patched.map((c) => c.id));
  const missing = DASH_DEFAULT.filter((def) => !knownIds.has(def.id)).map(
    (def) => ({ ...def }),
  );
  const insertAt = Math.min(2, patched.length);
  return [
    ...patched.slice(0, insertAt),
    ...missing,
    ...patched.slice(insertAt),
  ];
}

const VALID_MONTH_RANGES = [3, 6, 9, 12];

function smallViewportMonthRange() {
  return typeof window !== "undefined" &&
    window.matchMedia("(max-width: 760px)").matches
    ? 3
    : 12;
}

// Defensive validation against corrupted storage / divergent server data: clamp
// every field to its accepted domain so downstream helpers (e.g.
// getVisibleMonths) never receive garbage like monthRange:'abc' or year 3000.
function normalizeMonthlyOverviewPrefs(saved) {
  const thisYear = new Date().getFullYear();
  // HIGH-27: bound saved/compared years to the app's realistic data window. The
  // old 1900..thisYear+50 range let corrupted storage drive empty queries for
  // years no personal-finance dataset spans. 2000 predates any plausible first
  // transaction; +1 still allows looking one year ahead.
  const isReasonableYear = (y) =>
    Number.isInteger(y) && y >= 2000 && y <= thisYear + 1;
  const src =
    saved && typeof saved === "object" && !Array.isArray(saved) ? saved : {};
  const savedRange = Number(src.monthRange);
  const savedYear = Number(src.year);
  const savedYearA = Number(src.yearA);
  const savedYearB = Number(src.yearB);
  return {
    mode: src.mode === "compare" ? "compare" : "single",
    year: isReasonableYear(savedYear) ? savedYear : thisYear,
    yearA: isReasonableYear(savedYearA) ? savedYearA : thisYear - 1,
    yearB: isReasonableYear(savedYearB) ? savedYearB : thisYear,
    monthRange: VALID_MONTH_RANGES.includes(savedRange)
      ? savedRange
      : smallViewportMonthRange(),
  };
}

const VALID_WEALTH_METRICS = new Set([
  "wealth",
  "balance",
  "investing",
  "goal",
]);

// Require at least one real series (not just "goal"); fall back to ["wealth"].
function normalizeWealthMetrics(saved) {
  const valid = Array.isArray(saved)
    ? saved.filter((m) => VALID_WEALTH_METRICS.has(m))
    : [];
  return valid.some((m) => m !== "goal") ? valid : ["wealth"];
}

function emptyProfilePatchQueue(chain = Promise.resolve()) {
  return {
    timer: null,
    chain,
    dashboardConfig: undefined,
    dashboardPreferences: {},
  };
}

function firstEnabledTab(enabledFeatures) {
  for (const [tab, feature] of Object.entries(TAB_FEATURES)) {
    if (enabledFeatures[feature]) return tab;
  }
  return FALLBACK_TAB;
}

function isTabEnabled(tab, enabledFeatures) {
  const feature = TAB_FEATURES[tab];
  return !feature || !!enabledFeatures[feature];
}

function privacyKey(scope, key) {
  return `${scope}.${key}`;
}

function scrollToTop() {
  if (typeof window === "undefined") return;
  window.scrollTo({ top: 0, left: 0, behavior: "auto" });
}

export {
  CLIENT_CACHE_TTL_MS,
  APPLOCK_BG_MS,
  DEFAULT_PRIVACY_PREFERENCES,
  PRIVACY_REVEAL_MS,
  DEFAULT_ENABLED_FEATURES,
  DEFAULT_TRANSACTION_PREFERENCES,
  TAB_FEATURES,
  FALLBACK_TAB,
  clampAccountingMonthStartDay,
  isoDateLocal,
  accountingMonthStart,
  accountingMonthDateRange,
  accountingMonthLabelForDate,
  currentAccountingMonth,
  getCurrentAccountingMonthDateRange,
  normalizeBorsaFundInput,
  normalizePrivacyPreferences,
  normalizeEnabledFeatures,
  normalizeTransactionPreferences,
  RETIRED_DASH_SECTION_IDS,
  DASH_DEFAULT,
  PROFILE_PATCH_DEBOUNCE_MS,
  cloneDashConfig,
  clearDashboardLocalCache,
  mergeDashConfig,
  VALID_MONTH_RANGES,
  smallViewportMonthRange,
  normalizeMonthlyOverviewPrefs,
  VALID_WEALTH_METRICS,
  normalizeWealthMetrics,
  emptyProfilePatchQueue,
  firstEnabledTab,
  isTabEnabled,
  privacyKey,
  scrollToTop,
};
