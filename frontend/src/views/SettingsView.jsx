import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useApp } from "../context/useApp";
import { API, LONG_FETCH_TIMEOUT_MS } from "../utils/api";
import { filterAmountInput } from "../utils/formatters";
import { useFormatters } from "../utils/useFormatters";
import { buildExportOptions } from "../utils/exportOptions";
import { regroupTargets } from "../utils/allocationGroups";
import Modal from "../components/Modal";
import FieldLabel from "../components/FieldLabel";
import CategorySelect from "../components/CategorySelect";
import { PageHeader, SegmentedControl, ToggleSwitch } from "../components/ui";
import { useDragReorder } from "../components/ui/useDragReorder";
import { logError } from "../utils/logger";
import { REFRESH_REASONS } from "../utils/refreshReasons";
import { isWebAuthnAvailable } from "../utils/webauthn";

const SETTINGS_GROUP_META = {
  import: { key: "data", first: "import", order: 60 },
  export: { key: "data", first: "import", order: 60 },
  extra: { key: "data", first: "import", order: 60 },
  user: { key: "account", first: "user", order: 70 },
  sharing: { key: "account", first: "user", order: 70 },
  general: { key: "preferences", first: "general", order: 80 },
  privacy: { key: "preferences", first: "general", order: 80 },
  dashboard: { key: "preferences", first: "general", order: 80 },
  about: { key: "preferences", first: "general", order: 80 },
};

// Drill-down section body (iOS Settings style): renders its children only
// when the section's navKey is the active page. Navigation happens from the
// root grouped list below; sections sharing a navKey (e.g. import/export/
// extra → "data") stack in JSX order on the same page.
function AccordionSection({
  sectionKey,
  settingsNavItems,
  settingsMenu,
  // eslint-disable-next-line no-unused-vars
  onToggle,
  children,
}) {
  const group = SETTINGS_GROUP_META[sectionKey];
  const navKey = group?.key || sectionKey;
  const item = settingsNavItems.find((i) => i.key === navKey);
  if (!item || settingsMenu !== navKey) return null;
  return <div className="settings-section-body">{children}</div>;
}

// Root page: grouped lists of section links, iOS Settings style, plus the
// Sign Out row and the red Danger zone at the very bottom.
function SettingsRoot({ navItems, onOpen, T, isDemo, viewAs, logout }) {
  const manageKeys = [
    "categories",
    "budget",
    "recurring",
    "allocation",
    "fire",
    "data",
  ];
  const groups = [
    navItems.filter((i) => manageKeys.includes(i.key)),
    navItems.filter((i) => !manageKeys.includes(i.key)),
  ].filter((g) => g.length > 0);
  return (
    <div>
      {groups.map((items, gi) => (
        <div key={gi} className="grouped-list" style={{ marginBottom: 20 }}>
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              data-testid={`settings-root-${item.key}`}
              className="grouped-list__item pressable"
              onClick={() => onOpen(item.key)}
              style={{ width: "100%", textAlign: "left" }}
            >
              <span
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  flex: 1,
                  minWidth: 0,
                }}
              >
                <span style={{ fontSize: 17, width: 24, textAlign: "center" }}>
                  {item.icon}
                </span>
                <span
                  style={{
                    fontSize: 15,
                    fontWeight: 500,
                    color: "var(--fg)",
                  }}
                >
                  {item.label}
                </span>
              </span>
              <span
                aria-hidden="true"
                style={{ color: "var(--fg-faint)", fontSize: 17 }}
              >
                ›
              </span>
            </button>
          ))}
        </div>
      ))}

      {!isDemo && (
        <div className="grouped-list" style={{ marginBottom: 20 }}>
          <button
            type="button"
            data-testid="settings-root-logout"
            className="grouped-list__item pressable"
            onClick={logout}
            style={{ width: "100%", justifyContent: "center" }}
          >
            <span
              style={{
                fontSize: 15,
                fontWeight: 600,
                color: "var(--danger)",
              }}
            >
              {T("logout_button")}
            </span>
          </button>
        </div>
      )}

      {!isDemo && !viewAs && (
        <div style={{ marginBottom: 20 }}>
          <div
            className="grouped-list__title"
            style={{ color: "var(--danger)" }}
          >
            {T("settings_danger_zone", "Danger zone")}
          </div>
          <div
            className="grouped-list"
            style={{ boxShadow: "inset 0 0 0 1px var(--danger-ring)" }}
          >
            <button
              type="button"
              data-testid="settings-root-delete-account"
              className="grouped-list__item pressable"
              onClick={() => onOpen("account")}
              style={{ width: "100%", textAlign: "left" }}
            >
              <span
                style={{
                  fontSize: 15,
                  fontWeight: 600,
                  color: "var(--danger)",
                  flex: 1,
                }}
              >
                {T("account_delete_title", "Delete account")}
              </span>
              <span
                aria-hidden="true"
                style={{ color: "var(--fg-faint)", fontSize: 17 }}
              >
                ›
              </span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Section page header: back chevron + large title.
function SettingsSectionHeader({ label, backLabel, onBack }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <button
        type="button"
        data-testid="settings-back"
        onClick={onBack}
        className="pressable"
        style={{
          background: "none",
          border: 0,
          color: "var(--accent)",
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          padding: "8px 8px 8px 0",
          fontSize: 15,
          fontWeight: 600,
          fontFamily: "inherit",
          minHeight: 44,
        }}
      >
        ‹ {backLabel}
      </button>
      <h1 className="page-title" style={{ margin: 0 }}>
        {label}
      </h1>
    </div>
  );
}

function AllocationTargetInput({ item, apiFetch, fetchAllocationData }) {
  const [value, setValue] = useState(item.target_pct ?? "");

  useEffect(() => {
    setValue(item.target_pct ?? "");
  }, [item.target_pct]);

  const save = async () => {
    const val = parseFloat(value);
    if (isNaN(val) || val < 0) return;
    await apiFetch(`${API}/portfolio/allocation-targets/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        investment_type: item.id,
        target_percent: val,
      }),
    });
    fetchAllocationData();
  };

  return (
    <input
      className="inp"
      type="number"
      min="0"
      max="100"
      step="0.5"
      placeholder="0"
      style={{
        width: 90,
        textAlign: "right",
      }}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={save}
    />
  );
}

function FireSettingsSection({ T, fetchFireGoal }) {
  const { apiFetch } = useApp();
  const defaultForm = {
    user_age: "",
    retirement_age: "",
    withdrawal_rate: "",
    annual_expenses_override: "",
    growth_rate_bear: "",
    growth_rate_base: "",
    growth_rate_bull: "",
    inflation_rate: "",
    net_worth_goal: "",
    model_mode: "dual",
    swr_base: "",
    swr_min: "",
    swr_max: "",
    annual_expenses_retirement: "",
    annual_passive_income_retirement: "",
    expected_real_return: "",
    expected_nominal_return: "",
    annual_contribution: "",
    tax_drag_rate: "",
    target_retirement_age: "",
    life_expectancy: "",
    portfolio_equity_pct: "",
  };
  const [form, setForm] = useState(defaultForm);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    apiFetch(`${API}/portfolio/fire/`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.settings) setForm((s) => ({ ...s, ...data.settings }));
      })
      .catch(() => {});
  }, [apiFetch]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    setSaveError(null);
    const res = await apiFetch(`${API}/portfolio/fire/settings/`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setSaveError(body.error || `Errore ${res.status}`);
      return;
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    fetchFireGoal?.();
  };

  const coreFields = [
    ["fire_user_age", "user_age", "number"],
    ["fire_retirement_age", "retirement_age", "number"],
    ["fire_withdrawal_rate", "withdrawal_rate", "text"],
    ["fire_annual_expenses_override", "annual_expenses_override", "text"],
    ["fire_net_worth_goal", "net_worth_goal", "number"],
  ];

  const advancedFields = [
    ["fire_growth_bear", "growth_rate_bear", "text"],
    ["fire_growth_base", "growth_rate_base", "text"],
    ["fire_growth_bull", "growth_rate_bull", "text"],
    ["fire_inflation", "inflation_rate", "text"],
    ["Model mode (classic|real|dual)", "model_mode", "text"],
    ["SWR base", "swr_base", "text"],
    ["SWR min", "swr_min", "text"],
    ["SWR max", "swr_max", "text"],
    ["Annual expenses retirement (€)", "annual_expenses_retirement", "number"],
    [
      "Passive income retirement (€)",
      "annual_passive_income_retirement",
      "number",
    ],
    ["Expected real return", "expected_real_return", "text"],
    ["Expected nominal return", "expected_nominal_return", "text"],
    ["Annual contribution (€)", "annual_contribution", "number"],
    ["Tax drag rate", "tax_drag_rate", "text"],
    ["Target retirement age", "target_retirement_age", "number"],
    ["Life expectancy", "life_expectancy", "number"],
    ["Portfolio equity %", "portfolio_equity_pct", "number"],
  ];

  return (
    <div>
      <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>
        {T("fire_settings_title")}
      </div>
      <div style={{ fontSize: 12, color: "var(--fg-soft)", marginBottom: 10 }}>
        {T("fire_settings_scope_hint")}
      </div>
      <div
        className="mob-grid-1"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
          gap: 12,
          marginBottom: 16,
        }}
      >
        {coreFields.map(([labelKey, field, type]) => (
          <label
            key={field}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 4,
              fontSize: 13,
              color: "var(--fg-soft)",
            }}
          >
            {labelKey.startsWith("fire_") ? T(labelKey) : labelKey}
            <input
              className="inp"
              type={type}
              value={form[field] ?? ""}
              onChange={(e) => set(field, e.target.value)}
            />
          </label>
        ))}
      </div>
      <button
        className="btn"
        onClick={() => setShowAdvanced((v) => !v)}
        style={{ marginBottom: 12 }}
      >
        {showAdvanced
          ? T("fire_settings_advanced_hide")
          : T("fire_settings_advanced_show")}
      </button>
      {showAdvanced && (
        <div
          className="mob-grid-1"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
            gap: 12,
            marginBottom: 16,
          }}
        >
          {advancedFields.map(([labelKey, field, type]) => (
            <label
              key={field}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 4,
                fontSize: 13,
                color: "var(--fg-soft)",
              }}
            >
              {labelKey.startsWith("fire_") ? T(labelKey) : labelKey}
              <input
                className="inp"
                type={type}
                value={form[field] ?? ""}
                onChange={(e) => set(field, e.target.value)}
              />
            </label>
          ))}
        </div>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button className="btn btn-p" onClick={save}>
          {T("fire_btn_save")}
        </button>
        {saved && (
          <span style={{ fontSize: 13, color: "var(--success)" }}>
            ✓ {T("user_name_saved")}
          </span>
        )}
        {saveError && (
          <span style={{ fontSize: 13, color: "var(--danger)" }}>
            {saveError}
          </span>
        )}
      </div>
    </div>
  );
}

// Biometric app-lock toggle (Face ID / Touch ID). Self-contained via useApp.
function BiometricLockCard() {
  const { T, appLockEnabled, enableAppLock, disableAppLock } = useApp();
  const [available, setAvailable] = useState(null); // null = checking
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    isWebAuthnAvailable().then(setAvailable);
  }, []);

  const onToggle = async (checked) => {
    setError(null);
    setBusy(true);
    try {
      if (checked) await enableAppLock();
      else await disableAppLock();
    } catch (err) {
      // User cancelled the biometric prompt — leave the toggle as it was.
      if (err?.name === "NotAllowedError") {
        // no-op
      } else if (err?.name === "SecurityError") {
        // The RP ID sent by the server doesn't match the current domain
        // (WEBAUTHN_RP_ID/ORIGIN misconfigured in production) — surface a
        // specific message instead of the generic one so it's diagnosable.
        setError(T("applock_error_domain"));
      } else {
        setError(T("applock_error"));
      }
    }
    setBusy(false);
  };

  if (available === false) {
    return (
      <div className="card" style={{ padding: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>
          {T("applock_toggle")}
        </div>
        <div style={{ fontSize: 13, color: "var(--fg-soft)" }}>
          {T("faceid_unavailable")}
        </div>
      </div>
    );
  }

  return (
    <div className="card" style={{ padding: 16 }}>
      <ToggleSwitch
        id="applock-toggle"
        checked={appLockEnabled}
        disabled={busy || available === null}
        onChange={onToggle}
        label={T("applock_toggle")}
      />
      <div
        style={{
          fontSize: 12,
          color: "var(--fg-soft)",
          marginTop: 8,
          lineHeight: 1.35,
        }}
      >
        {T("applock_desc")}
      </div>
      {error && (
        <div style={{ fontSize: 13, color: "var(--danger)", marginTop: 8 }}>
          {error}
        </div>
      )}
    </div>
  );
}

function TabSwipeCard() {
  const { T, tabSwipeEnabled, setTabSwipeEnabled } = useApp();

  return (
    <div className="card" style={{ padding: 16 }}>
      <ToggleSwitch
        id="tab-swipe-toggle"
        checked={tabSwipeEnabled}
        onChange={setTabSwipeEnabled}
        label={T("tab_swipe_toggle")}
      />
      <div
        style={{
          fontSize: 12,
          color: "var(--fg-soft)",
          marginTop: 8,
          lineHeight: 1.35,
        }}
      >
        {T("tab_swipe_desc")}
      </div>
    </div>
  );
}

function UserSection({
  T,
  profile,
  updateProfile,
  changePassword,
  deleteAccount,
  logout,
  isDemo,
  viewAs,
}) {
  const [nameVal, setNameVal] = useState(profile.name ?? "");
  const [nameSaved, setNameSaved] = useState(false);

  const [pwForm, setPwForm] = useState({ old: "", new: "", confirm: "" });
  const [pwError, setPwError] = useState(null);
  const [pwSuccess, setPwSuccess] = useState(false);
  const [pwLoading, setPwLoading] = useState(false);
  const [deleteForm, setDeleteForm] = useState({ password: "", confirm: "" });
  const [deleteError, setDeleteError] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Sync nameVal when profile loads
  useEffect(() => setNameVal(profile.name ?? ""), [profile.name]);

  const saveName = async () => {
    const ok = await updateProfile({ name: nameVal });
    if (ok) {
      setNameSaved(true);
      setTimeout(() => setNameSaved(false), 2000);
    }
  };

  const handlePwSubmit = async (e) => {
    e.preventDefault();
    setPwError(null);
    setPwSuccess(false);
    if (pwForm.new !== pwForm.confirm) {
      setPwError(T("password_change_error_mismatch"));
      return;
    }
    setPwLoading(true);
    const result = await changePassword(pwForm.old, pwForm.new);
    setPwLoading(false);
    if (result.ok) {
      setPwSuccess(true);
      setPwForm({ old: "", new: "", confirm: "" });
    } else {
      setPwError(T(result.errorKey ?? "error_save_failed"));
    }
  };

  const handleDeleteAccount = async (e) => {
    e.preventDefault();
    setDeleteError(null);
    setDeleteLoading(true);
    const result = await deleteAccount(deleteForm.password, deleteForm.confirm);
    setDeleteLoading(false);
    if (!result.ok) setDeleteError(T(result.errorKey ?? "error_save_failed"));
  };

  const fieldStyle = {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    marginBottom: 14,
  };
  const labelStyle = { fontSize: 12, color: "var(--fg-soft)", fontWeight: 500 };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Email — read-only */}
      <div style={fieldStyle}>
        <span style={labelStyle}>{T("user_email")}</span>
        <input
          className="inp"
          value={profile.email ?? ""}
          readOnly
          style={{ opacity: 0.7, cursor: "default" }}
        />
      </div>

      {/* Display name */}
      <div style={fieldStyle}>
        <span style={labelStyle}>{T("user_name")}</span>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            className="inp"
            placeholder={T("user_name_placeholder")}
            value={nameVal}
            onChange={(e) => setNameVal(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && saveName()}
            style={{ flex: 1 }}
          />
          <button
            className="btn btn-p"
            onClick={saveName}
            style={{ whiteSpace: "nowrap" }}
          >
            {nameSaved ? `✓ ${T("user_name_saved")}` : T("btn_save")}
          </button>
        </div>
      </div>

      {/* Change password */}
      <div className="card" style={{ padding: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 14 }}>
          {T("change_password")}
        </div>
        <form
          onSubmit={handlePwSubmit}
          style={{ display: "flex", flexDirection: "column", gap: 10 }}
        >
          <input
            className="inp"
            type="password"
            placeholder={T("current_password")}
            value={pwForm.old}
            onChange={(e) => setPwForm((p) => ({ ...p, old: e.target.value }))}
            autoComplete="current-password"
          />
          <input
            className="inp"
            type="password"
            placeholder={T("new_password")}
            value={pwForm.new}
            onChange={(e) => setPwForm((p) => ({ ...p, new: e.target.value }))}
            autoComplete="new-password"
          />
          <input
            className="inp"
            type="password"
            placeholder={T("confirm_password")}
            value={pwForm.confirm}
            onChange={(e) =>
              setPwForm((p) => ({ ...p, confirm: e.target.value }))
            }
            autoComplete="new-password"
          />
          {pwError && (
            <div style={{ fontSize: 13, color: "var(--danger)" }}>
              {pwError}
            </div>
          )}
          {pwSuccess && (
            <div style={{ fontSize: 13, color: "var(--success)" }}>
              {T("password_change_success")}
            </div>
          )}
          <button
            type="submit"
            className="btn btn-p"
            disabled={
              pwLoading || !pwForm.old || !pwForm.new || !pwForm.confirm
            }
            style={{ alignSelf: "flex-start" }}
          >
            {pwLoading ? "…" : T("change_password")}
          </button>
        </form>
      </div>

      {/* Biometric app lock */}
      {!isDemo && !viewAs && <BiometricLockCard />}

      {/* Tab swipe navigation toggle */}
      <TabSwipeCard />

      {!isDemo && !viewAs && (
        <div
          className="card"
          style={{ padding: 16, borderColor: "var(--danger-soft)" }}
        >
          <div
            style={{
              fontSize: 15,
              fontWeight: 600,
              marginBottom: 8,
              color: "var(--danger)",
            }}
          >
            {T("account_delete_title", "Delete account")}
          </div>
          <div
            style={{ fontSize: 13, color: "var(--fg-soft)", marginBottom: 14 }}
          >
            {T(
              "account_delete_desc",
              "This permanently deletes your account and all associated data.",
            )}
          </div>
          <form
            onSubmit={handleDeleteAccount}
            style={{ display: "flex", flexDirection: "column", gap: 10 }}
          >
            <input
              className="inp"
              type="password"
              placeholder={T("current_password")}
              value={deleteForm.password}
              onChange={(e) =>
                setDeleteForm((p) => ({ ...p, password: e.target.value }))
              }
              autoComplete="current-password"
            />
            <input
              className="inp"
              placeholder={T(
                "account_delete_confirm_placeholder",
                "Type DELETE",
              )}
              value={deleteForm.confirm}
              onChange={(e) =>
                setDeleteForm((p) => ({ ...p, confirm: e.target.value }))
              }
            />
            {deleteError && (
              <div style={{ fontSize: 13, color: "var(--danger)" }}>
                {deleteError}
              </div>
            )}
            <button
              type="submit"
              className="btn btn-r"
              disabled={
                deleteLoading ||
                !deleteForm.password ||
                deleteForm.confirm !== "DELETE"
              }
              style={{ alignSelf: "flex-start" }}
            >
              {deleteLoading
                ? "…"
                : T("account_delete_button", "Delete account")}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

export default function SettingsView() {
  const csvFileInputRef = useRef(null);
  const { formatEur } = useFormatters();
  const {
    tab,
    setTab,
    lang,
    setLang,
    themePreference,
    setTheme,
    T,
    MONTHS,
    dashConfig,
    toggleDashCard,
    moveDashCard,
    reorderDashCards,
    resetDashConfig,
    expenses,
    trendExpenses,
    trendIncomes,
    categories,
    assets,
    summary,
    s,
    expSummary,
    investmentTypes,
    contributionSources,
    showInvTypeModal,
    setShowInvTypeModal,
    invTypeForm,
    setInvTypeForm,
    allocationData,
    budgets,
    editingBudgetCat,
    setEditingBudgetCat,
    budgetInputVal,
    setBudgetInputVal,
    recurringExpenses,
    showRecurringModal,
    editingRecurringId,
    recurringForm,
    setRecurringForm,
    recurringError,
    recurringSaving,
    generateRecurringMsg,
    recurringInvestmentPlans,
    showPacModal,
    editingPacId,
    pacForm,
    setPacForm,
    pacError,
    pacSaving,
    generatePacMsg,
    filterMonth,
    setFilterMonth,
    filterYear,
    setFilterYear,
    filterCat,
    setFilterCat,
    viewMode,
    setViewMode,
    cashflowDir,
    setCashflowDir,
    refreshing,
    refreshMsg,
    showExpModal,
    editingExpenseId,
    expError,
    modalDir,
    setModalDir,
    pieHover,
    setPieHover,
    showAssetModal,
    editingAssetId,
    assetError,
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
    setDemoError,
    setDemoLoading,
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
    demoConfirm,
    setDemoConfirm,
    demoUnderstood,
    setDemoUnderstood,
    deleteCatFlow,
    setDeleteCatFlow,
    deleteInvTypeFlow,
    setDeleteInvTypeFlow,
    txPanel,
    assetTransactions,
    txAddMode,
    setTxAddMode,
    editingTxId,
    txDeleteConfirm,
    setTxDeleteConfirm,
    txForm,
    setTxForm,
    txLoading,
    txError,
    setTxError,
    txAutofilling,
    tickerQuery,
    tickerResults,
    tickerLoading,
    showTickerDrop,
    setShowTickerDrop,
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
    expForm,
    setExpForm,
    assetForm,
    setAssetForm,
    catForm,
    setCatForm,
    portfolioHistory,
    wealthTimeRange,
    setWealthTimeRange,
    filteredExpenses,
    rootCategoriesForDir,
    rootExpenseCategories,
    bankAccounts,
    investments,
    selectedInvType,
    kpiData,
    monthlyTrend,
    settingsNavItems,
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
    openExpenseModal,
    closeExpenseModal,
    submitExpense,
    deleteExpense,
    openAssetEdit,
    closeAssetModal,
    saveAsset,
    deleteAsset,
    refreshPrices,
    openTxPanel,
    closeTxPanel,
    submitTxAdd,
    autofillTxPrice,
    openEditTx,
    deleteTx,
    handleTickerInput,
    selectTicker,
    addCategory,
    openDeleteCatFlow,
    confirmDeleteCategory,
    openAddMain,
    openAddSub,
    openEditCat,
    toggleExpandCat,
    editingInvTypeId,
    addInvestmentType,
    openDeleteInvTypeFlow,
    confirmDeleteInvType,
    openEditInvType,
    closeInvTypeModal,
    resetTransactions,
    resetPortfolio,
    loadDemoData,
    handleCSVUpload,
    handleCsvSepChange,
    previewImportCSV,
    doImportCSV,
    apiFetch,
    fetchFireGoal,
    decimalSeparator,
    updateDecimalSeparator,
    profile,
    updateProfile,
    enabledFeatures,
    updateEnabledFeature,
    isFeatureEnabled,
    transactionPrefs,
    updateTransactionPreference,
    accountingMonthStartDay,
    updateAccountingMonthStartDay,
    accountingMonthDateRange,
    currentAccountingMonth,
    updatePrivacyPreference,
    isPrivacyPreferenceEnabled,
    changePassword,
    deleteAccount,
    logout,
    isDemo,
    viewAs,
  } = useApp();

  const toggle = useCallback(
    (key) => setSettingsMenu((prev) => (prev === key ? null : key)),
    [setSettingsMenu],
  );

  // Drill-down navigation: each page change starts at the top.
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [settingsMenu]);

  // Feature F — Data Export
  const [exportingType, setExportingType] = useState(null);
  const [exportError, setExportError] = useState(null);
  const [accountingSaved, setAccountingSaved] = useState(false);

  const downloadExport = async (type) => {
    if (isDemo) {
      setExportError(T("export_demo_blocked"));
      return;
    }
    if (viewAs) {
      setExportError(T("export_viewas_blocked"));
      return;
    }
    setExportingType(type);
    setExportError(null);
    try {
      const res = await apiFetch(`${API}/export/?type=${type}`, {
        timeoutMs: LONG_FETCH_TIMEOUT_MS,
      });
      if (!res.ok) {
        let msg = `${T("export_error")} (${res.status})`;
        try {
          const data = await res.json();
          if (data?.error === "demo_export_disabled")
            msg = T("export_demo_blocked");
          else if (data?.error === "export_viewas_disabled")
            msg = T("export_viewas_blocked");
        } catch {
          /* non-JSON body — keep generic message */
        }
        setExportError(msg);
        return;
      }
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") || "";
      const match = disposition.match(/filename="?([^";]+)"?/i);
      const today = new Date().toISOString().slice(0, 10);
      const fallback =
        type === "all"
          ? `finnet_export_${today}.zip`
          : `finnet_${type}_${today}.csv`;
      const filename = match ? match[1] : fallback;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      // Safari can revoke the URL before the download actually starts.
      setTimeout(() => URL.revokeObjectURL(url), 100);
    } catch (e) {
      logError("downloadExport:", e);
      setExportError(T("export_error"));
    } finally {
      setExportingType(null);
    }
  };

  const [invTypeContext, setInvTypeContext] = useState("investments");
  const [deleteRecurringTarget, setDeleteRecurringTarget] = useState(null);
  const [deletePacTarget, setDeletePacTarget] = useState(null);
  const [showContributionSourceModal, setShowContributionSourceModal] =
    useState(false);
  const [editingContributionSourceId, setEditingContributionSourceId] =
    useState(null);
  const [contributionSourceForm, setContributionSourceForm] = useState({
    name: "",
    sort_order: "0",
    is_active: true,
  });
  const [contributionSourceError, setContributionSourceError] = useState("");
  const [deleteContributionSourceFlow, setDeleteContributionSourceFlow] =
    useState(null);
  const appVersion =
    typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "dev";
  const dashLabels = {
    wealth_trend: T("dash_wealth_trend"),
    kpi_cards: T("dash_kpi_cards"),
    monthly_overview: T("dash_monthly_overview"),
    budget_progress: T("dash_budget_progress"),
    expenses_pie: T("cash_flow_category"),
    expenses_trend: T("dash_expenses_trend"),
    portfolio_alloc: T("dash_portfolio_alloc"),
    currency_exposure: T("dash_currency_exposure"),
    recurring_overview: T("dash_recurring_overview"),
  };
  const featureItems = useMemo(
    () => [
      {
        key: "dashboard",
        label: T("tab_dashboard"),
        description: T("feature_dashboard_desc"),
      },
      {
        key: "cashflow",
        label: T("tab_cashflow"),
        description: T("feature_cashflow_desc"),
      },
      {
        key: "accounts",
        label: T("tab_accounts"),
        description: T("feature_accounts_desc"),
      },
      {
        key: "investments",
        label: T("tab_investments"),
        description: T("feature_investments_desc"),
      },
      {
        key: "fire",
        label: T("tab_fire"),
        description: T("feature_fire_desc"),
      },
    ],
    [T],
  );
  const categoryTabs = useMemo(
    () =>
      [
        ["expense", T("expense_cats"), "var(--danger)", "cashflow"],
        ["income", T("income_cats"), "var(--success)", "cashflow"],
        ["investments", T("investment_types"), "var(--accent)", "investments"],
        ["account_types", T("account_types"), "var(--accent)", "accounts"],
      ].filter(([, , , feature]) => isFeatureEnabled(feature)),
    [T, isFeatureEnabled],
  );
  const importTypeOptions = useMemo(
    () =>
      [
        isFeatureEnabled("cashflow") && {
          key: "cashflow",
          label: T("import_type_cashflow"),
        },
        isFeatureEnabled("investments") && {
          key: "assets",
          label: T("import_type_assets"),
        },
      ].filter(Boolean),
    [T, isFeatureEnabled],
  );
  const exportOptions = useMemo(
    () => buildExportOptions({ isFeatureEnabled, T }),
    [T, isFeatureEnabled],
  );

  useEffect(() => {
    if (
      categoryTabs.length > 0 &&
      !categoryTabs.some(([type]) => type === settingsCatType)
    ) {
      setSettingsCatType(categoryTabs[0][0]);
    }
  }, [categoryTabs, settingsCatType, setSettingsCatType]);

  useEffect(() => {
    if (
      importTypeOptions.length > 0 &&
      !importTypeOptions.some((opt) => opt.key === csvImportType)
    ) {
      setCsvImportType(importTypeOptions[0].key);
      setCsvMap({});
      setCsvImportPreview(null);
    }
  }, [
    importTypeOptions,
    csvImportType,
    setCsvImportType,
    setCsvMap,
    setCsvImportPreview,
  ]);

  useEffect(() => {
    if (
      settingsMenu &&
      !settingsNavItems.some((item) => item.key === settingsMenu)
    ) {
      setSettingsMenu("preferences");
    }
  }, [settingsMenu, settingsNavItems, setSettingsMenu]);

  const openNewInvType = (context) => {
    setInvTypeContext(context);
    setInvTypeForm((p) => ({
      ...p,
      is_bank_account: context === "account_types",
      supports_contribution_source: false,
    }));
    setShowInvTypeModal(true);
  };

  const handleEditInvType = (invType) => {
    setInvTypeContext(
      invType.is_bank_account ? "account_types" : "investments",
    );
    openEditInvType(invType);
  };

  const openNewContributionSource = () => {
    setEditingContributionSourceId(null);
    setContributionSourceForm({
      name: "",
      sort_order: String(contributionSources.length),
      is_active: true,
    });
    setContributionSourceError("");
    setShowContributionSourceModal(true);
  };

  const openEditContributionSource = (source) => {
    setEditingContributionSourceId(source.id);
    setContributionSourceForm({
      name: source.name || "",
      sort_order: String(source.sort_order ?? 0),
      is_active: source.is_active !== false,
    });
    setContributionSourceError("");
    setShowContributionSourceModal(true);
  };

  const closeContributionSourceModal = () => {
    setShowContributionSourceModal(false);
    setEditingContributionSourceId(null);
    setContributionSourceError("");
    setContributionSourceForm({
      name: "",
      sort_order: "0",
      is_active: true,
    });
  };

  const saveContributionSource = async () => {
    if (isDemo) {
      setContributionSourceError(T("demo_modal_body"));
      return;
    }
    if (!contributionSourceForm.name.trim()) {
      setContributionSourceError(T("error_name_required"));
      return;
    }
    const isEdit = editingContributionSourceId !== null;
    const body = {
      name: contributionSourceForm.name.trim(),
      sort_order: parseInt(contributionSourceForm.sort_order || "0", 10) || 0,
      is_active: contributionSourceForm.is_active,
    };
    try {
      const res = await apiFetch(
        isEdit
          ? `${API}/portfolio/contribution-sources/${editingContributionSourceId}/`
          : `${API}/portfolio/contribution-sources/`,
        {
          method: isEdit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setContributionSourceError(
          Object.values(err).flat().join(" ") || T("error_save_failed"),
        );
        return;
      }
      closeContributionSourceModal();
      refreshAfter(
        isEdit
          ? REFRESH_REASONS.CONTRIBUTION_SOURCE_UPDATED
          : REFRESH_REASONS.CONTRIBUTION_SOURCE_CREATED,
      );
    } catch {
      setContributionSourceError(T("error_network"));
    }
  };

  const openDeleteContributionSourceFlow = (source) =>
    setDeleteContributionSourceFlow({
      source,
      txChoice: null,
      txTarget: null,
    });

  const confirmDeleteContributionSource = async () => {
    if (!deleteContributionSourceFlow) return;
    if (isDemo) return;
    const { source, txChoice, txTarget } = deleteContributionSourceFlow;
    const res = await apiFetch(
      `${API}/portfolio/contribution-sources/${source.id}/`,
      {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transactions_action: txChoice || "null",
          reassign_to: txTarget || null,
        }),
      },
    );
    if (!res.ok) return;
    setDeleteContributionSourceFlow(null);
    refreshAfter(REFRESH_REASONS.CONTRIBUTION_SOURCE_DELETED);
    fetchContributionSources();
  };

  const privacyGroups = [
    {
      title: T("privacy_dashboard"),
      scope: "dashboard",
      feature: "dashboard",
      items: [["net_worth", T("privacy_net_worth")]],
    },
    {
      title: T("privacy_cashflow"),
      scope: "cashflow",
      feature: "cashflow",
      items: [
        ["income", T("privacy_income")],
        ["outcome", T("privacy_outcome")],
        ["deficit", T("privacy_deficit")],
      ],
    },
    {
      title: T("privacy_accounts"),
      scope: "accounts",
      feature: "accounts",
      items: [
        ["balance", T("privacy_balance")],
        ["investments", T("privacy_investments")],
        ["income", T("privacy_income")],
        ["outcome", T("privacy_outcome")],
        ["account_values", T("privacy_account_values")],
      ],
    },
    {
      title: T("privacy_investments"),
      scope: "investments",
      feature: "investments",
      items: [
        ["total_value", T("privacy_total_value")],
        ["total_gain", T("privacy_total_gain")],
        ["asset_values", T("privacy_asset_values")],
        ["transactions", T("privacy_transactions")],
      ],
    },
  ].filter((group) => isFeatureEnabled(group.feature));

  const accordionProps = {
    settingsNavItems,
    settingsMenu,
    onToggle: toggle,
  };
  const isDashConfigFeatureEnabled = (id) => {
    const anyWealthFeature =
      isFeatureEnabled("accounts") || isFeatureEnabled("investments");
    const requirements = {
      wealth_trend: anyWealthFeature,
      monthly_overview: anyWealthFeature || isFeatureEnabled("cashflow"),
      expenses_pie: isFeatureEnabled("cashflow"),
      expenses_trend: isFeatureEnabled("cashflow"),
      budget_progress: isFeatureEnabled("cashflow"),
      recurring_overview: isFeatureEnabled("cashflow"),
      portfolio_alloc: isFeatureEnabled("investments"),
      currency_exposure: anyWealthFeature,
    };
    return requirements[id] ?? true;
  };
  const visibleDashCards = dashConfig.filter((c) =>
    isDashConfigFeatureEnabled(c.id),
  );
  const dashReorder = useDragReorder({
    count: visibleDashCards.length,
    rowHeight: 56,
    onCommit: (from, to) => {
      const ids = visibleDashCards.map((c) => c.id);
      const [moved] = ids.splice(from, 1);
      ids.splice(to, 0, moved);
      reorderDashCards(ids);
    },
  });

  return (
    <>
      <div style={{ display: "flex", flexDirection: "column" }}>
        {settingsMenu == null ? (
          <>
            <PageHeader title={T("tab_settings")} />
            <SettingsRoot
              navItems={settingsNavItems}
              onOpen={(key) => setSettingsMenu(key)}
              T={T}
              isDemo={isDemo}
              viewAs={viewAs}
              logout={logout}
            />
          </>
        ) : (
          <SettingsSectionHeader
            label={
              settingsNavItems.find((i) => i.key === settingsMenu)?.label || ""
            }
            backLabel={T("tab_settings")}
            onBack={() => setSettingsMenu(null)}
          />
        )}
        {/* ---- Categories section ---- */}
        <AccordionSection sectionKey="categories" {...accordionProps}>
          {
            <div>
              <div
                style={{
                  fontSize: 13,
                  color: "var(--fg-soft)",
                  marginBottom: 16,
                }}
              >
                {T("manage_categories")}
              </div>

              {/* Tabs: Expense | Income | Investments | Account Types */}
              <div
                className="row"
                style={{
                  gap: 6,
                  marginBottom: 20,
                  flexWrap: "wrap",
                }}
              >
                <SegmentedControl
                  options={categoryTabs.map(([type, label]) => ({
                    value: type,
                    label,
                  }))}
                  value={settingsCatType}
                  onChange={setSettingsCatType}
                />
              </div>

              {/* F5: Investment types management */}
              {settingsCatType === "investments" &&
                (() => {
                  const filtered = investmentTypes.filter(
                    (t) => !t.is_bank_account,
                  );
                  return (
                    <div>
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 10,
                        }}
                      >
                        {filtered.map((invType) => (
                          <div
                            key={invType.id}
                            className="card"
                            style={{ padding: 16 }}
                          >
                            <div className="between">
                              <div
                                className="row"
                                style={{
                                  alignItems: "center",
                                  gap: 10,
                                  cursor: "pointer",
                                  flex: 1,
                                }}
                                onClick={() => handleEditInvType(invType)}
                              >
                                <div
                                  style={{
                                    width: 32,
                                    height: 32,
                                    borderRadius: 9,
                                    background: `${invType.color}22`,
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    fontSize: 16,
                                    flexShrink: 0,
                                  }}
                                >
                                  {invType.icon}
                                </div>
                                <div
                                  style={{
                                    width: 10,
                                    height: 10,
                                    borderRadius: "50%",
                                    background: invType.color,
                                    flexShrink: 0,
                                  }}
                                />
                                <div>
                                  <div
                                    style={{
                                      fontSize: 14,
                                      fontWeight: 600,
                                    }}
                                  >
                                    {invType.name}
                                  </div>
                                  <div
                                    style={{
                                      fontSize: 11,
                                      color: "var(--fg-soft)",
                                      marginTop: 1,
                                    }}
                                  >
                                    {invType.asset_count || 0} {T("assets")}
                                    {invType.supports_ticker ? " · ticker" : ""}
                                    {invType.supports_contribution_source
                                      ? ` · ${T("contribution_source_short")}`
                                      : ""}
                                    {invType.is_liquid_default
                                      ? ` · ${T("liquid")}`
                                      : ` · ${T("illiquid")}`}
                                  </div>
                                </div>
                              </div>
                              <button
                                className="btn btn-g btn-sm"
                                onClick={() => openDeleteInvTypeFlow(invType)}
                                style={{
                                  color: "var(--danger)",
                                  padding: "5px 8px",
                                }}
                              >
                                ×
                              </button>
                            </div>
                          </div>
                        ))}
                        {filtered.length === 0 && (
                          <div
                            style={{
                              textAlign: "center",
                              color: "var(--fg-soft)",
                              fontSize: 13,
                              padding: "30px 0",
                            }}
                          >
                            {T("no_inv_types")}
                          </div>
                        )}
                      </div>
                      <button
                        className="btn btn-g"
                        style={{
                          width: "100%",
                          marginTop: 14,
                          padding: "12px",
                        }}
                        onClick={() => openNewInvType("investments")}
                      >
                        + {T("add_investment_type")}
                      </button>
                      <div style={{ marginTop: 22 }}>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 12,
                            marginBottom: 10,
                          }}
                        >
                          <div
                            style={{
                              fontSize: 14,
                              fontWeight: 700,
                              color: "var(--fg)",
                            }}
                          >
                            {T("contribution_sources")}
                          </div>
                          <button
                            className="btn btn-g btn-sm"
                            onClick={openNewContributionSource}
                          >
                            + {T("add_contribution_source")}
                          </button>
                        </div>
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 10,
                          }}
                        >
                          {contributionSources.map((source) => (
                            <div
                              key={source.id}
                              className="card"
                              style={{ padding: 14 }}
                            >
                              <div className="between">
                                <div
                                  style={{
                                    cursor: "pointer",
                                    minWidth: 0,
                                    flex: 1,
                                  }}
                                  onClick={() =>
                                    openEditContributionSource(source)
                                  }
                                >
                                  <div
                                    style={{
                                      fontSize: 14,
                                      fontWeight: 600,
                                      color:
                                        source.is_active === false
                                          ? "var(--fg-soft)"
                                          : "var(--fg)",
                                    }}
                                  >
                                    {source.name}
                                  </div>
                                  <div
                                    style={{
                                      fontSize: 11,
                                      color: "var(--fg-soft)",
                                      marginTop: 2,
                                    }}
                                  >
                                    {source.transaction_count || 0}{" "}
                                    {T("transactions")} ·{" "}
                                    {source.asset_count || 0} {T("assets")}
                                    {source.is_active === false
                                      ? ` · ${T("inactive")}`
                                      : ""}
                                  </div>
                                </div>
                                <button
                                  className="btn btn-g btn-sm"
                                  onClick={() =>
                                    openDeleteContributionSourceFlow(source)
                                  }
                                  style={{
                                    color: "var(--danger)",
                                    padding: "5px 8px",
                                  }}
                                >
                                  ×
                                </button>
                              </div>
                            </div>
                          ))}
                          {contributionSources.length === 0 && (
                            <div
                              style={{
                                textAlign: "center",
                                color: "var(--fg-soft)",
                                fontSize: 13,
                                padding: "24px 0",
                              }}
                            >
                              {T("no_contribution_sources")}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })()}

              {/* Account Types management */}
              {settingsCatType === "account_types" &&
                (() => {
                  const filtered = investmentTypes.filter(
                    (t) => t.is_bank_account,
                  );
                  return (
                    <div>
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 10,
                        }}
                      >
                        {filtered.map((invType) => (
                          <div
                            key={invType.id}
                            className="card"
                            style={{ padding: 16 }}
                          >
                            <div className="between">
                              <div
                                className="row"
                                style={{
                                  alignItems: "center",
                                  gap: 10,
                                  cursor: "pointer",
                                  flex: 1,
                                }}
                                onClick={() => handleEditInvType(invType)}
                              >
                                <div
                                  style={{
                                    width: 32,
                                    height: 32,
                                    borderRadius: 9,
                                    background: `${invType.color}22`,
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    fontSize: 16,
                                    flexShrink: 0,
                                  }}
                                >
                                  {invType.icon}
                                </div>
                                <div
                                  style={{
                                    width: 10,
                                    height: 10,
                                    borderRadius: "50%",
                                    background: invType.color,
                                    flexShrink: 0,
                                  }}
                                />
                                <div>
                                  <div
                                    style={{
                                      fontSize: 14,
                                      fontWeight: 600,
                                    }}
                                  >
                                    {invType.name}
                                  </div>
                                  <div
                                    style={{
                                      fontSize: 11,
                                      color: "var(--fg-soft)",
                                      marginTop: 1,
                                    }}
                                  >
                                    {invType.asset_count || 0} {T("assets")}
                                    {invType.is_liquid_default
                                      ? ` · ${T("liquid")}`
                                      : ` · ${T("illiquid")}`}
                                  </div>
                                </div>
                              </div>
                              <button
                                className="btn btn-g btn-sm"
                                onClick={() => openDeleteInvTypeFlow(invType)}
                                style={{
                                  color: "var(--danger)",
                                  padding: "5px 8px",
                                }}
                              >
                                ×
                              </button>
                            </div>
                          </div>
                        ))}
                        {filtered.length === 0 && (
                          <div
                            style={{
                              textAlign: "center",
                              color: "var(--fg-soft)",
                              fontSize: 13,
                              padding: "30px 0",
                            }}
                          >
                            {T("no_account_types")}
                          </div>
                        )}
                      </div>
                      <button
                        className="btn btn-g"
                        style={{
                          width: "100%",
                          marginTop: 14,
                          padding: "12px",
                        }}
                        onClick={() => openNewInvType("account_types")}
                      >
                        + {T("add_account_type")}
                      </button>
                    </div>
                  );
                })()}

              {/* Expense / Income categories */}
              {(settingsCatType === "expense" ||
                settingsCatType === "income") && (
                <div>
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 10,
                    }}
                  >
                    {categories
                      .filter(
                        (c) => !c.parent && c.category_type === settingsCatType,
                      )
                      .map((cat) => {
                        const subs = categories.filter(
                          (c) => c.parent === cat.id,
                        );
                        const isExpanded = expandedCats.has(cat.id);
                        return (
                          <div
                            key={cat.id}
                            className="card"
                            style={{ padding: 16 }}
                          >
                            {/* Header categoria principale */}
                            <div className="between">
                              <div
                                className="row"
                                style={{
                                  alignItems: "center",
                                  gap: 10,
                                  cursor: "pointer",
                                  flex: 1,
                                }}
                                onClick={() => openEditCat(cat)}
                              >
                                <div
                                  style={{
                                    width: 32,
                                    height: 32,
                                    borderRadius: 9,
                                    background: `${cat.color}22`,
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    fontSize: 16,
                                    flexShrink: 0,
                                  }}
                                >
                                  {cat.icon}
                                </div>
                                <div>
                                  <div
                                    style={{
                                      fontSize: 14,
                                      fontWeight: 600,
                                    }}
                                  >
                                    {cat.name}
                                  </div>
                                  <div
                                    style={{
                                      fontSize: 11,
                                      color: "var(--fg-soft)",
                                      marginTop: 1,
                                    }}
                                  >
                                    {(cat.expense_count || 0) +
                                      (cat.subcategory_expense_count || 0)}{" "}
                                    {T("transactions")}
                                    {subs.length > 0 && (
                                      <span
                                        style={{
                                          marginLeft: 6,
                                          background: "var(--rule)",
                                          borderRadius: 20,
                                          padding: "1px 6px",
                                        }}
                                      >
                                        {subs.length} {T("subcategories")}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                              <div
                                className="row"
                                style={{
                                  gap: 6,
                                }}
                              >
                                <button
                                  className="btn btn-g btn-sm"
                                  onClick={() => openAddSub(cat)}
                                  style={{
                                    fontSize: 11,
                                  }}
                                >
                                  {T("add_sub")}
                                </button>
                                {subs.length > 0 && (
                                  <button
                                    className="btn btn-g btn-sm"
                                    onClick={() => toggleExpandCat(cat.id)}
                                    style={{
                                      padding: "5px 8px",
                                      fontSize: 12,
                                    }}
                                  >
                                    {isExpanded ? "▼" : "▶"}
                                  </button>
                                )}
                                <button
                                  className="btn btn-g btn-sm"
                                  onClick={() => openDeleteCatFlow(cat)}
                                  style={{
                                    color: "var(--danger)",
                                    padding: "5px 8px",
                                  }}
                                >
                                  ×
                                </button>
                              </div>
                            </div>

                            {/* F2: Subcategories only shown when expanded */}
                            {subs.length > 0 && isExpanded && (
                              <div
                                style={{
                                  marginTop: 12,
                                  paddingTop: 12,
                                  borderTop: "1px solid var(--card-inset)",
                                }}
                              >
                                {subs.map((sub) => (
                                  <div key={sub.id} className="sub-item">
                                    <div
                                      className="row"
                                      style={{
                                        alignItems: "center",
                                        gap: 8,
                                        cursor: "pointer",
                                        flex: 1,
                                      }}
                                      onClick={() => openEditCat(sub)}
                                    >
                                      <span
                                        style={{
                                          color: "var(--accent)",
                                          fontSize: 12,
                                        }}
                                      >
                                        ↳
                                      </span>
                                      <div
                                        style={{
                                          width: 8,
                                          height: 8,
                                          borderRadius: "50%",
                                          background: sub.color,
                                          flexShrink: 0,
                                        }}
                                      />
                                      <span
                                        style={{
                                          fontSize: 13,
                                        }}
                                      >
                                        {sub.icon} {sub.name}
                                      </span>
                                      {sub.expense_count > 0 && (
                                        <span
                                          style={{
                                            fontSize: 11,
                                            color: "var(--fg-soft)",
                                          }}
                                        >
                                          ({sub.expense_count})
                                        </span>
                                      )}
                                    </div>
                                    <div
                                      className="row"
                                      style={{
                                        gap: 5,
                                      }}
                                    >
                                      <button
                                        className="btn btn-g btn-sm"
                                        onClick={() => openDeleteCatFlow(sub)}
                                        style={{
                                          color: "var(--danger)",
                                          padding: "3px 7px",
                                          fontSize: 13,
                                        }}
                                      >
                                        ×
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}

                    {categories.filter(
                      (c) => !c.parent && c.category_type === settingsCatType,
                    ).length === 0 && (
                      <div
                        style={{
                          textAlign: "center",
                          color: "var(--fg-soft)",
                          fontSize: 13,
                          padding: "30px 0",
                        }}
                      >
                        {settingsCatType === "expense"
                          ? T("no_expense_cats")
                          : T("no_income_cats")}
                      </div>
                    )}
                  </div>

                  <button
                    className="btn btn-g"
                    style={{
                      width: "100%",
                      marginTop: 14,
                      padding: "12px",
                    }}
                    onClick={() => openAddMain(settingsCatType)}
                  >
                    +{" "}
                    {settingsCatType === "expense"
                      ? T("add_expense_cat")
                      : T("add_income_cat")}
                  </button>
                </div>
              )}
            </div>
          }
        </AccordionSection>

        {/* ---- Import section ---- */}
        <AccordionSection sectionKey="import" {...accordionProps}>
          {
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 14,
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: 16,
                    fontWeight: 600,
                    marginBottom: 6,
                  }}
                >
                  {T("import_title")}
                </div>
                <div style={{ fontSize: 13, color: "var(--fg-soft)" }}>
                  {T("import_desc")}
                </div>
              </div>

              {importTypeOptions.length > 0 ? (
                <>
                  {/* Card 0: Dataset type selector (Feature G) */}
                  <div className="card">
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 600,
                        marginBottom: 10,
                      }}
                    >
                      {T("import_type_label")}
                    </div>
                    <div
                      className="row"
                      style={{
                        flexWrap: "wrap",
                        gap: 6,
                        background: "var(--rule-soft)",
                        borderRadius: 8,
                        padding: 3,
                      }}
                    >
                      {importTypeOptions.map((opt) => {
                        const active = csvImportType === opt.key;
                        return (
                          <button
                            key={opt.key}
                            onClick={() => {
                              setCsvImportType(opt.key);
                              setCsvMap({});
                              setCsvImportPreview(null);
                            }}
                            style={{
                              flex: "1 1 auto",
                              border: "none",
                              background: active
                                ? "var(--card-bg)"
                                : "transparent",
                              color: active ? "var(--fg)" : "var(--fg-soft)",
                              fontSize: 12,
                              fontWeight: active ? 600 : 500,
                              padding: "6px 12px",
                              borderRadius: 6,
                              cursor: "pointer",
                              boxShadow: active ? "var(--shadow-soft)" : "none",
                            }}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Card 1: Upload */}
                  <div className="card">
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 600,
                        marginBottom: 12,
                      }}
                    >
                      {T("upload_file")}
                    </div>
                    <input
                      ref={csvFileInputRef}
                      type="file"
                      accept=".csv"
                      onChange={handleCSVUpload}
                      style={{ display: "none" }}
                    />
                    <button
                      type="button"
                      className="btn"
                      onClick={() => csvFileInputRef.current?.click()}
                      style={{ marginBottom: 14 }}
                    >
                      {T("upload_file")}
                    </button>
                    <div
                      style={{
                        fontSize: 12,
                        color: "var(--fg-soft)",
                        marginBottom: 10,
                      }}
                    >
                      {csvFile
                        ? `${T("csv_file_selected")}: ${csvFile.name}`
                        : T("csv_no_file_selected")}
                    </div>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                      }}
                    >
                      <span
                        style={{
                          fontSize: 13,
                          color: "var(--fg-soft)",
                        }}
                      >
                        {T("separator")}:
                      </span>
                      {[";", ","].map((sep) => (
                        <button
                          key={sep}
                          onClick={() => handleCsvSepChange(sep)}
                          style={{
                            padding: "5px 14px",
                            borderRadius: 8,
                            cursor: "pointer",
                            border: "1px solid",
                            fontFamily: "var(--font-mono)",
                            fontSize: 14,
                            fontWeight: 600,
                            transition: "all 0.15s",
                            background:
                              csvSep === sep
                                ? "var(--accent-ring)"
                                : "var(--card-inset)",
                            color:
                              csvSep === sep
                                ? "var(--accent)"
                                : "var(--fg-soft)",
                            borderColor:
                              csvSep === sep
                                ? "var(--accent-ring)"
                                : "var(--rule)",
                          }}
                        >
                          {sep}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Card 2: Column Mapping (only if parsed) */}
                  {csvParsed &&
                    (() => {
                      const SCHEMAS = {
                        cashflow: [
                          {
                            field: "type",
                            label: T("import_field_type"),
                            required: false,
                          },
                          {
                            field: "date",
                            label: T("import_field_date"),
                            required: true,
                          },
                          {
                            field: "description",
                            label: T("import_field_description"),
                            required: false,
                          },
                          {
                            field: "amount",
                            label: T("import_field_amount"),
                            required: true,
                          },
                          {
                            field: "category_name",
                            label: T("import_field_category_column"),
                            required: true,
                          },
                          {
                            field: "linked_asset_name",
                            label: T("import_field_account"),
                            required: true,
                          },
                          {
                            field: "is_verified",
                            label: T("import_field_verified"),
                            required: false,
                          },
                        ],
                        assets: [
                          {
                            field: "name",
                            label: T("field_name"),
                            required: false,
                          },
                          {
                            field: "isin",
                            label: T("field_isin"),
                            required: false,
                          },
                          {
                            field: "transaction_type",
                            label: `${T("field_transaction_type")} (buy/sell)`,
                            required: true,
                          },
                          {
                            field: "date",
                            label: T("field_date"),
                            required: true,
                          },
                          {
                            field: "shares",
                            label: T("field_shares"),
                            required: true,
                          },
                          {
                            field: "price_per_share",
                            label: T("field_price_per_share"),
                            required: true,
                          },
                          {
                            field: "source_account_id",
                            label: T("tx_source_account"),
                            required: false,
                          },
                          {
                            field: "contribution_source",
                            label: T("label_contribution_source"),
                            required: false,
                          },
                          {
                            field: "is_verified",
                            label: `${T("verified_filter_label")} (true/false)`,
                            required: false,
                          },
                          {
                            field: "notes",
                            label: T("field_notes"),
                            required: false,
                          },
                        ],
                      };
                      const fields = SCHEMAS[csvImportType] || SCHEMAS.cashflow;
                      return (
                        <div className="card">
                          <div
                            style={{
                              fontSize: 14,
                              fontWeight: 600,
                              marginBottom: 12,
                            }}
                          >
                            {T("column_mapping")}
                          </div>
                          <div
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              gap: 10,
                            }}
                          >
                            {fields.map(({ field, label, required }) => (
                              <div key={field}>
                                <div
                                  style={{
                                    fontSize: 12,
                                    color: "var(--fg-soft)",
                                    marginBottom: 4,
                                  }}
                                >
                                  {label}
                                  {required ? " *" : ""}
                                </div>
                                <select
                                  className="inp"
                                  value={csvMap[field] || ""}
                                  onChange={(e) => {
                                    setCsvMap((prev) => ({
                                      ...prev,
                                      [field]: e.target.value,
                                    }));
                                    setCsvImportPreview(null);
                                  }}
                                >
                                  <option value="">{T("not_mapped")}</option>
                                  {csvParsed.headers.map((h) => (
                                    <option key={h} value={h}>
                                      {h}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            ))}
                            {csvImportType === "cashflow" && (
                              <div>
                                <div
                                  style={{
                                    fontSize: 12,
                                    color: "var(--fg-soft)",
                                    marginBottom: 8,
                                  }}
                                >
                                  {T("import_fallback_categories")}
                                </div>
                                <div
                                  style={{
                                    display: "grid",
                                    gridTemplateColumns:
                                      "repeat(auto-fit, minmax(220px, 1fr))",
                                    gap: 10,
                                  }}
                                >
                                  <div>
                                    <div
                                      style={{
                                        fontSize: 12,
                                        color: "var(--fg-soft)",
                                        marginBottom: 4,
                                      }}
                                    >
                                      {T("import_expense_fallback_category")}
                                    </div>
                                    <CategorySelect
                                      value={csvMap.expense_category_id || ""}
                                      onChange={(val) => {
                                        setCsvMap((prev) => ({
                                          ...prev,
                                          expense_category_id: val,
                                        }));
                                        setCsvImportPreview(null);
                                      }}
                                      categoryType="expense"
                                      categories={categories}
                                      placeholder={T("not_mapped")}
                                      usePortal
                                    />
                                  </div>
                                  <div>
                                    <div
                                      style={{
                                        fontSize: 12,
                                        color: "var(--fg-soft)",
                                        marginBottom: 4,
                                      }}
                                    >
                                      {T("import_income_fallback_category")}
                                    </div>
                                    <CategorySelect
                                      value={csvMap.income_category_id || ""}
                                      onChange={(val) => {
                                        setCsvMap((prev) => ({
                                          ...prev,
                                          income_category_id: val,
                                        }));
                                        setCsvImportPreview(null);
                                      }}
                                      categoryType="income"
                                      categories={categories}
                                      placeholder={T("not_mapped")}
                                      usePortal
                                    />
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>

                          {csvImportType === "cashflow" && (
                            <div style={{ marginTop: 14 }}>
                              <div
                                style={{
                                  fontSize: 12,
                                  color: "var(--fg-soft)",
                                  marginBottom: 8,
                                }}
                              >
                                {T("sign_convention")}
                              </div>
                              <div style={{ display: "flex", gap: 8 }}>
                                {[
                                  ["neg", T("sign_neg_expense")],
                                  ["pos", T("sign_pos_expense")],
                                ].map(([val, label]) => (
                                  <button
                                    key={val}
                                    onClick={() => setCsvSignConv(val)}
                                    style={{
                                      flex: 1,
                                      padding: "8px 12px",
                                      borderRadius: 8,
                                      cursor: "pointer",
                                      border: "1px solid",
                                      fontFamily: "inherit",
                                      fontSize: 12,
                                      fontWeight: 500,
                                      transition: "all 0.15s",
                                      background:
                                        csvSignConv === val
                                          ? "var(--accent-ring)"
                                          : "var(--card-inset)",
                                      color:
                                        csvSignConv === val
                                          ? "var(--accent)"
                                          : "var(--fg-soft)",
                                      borderColor:
                                        csvSignConv === val
                                          ? "var(--accent-ring)"
                                          : "var(--rule)",
                                    }}
                                  >
                                    {label}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })()}

                  {/* Card 3: Preview + Import (only if required fields mapped) */}
                  {csvParsed &&
                    (() => {
                      const REQUIRED_BY_TYPE = {
                        // category_name requirement is satisfied either by a
                        // mapped column or by a fallback category from the UI.
                        cashflow: ["date", "amount", "linked_asset_name"],
                        assets: [
                          "transaction_type",
                          "date",
                          "shares",
                          "price_per_share",
                        ],
                      };
                      const required =
                        REQUIRED_BY_TYPE[csvImportType] ||
                        REQUIRED_BY_TYPE.cashflow;
                      const hasFallbackCategory =
                        csvMap.expense_category_id || csvMap.income_category_id;
                      const allMapped =
                        required.every((f) => csvMap[f]) &&
                        (csvImportType !== "cashflow" ||
                          ((csvMap.description || csvMap.category_name) &&
                            (csvMap.category_name || hasFallbackCategory)));
                      if (!allMapped) return null;
                      const PREVIEW_BY_TYPE = {
                        cashflow: [
                          "type",
                          "category_name",
                          "description",
                          "amount",
                          "date",
                          "linked_asset_name",
                          "is_verified",
                        ],
                      };
                      const previewCols = (
                        PREVIEW_BY_TYPE[csvImportType] || required.slice(0, 4)
                      ).filter((field) => csvMap[field]);
                      return (
                        <div className="card">
                          <div
                            style={{
                              fontSize: 14,
                              fontWeight: 600,
                              marginBottom: 12,
                            }}
                          >
                            {T("preview_title")}
                          </div>
                          <div style={{ overflowX: "auto" }}>
                            <table
                              style={{
                                width: "100%",
                                borderCollapse: "collapse",
                                fontSize: 12,
                              }}
                            >
                              <thead>
                                <tr>
                                  {previewCols.map((field) => (
                                    <th
                                      key={field}
                                      style={{
                                        padding: "6px 10px",
                                        textAlign: "left",
                                        color: "var(--fg-soft)",
                                        borderBottom: "1px solid var(--rule)",
                                        fontWeight: 500,
                                      }}
                                    >
                                      {csvMap[field]}
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {csvParsed.rows.slice(0, 5).map((row, ri) => (
                                  <tr key={ri}>
                                    {previewCols.map((field) => {
                                      const idx = csvParsed.headers.indexOf(
                                        csvMap[field],
                                      );
                                      return (
                                        <td
                                          key={field}
                                          style={{
                                            padding: "6px 10px",
                                            color: "var(--fg)",
                                            borderBottom:
                                              "1px solid var(--card-inset)",
                                            fontFamily:
                                              field === "amount" ||
                                              field === "shares" ||
                                              field === "price_per_share" ||
                                              field === "invested_capital" ||
                                              field === "current_value"
                                                ? "var(--font-mono)"
                                                : undefined,
                                          }}
                                        >
                                          {idx >= 0 ? row[idx] : ""}
                                        </td>
                                      );
                                    })}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          {csvImportType === "assets" && (
                            <div
                              style={{ marginTop: 14, display: "flex", gap: 8 }}
                            >
                              <button
                                className="btn"
                                onClick={previewImportCSV}
                                disabled={csvImporting}
                                style={{
                                  flex: 1,
                                  opacity: csvImporting ? 0.6 : 1,
                                }}
                              >
                                Controlla duplicati
                              </button>
                              <button
                                className="btn btn-p"
                                onClick={doImportCSV}
                                disabled={csvImporting}
                                style={{
                                  flex: 1,
                                  opacity: csvImporting ? 0.6 : 1,
                                }}
                              >
                                {csvImporting ? "..." : T("import_btn")}
                              </button>
                            </div>
                          )}
                          {csvImportType !== "assets" && (
                            <button
                              className="btn btn-p"
                              style={{
                                width: "100%",
                                marginTop: 14,
                                padding: "12px",
                                opacity: csvImporting ? 0.6 : 1,
                              }}
                              onClick={doImportCSV}
                              disabled={csvImporting}
                            >
                              {csvImporting ? "..." : T("import_btn")}
                            </button>
                          )}
                          {csvImportType === "assets" &&
                            csvImportPreview &&
                            Array.isArray(csvImportPreview.duplicate_rows) &&
                            csvImportPreview.duplicate_rows.length > 0 && (
                              <div
                                style={{
                                  marginTop: 12,
                                  border: "1px solid var(--rule)",
                                  borderRadius: 8,
                                  padding: 10,
                                  display: "flex",
                                  flexDirection: "column",
                                  gap: 8,
                                }}
                              >
                                <div
                                  style={{
                                    fontSize: 12,
                                    color: "var(--fg-soft)",
                                  }}
                                >
                                  Duplicati trovati:{" "}
                                  {csvImportPreview.duplicate_rows.length}
                                </div>
                                <div style={{ display: "flex", gap: 8 }}>
                                  <button
                                    className="btn"
                                    onClick={() =>
                                      setCsvImportPreview((prev) => ({
                                        ...prev,
                                        duplicate_rows: (
                                          prev?.duplicate_rows || []
                                        ).map((r) => ({
                                          ...r,
                                          include: true,
                                        })),
                                      }))
                                    }
                                  >
                                    Importa tutti i duplicati
                                  </button>
                                  <button
                                    className="btn"
                                    onClick={() =>
                                      setCsvImportPreview((prev) => ({
                                        ...prev,
                                        duplicate_rows: (
                                          prev?.duplicate_rows || []
                                        ).map((r) => ({
                                          ...r,
                                          include: false,
                                        })),
                                      }))
                                    }
                                  >
                                    Escludi tutti
                                  </button>
                                </div>
                                <div
                                  style={{ maxHeight: 180, overflow: "auto" }}
                                >
                                  {csvImportPreview.duplicate_rows.map((r) => (
                                    <label
                                      key={r.row}
                                      style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 8,
                                        fontSize: 12,
                                        marginBottom: 6,
                                      }}
                                    >
                                      <input
                                        type="checkbox"
                                        checked={!!r.include}
                                        onChange={(e) =>
                                          setCsvImportPreview((prev) => ({
                                            ...prev,
                                            duplicate_rows: (
                                              prev?.duplicate_rows || []
                                            ).map((x) =>
                                              x.row === r.row
                                                ? {
                                                    ...x,
                                                    include: e.target.checked,
                                                  }
                                                : x,
                                            ),
                                          }))
                                        }
                                      />
                                      <span>
                                        {T("csv_row_label")} {r.row}:{" "}
                                        {r.asset_name} {r.transaction_type}{" "}
                                        {r.date} ({r.shares} @{" "}
                                        {r.price_per_share})
                                      </span>
                                    </label>
                                  ))}
                                </div>
                              </div>
                            )}
                        </div>
                      );
                    })()}

                  {/* Import result */}
                  {csvImportResult &&
                    (() => {
                      const hasErrors =
                        (csvImportResult.errors &&
                          csvImportResult.errors.length > 0) ||
                        (csvImportResult.skipped_details &&
                          csvImportResult.skipped_details.length > 0);
                      const warnings = csvImportResult.warnings || [];
                      const genericErrors = csvImportResult.errors || [];
                      const importedRows = csvImportResult.imported_rows || [];
                      return (
                        <div
                          style={{
                            background: hasErrors
                              ? "var(--danger-soft)"
                              : warnings.length > 0
                                ? "var(--warning-soft)"
                                : "var(--success-soft)",
                            border: hasErrors
                              ? "1px solid var(--danger-soft)"
                              : warnings.length > 0
                                ? "1px solid var(--warning-ring)"
                                : "1px solid var(--success-soft)",
                            borderRadius: 12,
                            padding: "14px 16px",
                          }}
                        >
                          <div
                            style={{
                              fontSize: 14,
                              color: hasErrors
                                ? "var(--danger)"
                                : warnings.length > 0
                                  ? "var(--warning)"
                                  : "var(--success)",
                              fontWeight: 600,
                            }}
                          >
                            {csvImportResult.imported} {T("import_success")}
                            {csvImportResult.skipped > 0
                              ? `, ${csvImportResult.skipped} ${T("import_skipped")}`
                              : ""}
                          </div>
                          {csvImportResult.imported > 0 && (
                            <div
                              style={{
                                marginTop: 8,
                                fontSize: 12,
                                color: "var(--success)",
                              }}
                            >
                              Import completato: le righe valide sono state
                              salvate correttamente.
                            </div>
                          )}
                          {importedRows.length > 0 && (
                            <div style={{ marginTop: 10 }}>
                              <div
                                style={{
                                  fontSize: 12,
                                  color: "var(--fg-soft)",
                                  marginBottom: 6,
                                }}
                              >
                                Righe importate con successo:
                              </div>
                              <div style={{ maxHeight: 180, overflow: "auto" }}>
                                {importedRows.map((row) => (
                                  <div
                                    key={`ok-${row.row}-${row.asset_id}-${row.date}`}
                                    style={{
                                      fontSize: 12,
                                      color: "var(--fg)",
                                      marginTop: 4,
                                    }}
                                  >
                                    {T("csv_row_label")} {row.row}:{" "}
                                    {row.asset_name} {row.transaction_type}{" "}
                                    {row.date} ({row.shares} @{" "}
                                    {row.price_per_share})
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          {csvImportResult.skipped_details &&
                            csvImportResult.skipped_details.length > 0 && (
                              <div style={{ marginTop: 8 }}>
                                {csvImportResult.skipped_details.map(
                                  (err, i) => (
                                    <div
                                      key={i}
                                      style={{
                                        fontSize: 12,
                                        color: "var(--danger)",
                                        marginTop: 4,
                                      }}
                                    >
                                      {err}
                                    </div>
                                  ),
                                )}
                              </div>
                            )}
                          {warnings.length > 0 && (
                            <div style={{ marginTop: 8 }}>
                              {warnings.map((warn, i) => (
                                <div
                                  key={`warn-${i}`}
                                  style={{
                                    fontSize: 12,
                                    color: "var(--warning)",
                                    marginTop: 4,
                                  }}
                                >
                                  {warn}
                                </div>
                              ))}
                            </div>
                          )}
                          {genericErrors.length > 0 && (
                            <div style={{ marginTop: 8 }}>
                              {genericErrors.map((err, i) => (
                                <div
                                  key={`gen-${i}`}
                                  style={{
                                    fontSize: 12,
                                    color: "var(--danger)",
                                    marginTop: 4,
                                  }}
                                >
                                  {err}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                </>
              ) : (
                <div
                  className="card"
                  style={{ fontSize: 13, color: "var(--fg-soft)" }}
                >
                  {T("features_no_import")}
                </div>
              )}
            </div>
          }
        </AccordionSection>

        {/* ---- Export section (Feature F) ---- */}
        {exportOptions.length > 0 && (
          <AccordionSection sectionKey="export" {...accordionProps}>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 14,
              }}
            >
              <div>
                <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>
                  {T("export_title")}
                </div>
                <div style={{ fontSize: 13, color: "var(--fg-soft)" }}>
                  {T("export_desc")}
                </div>
              </div>

              <div className="card">
                {isFeatureEnabled("cashflow") &&
                  isFeatureEnabled("accounts") &&
                  isFeatureEnabled("investments") && (
                    <button
                      type="button"
                      onClick={() => downloadExport("all")}
                      disabled={exportingType !== null || isDemo || !!viewAs}
                      className="btn btn-p"
                      style={{ width: "100%", marginBottom: 12 }}
                      aria-label={T("export_all")}
                    >
                      {exportingType === "all"
                        ? "..."
                        : `📦 ${T("export_all")}`}
                    </button>
                  )}

                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                  }}
                >
                  {exportOptions.map(({ type, label }) => (
                    <div
                      key={type}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 12,
                        padding: "8px 12px",
                        borderRadius: 8,
                        background: "var(--card-inset)",
                      }}
                    >
                      <span style={{ fontSize: 14, color: "var(--fg)" }}>
                        {label}
                      </span>
                      <button
                        type="button"
                        onClick={() => downloadExport(type)}
                        disabled={exportingType !== null || isDemo || !!viewAs}
                        className="btn btn-sm"
                        aria-label={`${T("export_btn_download")} ${label}`}
                      >
                        {exportingType === type
                          ? "..."
                          : T("export_btn_download")}
                      </button>
                    </div>
                  ))}
                </div>

                {exportError && (
                  <div
                    style={{
                      marginTop: 12,
                      fontSize: 13,
                      color: "var(--danger)",
                    }}
                  >
                    {exportError}
                  </div>
                )}
              </div>
            </div>
          </AccordionSection>
        )}

        {/* ---- Allocation targets section ---- */}
        <AccordionSection sectionKey="allocation" {...accordionProps}>
          {
            <div>
              <div
                style={{
                  fontSize: 16,
                  fontWeight: 600,
                  marginBottom: 6,
                }}
              >
                {T("alloc_title")}
              </div>
              <div
                style={{
                  fontSize: 13,
                  color: "var(--fg-soft)",
                  marginBottom: 20,
                }}
              >
                {T("alloc_desc")}
              </div>
              {investmentTypes.length === 0 ? (
                <div style={{ color: "var(--fg-soft)", fontSize: 13 }}>
                  {T("alloc_no_types")}
                </div>
              ) : (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 24,
                  }}
                >
                  {[
                    {
                      key: "investments",
                      label: T("alloc_group_investments"),
                      rows: regroupTargets(allocationData, "investments"),
                    },
                    {
                      key: "accounts",
                      label: T("alloc_group_accounts"),
                      rows: regroupTargets(allocationData, "accounts"),
                    },
                  ]
                    .filter((g) => g.rows.length > 0)
                    .map((g) => (
                      <div
                        key={g.key}
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 12,
                        }}
                      >
                        <div
                          style={{
                            fontSize: 11,
                            letterSpacing: 0,
                            color: "var(--fg-soft)",
                            textTransform: "uppercase",
                          }}
                        >
                          {g.label}
                        </div>
                        {g.rows.map((a) => (
                          <div
                            key={a.id}
                            className="card"
                            style={{ padding: "14px 16px" }}
                          >
                            <div
                              className="between"
                              style={{ marginBottom: 10 }}
                            >
                              <span
                                style={{
                                  fontSize: 14,
                                  fontWeight: 500,
                                }}
                              >
                                {a.icon} {a.name}
                              </span>
                              <span
                                style={{
                                  fontSize: 12,
                                  color: "var(--fg-soft)",
                                  fontFamily: "var(--font-mono)",
                                }}
                              >
                                {T("alloc_current")}: {a.current_pct.toFixed(1)}
                                %
                              </span>
                            </div>
                            <div
                              className="row"
                              style={{
                                gap: 8,
                                alignItems: "center",
                              }}
                            >
                              <AllocationTargetInput
                                item={a}
                                apiFetch={apiFetch}
                                fetchAllocationData={fetchAllocationData}
                              />
                              <span style={{ color: "var(--fg-soft)" }}>%</span>
                              {a.target_pct !== null && (
                                <button
                                  className="btn btn-g btn-sm"
                                  style={{
                                    color: "var(--danger)",
                                    padding: "4px 8px",
                                    marginLeft: "auto",
                                  }}
                                  onClick={async () => {
                                    if (a.target_id) {
                                      await apiFetch(
                                        `${API}/portfolio/allocation-targets/${a.target_id}/`,
                                        {
                                          method: "DELETE",
                                        },
                                      );
                                      fetchAllocationData();
                                    }
                                  }}
                                >
                                  ×
                                </button>
                              )}
                            </div>
                            {a.target_pct !== null && (
                              <div style={{ marginTop: 10 }}>
                                <div
                                  style={{
                                    height: 4,
                                    background: "var(--rule)",
                                    borderRadius: 2,
                                    position: "relative",
                                  }}
                                >
                                  <div
                                    style={{
                                      height: "100%",
                                      width: `${Math.min(a.current_pct, 100)}%`,
                                      background: a.color || "var(--accent)",
                                      borderRadius: 2,
                                    }}
                                  />
                                  <div
                                    style={{
                                      position: "absolute",
                                      top: -2,
                                      bottom: -2,
                                      width: 2,
                                      left: `${Math.min(a.target_pct, 100)}%`,
                                      background: "var(--fg)",
                                      borderRadius: 1,
                                    }}
                                  />
                                </div>
                                <div
                                  className="between"
                                  style={{ marginTop: 4 }}
                                >
                                  <span
                                    style={{
                                      fontSize: 10,
                                      color: "var(--fg-soft)",
                                    }}
                                  >
                                    0%
                                  </span>
                                  {a.action &&
                                    (() => {
                                      const c = {
                                        buy: "var(--success)",
                                        sell: "var(--danger)",
                                        ok: "var(--accent)",
                                      }[a.action];
                                      return (
                                        <span
                                          style={{
                                            fontSize: 10,
                                            fontWeight: 700,
                                            color: c,
                                          }}
                                        >
                                          {T(`alloc_action_${a.action}`)}{" "}
                                          {Math.abs(a.diff).toFixed(1)}%
                                        </span>
                                      );
                                    })()}
                                  <span
                                    style={{
                                      fontSize: 10,
                                      color: "var(--fg-soft)",
                                    }}
                                  >
                                    100%
                                  </span>
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                        <div
                          style={{
                            fontSize: 12,
                            color: "var(--fg-soft)",
                            textAlign: "right",
                          }}
                        >
                          {T("alloc_total")}:{" "}
                          {g.rows
                            .reduce((s, a) => s + (a.target_pct || 0), 0)
                            .toFixed(1)}
                          %
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>
          }
        </AccordionSection>

        {/* ---- Budget section ---- */}
        <AccordionSection sectionKey="budget" {...accordionProps}>
          {
            <div>
              <div
                style={{
                  fontSize: 16,
                  fontWeight: 600,
                  marginBottom: 6,
                }}
              >
                {T("budget_title")}
              </div>
              <div
                style={{
                  fontSize: 13,
                  color: "var(--fg-soft)",
                  marginBottom: 20,
                }}
              >
                {T("budget_desc")}
              </div>
              {categories.filter(
                (c) => !c.parent && c.category_type === "expense",
              ).length === 0 ? (
                <div style={{ color: "var(--fg-soft)", fontSize: 13 }}>
                  {T("budget_no_cats")}
                </div>
              ) : (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                  }}
                >
                  {categories
                    .filter((c) => !c.parent && c.category_type === "expense")
                    .map((cat) => {
                      const budget = budgets.find((b) => b.category === cat.id);
                      const isEditing = editingBudgetCat === cat.id;
                      return (
                        <div
                          key={cat.id}
                          className="card"
                          style={{
                            padding: "12px 16px",
                          }}
                        >
                          <div className="between">
                            <span
                              style={{
                                fontSize: 14,
                              }}
                            >
                              {cat.icon} {cat.name}
                            </span>
                            <div
                              className="row"
                              style={{
                                gap: 8,
                                alignItems: "center",
                              }}
                            >
                              {!isEditing && (
                                <span
                                  style={{
                                    fontSize: 13,
                                    color: budget
                                      ? "var(--fg)"
                                      : "var(--fg-soft)",
                                    fontFamily: "var(--font-mono)",
                                  }}
                                >
                                  {budget
                                    ? `${formatEur(budget.amount)}/mo`
                                    : "—"}
                                </span>
                              )}
                              {isEditing ? (
                                <>
                                  <input
                                    className="inp"
                                    type="number"
                                    min="0"
                                    step="1"
                                    placeholder="0"
                                    style={{
                                      width: 110,
                                      textAlign: "right",
                                    }}
                                    value={budgetInputVal}
                                    onChange={(e) =>
                                      setBudgetInputVal(e.target.value)
                                    }
                                    autoFocus
                                  />
                                  <button
                                    className="btn btn-p btn-sm"
                                    onClick={async () => {
                                      const val = parseFloat(budgetInputVal);
                                      if (!isNaN(val) && val > 0) {
                                        await apiFetch(
                                          `${API}/expenses/budgets/`,
                                          {
                                            method: "POST",
                                            headers: {
                                              "Content-Type":
                                                "application/json",
                                            },
                                            body: JSON.stringify({
                                              category: cat.id,
                                              amount: val,
                                            }),
                                          },
                                        );
                                        fetchBudgets();
                                      }
                                      setEditingBudgetCat(null);
                                    }}
                                  >
                                    {T("budget_set")}
                                  </button>
                                  <button
                                    className="btn btn-g btn-sm"
                                    onClick={() => setEditingBudgetCat(null)}
                                  >
                                    {T("btn_cancel")}
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button
                                    className="btn btn-g btn-sm"
                                    onClick={() => {
                                      setEditingBudgetCat(cat.id);
                                      setBudgetInputVal(
                                        budget ? String(budget.amount) : "",
                                      );
                                    }}
                                  >
                                    {T("btn_edit")}
                                  </button>
                                  {budget && (
                                    <button
                                      className="btn btn-g btn-sm"
                                      style={{
                                        color: "var(--danger)",
                                        padding: "4px 8px",
                                      }}
                                      onClick={async () => {
                                        await apiFetch(
                                          `${API}/expenses/budgets/${budget.id}/`,
                                          {
                                            method: "DELETE",
                                          },
                                        );
                                        fetchBudgets();
                                      }}
                                    >
                                      ×
                                    </button>
                                  )}
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          }
        </AccordionSection>

        {/* ---- Recurring expenses section ---- */}
        <AccordionSection sectionKey="recurring" {...accordionProps}>
          {
            <div>
              <div
                style={{
                  fontSize: 16,
                  fontWeight: 600,
                  marginBottom: 6,
                }}
              >
                {T("recurring_title")}
              </div>
              <div
                style={{
                  fontSize: 13,
                  color: "var(--fg-soft)",
                  marginBottom: 16,
                }}
              >
                {T("recurring_desc")}
              </div>
              <div className="row" style={{ gap: 8, marginBottom: 16 }}>
                <button
                  className="btn btn-p btn-sm"
                  onClick={() => openRecurringModal()}
                >
                  + {T("add_recurring")}
                </button>
                <button
                  className="btn btn-g btn-sm"
                  disabled={recurringSaving}
                  onClick={() => generateRecurringForMonth()}
                >
                  {recurringSaving ? "..." : T("generate_recurring")}
                </button>
              </div>

              {generateRecurringMsg && (
                <div
                  style={{
                    marginBottom: 14,
                    padding: "10px 14px",
                    borderRadius: 10,
                    fontSize: 13,
                    background: "var(--success-soft)",
                    border: "1px solid var(--success-soft)",
                    color: "var(--success)",
                  }}
                >
                  ✓ {generateRecurringMsg.created} {T("generate_done")},{" "}
                  {generateRecurringMsg.skipped} {T("generate_skipped")}
                </div>
              )}

              {recurringError && !showRecurringModal && (
                <div
                  style={{
                    marginBottom: 14,
                    padding: "10px 14px",
                    borderRadius: 10,
                    fontSize: 13,
                    background: "#ff6b6b11",
                    border: "1px solid #ff6b6b33",
                    color: "var(--danger)",
                  }}
                >
                  {recurringError}
                </div>
              )}

              {recurringExpenses.length === 0 ? (
                <div style={{ color: "var(--fg-soft)", fontSize: 13 }}>
                  {T("no_recurring")}
                </div>
              ) : (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                  }}
                >
                  {recurringExpenses.map((rec) => {
                    const cat = categories.find((c) => c.id === rec.category);
                    const linkedAccount = assets.find(
                      (a) => a.id === rec.linked_asset,
                    );
                    return (
                      <div
                        key={rec.id}
                        className="card"
                        style={{ padding: "12px 16px" }}
                      >
                        <div className="between">
                          <div>
                            <div
                              style={{
                                fontSize: 14,
                                fontWeight: 500,
                              }}
                            >
                              {cat?.icon} {rec.description}
                            </div>
                            <div
                              style={{
                                fontSize: 11,
                                color: "var(--fg-soft)",
                                marginTop: 3,
                              }}
                            >
                              {cat?.name} · {T("recurring_day")}{" "}
                              {rec.day_of_month}
                              {rec.start_date && ` · ${rec.start_date}`}
                              {rec.end_date && ` → ${rec.end_date}`}
                              {linkedAccount && ` · ${linkedAccount.name}`}
                              {rec.status !== "ACTIVE" && (
                                <span
                                  style={{
                                    color: "var(--danger)",
                                    marginLeft: 6,
                                  }}
                                >
                                  ● {rec.status}
                                </span>
                              )}
                            </div>
                          </div>
                          <div
                            className="row"
                            style={{
                              alignItems: "center",
                              gap: 8,
                            }}
                          >
                            <span
                              style={{
                                fontSize: 15,
                                fontWeight: 600,
                                fontFamily: "var(--font-mono)",
                                color: "var(--danger)",
                              }}
                            >
                              -{formatEur(rec.amount)}
                            </span>
                            <button
                              className="btn btn-g btn-sm"
                              onClick={() => openRecurringModal(rec)}
                            >
                              {T("btn_edit")}
                            </button>
                            {rec.status === "ACTIVE" ? (
                              <button
                                className="btn btn-g btn-sm"
                                disabled={recurringSaving}
                                onClick={() => toggleRecurringStatus(rec)}
                              >
                                {T("btn_disable")}
                              </button>
                            ) : (
                              <button
                                className="btn btn-g btn-sm"
                                disabled={recurringSaving}
                                onClick={() => toggleRecurringStatus(rec)}
                              >
                                {T("btn_enable")}
                              </button>
                            )}
                            <button
                              className="btn btn-r btn-sm"
                              style={{
                                padding: "4px 8px",
                              }}
                              onClick={() => setDeleteRecurringTarget(rec)}
                            >
                              {T("btn_delete")}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          }
        </AccordionSection>

        {/* ---- PAC section ---- */}
        <AccordionSection sectionKey="pac" {...accordionProps}>
          {
            <div>
              <div
                style={{
                  fontSize: 16,
                  fontWeight: 600,
                  marginBottom: 6,
                }}
              >
                {T("pac_title")}
              </div>
              <div
                style={{
                  fontSize: 13,
                  color: "var(--fg-soft)",
                  marginBottom: 16,
                }}
              >
                {T("pac_desc")}
              </div>
              <div className="row" style={{ gap: 8, marginBottom: 16 }}>
                <button
                  className="btn btn-p btn-sm"
                  onClick={() => openPacModal()}
                >
                  + {T("add_pac")}
                </button>
                <button
                  className="btn btn-g btn-sm"
                  disabled={pacSaving}
                  onClick={() => generatePacForMonth()}
                >
                  {pacSaving ? "..." : T("generate_pac")}
                </button>
              </div>

              {generatePacMsg && (
                <div
                  style={{
                    marginBottom: 14,
                    padding: "10px 14px",
                    borderRadius: 10,
                    fontSize: 13,
                    background: "var(--success-soft)",
                    border: "1px solid var(--success-soft)",
                    color: "var(--success)",
                  }}
                >
                  ✓ {generatePacMsg.created} {T("generate_done")},{" "}
                  {generatePacMsg.skipped} {T("generate_skipped")}
                  {generatePacMsg.price_missing > 0 &&
                    ` · ${generatePacMsg.price_missing} ${T("pac_price_missing")}`}
                </div>
              )}

              {pacError && !showPacModal && (
                <div
                  style={{
                    marginBottom: 14,
                    padding: "10px 14px",
                    borderRadius: 10,
                    fontSize: 13,
                    background: "#ff6b6b11",
                    border: "1px solid #ff6b6b33",
                    color: "var(--danger)",
                  }}
                >
                  {pacError}
                </div>
              )}

              {recurringInvestmentPlans.length === 0 ? (
                <div style={{ color: "var(--fg-soft)", fontSize: 13 }}>
                  {T("no_pac")}
                </div>
              ) : (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                  }}
                >
                  {recurringInvestmentPlans.map((plan) => {
                    const target = assets.find((a) => a.id === plan.asset);
                    const source = assets.find(
                      (a) => a.id === plan.source_account,
                    );
                    return (
                      <div
                        key={plan.id}
                        className="card"
                        style={{ padding: "12px 16px" }}
                      >
                        <div className="between">
                          <div>
                            <div style={{ fontSize: 14, fontWeight: 500 }}>
                              {target?.investment_type_detail?.icon || "📈"}{" "}
                              {plan.name}
                            </div>
                            <div
                              style={{
                                fontSize: 11,
                                color: "var(--fg-soft)",
                                marginTop: 3,
                              }}
                            >
                              {target?.name || plan.asset_name} ·{" "}
                              {T(`pac_frequency_${plan.frequency}`)} ·{" "}
                              {source?.name || plan.source_account_name}
                              {plan.generated_transactions_verified
                                ? ` · ${T("pac_verified_yes")}`
                                : ` · ${T("pac_verified_no")}`}
                              {plan.status !== "ACTIVE" && (
                                <span
                                  style={{
                                    color: "var(--danger)",
                                    marginLeft: 6,
                                  }}
                                >
                                  ● {plan.status}
                                </span>
                              )}
                            </div>
                          </div>
                          <div
                            className="row"
                            style={{ alignItems: "center", gap: 8 }}
                          >
                            <span
                              style={{
                                fontSize: 15,
                                fontWeight: 600,
                                fontFamily: "var(--font-mono)",
                              }}
                            >
                              {formatEur(plan.amount)}
                            </span>
                            <button
                              className="btn btn-g btn-sm"
                              onClick={() => openPacModal(plan)}
                            >
                              {T("btn_edit")}
                            </button>
                            <button
                              className="btn btn-g btn-sm"
                              disabled={pacSaving}
                              onClick={() => togglePacStatus(plan)}
                            >
                              {plan.status === "ACTIVE"
                                ? T("btn_disable")
                                : T("btn_enable")}
                            </button>
                            <button
                              className="btn btn-r btn-sm"
                              style={{ padding: "4px 8px" }}
                              onClick={() => setDeletePacTarget(plan)}
                            >
                              {T("btn_delete")}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          }
        </AccordionSection>

        {/* ---- Fire settings section ---- */}
        <AccordionSection sectionKey="fire" {...accordionProps}>
          {<FireSettingsSection T={T} fetchFireGoal={fetchFireGoal} />}
        </AccordionSection>

        {/* ---- Cash Flow preferences section ---- */}
        <AccordionSection sectionKey="cashflow_settings" {...accordionProps}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div className="card" style={{ padding: 16 }}>
              <ToggleSwitch
                id="cf-default-verified-toggle"
                checked={!!transactionPrefs?.cashflow_default_verified}
                onChange={(v) =>
                  updateTransactionPreference("cashflow_default_verified", v)
                }
                label={T("settings_cf_default_verified")}
              />
              <div
                style={{
                  fontSize: 12,
                  color: "var(--fg-soft)",
                  marginTop: 8,
                  lineHeight: 1.35,
                }}
              >
                {T("settings_cf_default_verified_desc")}
              </div>
            </div>
            <div className="card" style={{ padding: 16 }}>
              <ToggleSwitch
                id="cf-autofill-account-toggle"
                checked={!!transactionPrefs?.cashflow_autofill_last_account}
                onChange={(v) =>
                  updateTransactionPreference(
                    "cashflow_autofill_last_account",
                    v,
                  )
                }
                label={T("settings_cf_autofill_account")}
              />
              <div
                style={{
                  fontSize: 12,
                  color: "var(--fg-soft)",
                  marginTop: 8,
                  lineHeight: 1.35,
                }}
              >
                {T("settings_cf_autofill_account_desc")}
              </div>
            </div>
          </div>
        </AccordionSection>

        {/* ---- Investment preferences section ---- */}
        <AccordionSection sectionKey="investment_settings" {...accordionProps}>
          <div className="card" style={{ padding: 16 }}>
            <ToggleSwitch
              id="inv-default-verified-toggle"
              checked={!!transactionPrefs?.investments_default_verified}
              onChange={(v) =>
                updateTransactionPreference("investments_default_verified", v)
              }
              label={T("settings_inv_default_verified")}
            />
            <div
              style={{
                fontSize: 12,
                color: "var(--fg-soft)",
                marginTop: 8,
                lineHeight: 1.35,
              }}
            >
              {T("settings_inv_default_verified_desc")}
            </div>
          </div>
        </AccordionSection>

        {/* ---- User / Account section ---- */}
        <AccordionSection sectionKey="user" {...accordionProps}>
          <UserSection
            T={T}
            profile={profile}
            updateProfile={updateProfile}
            changePassword={changePassword}
            deleteAccount={deleteAccount}
            logout={logout}
            isDemo={isDemo}
            viewAs={viewAs}
          />
        </AccordionSection>

        {/* ---- Sharing section ---- */}
        <AccordionSection sectionKey="sharing" {...accordionProps}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
              {T("sharing_title")}
            </div>
            <div
              style={{
                fontSize: 13,
                color: "var(--fg-soft)",
                marginBottom: 14,
              }}
            >
              {T("sharing_desc")}
            </div>
            <SharingSection T={T} />
          </div>
        </AccordionSection>

        {/* ---- General section ---- */}
        <AccordionSection sectionKey="general" {...accordionProps}>
          <div>
            <div className="grouped-list__title">{T("features_title")}</div>
            <div className="grouped-list" style={{ marginBottom: 8 }}>
              {featureItems.map((feature) => (
                <div key={feature.key} className="grouped-list__item">
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 500,
                        color: "var(--fg)",
                      }}
                    >
                      {feature.label}
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: "var(--fg-soft)",
                        marginTop: 2,
                        lineHeight: 1.35,
                      }}
                    >
                      {feature.description}
                    </div>
                  </div>
                  <ToggleSwitch
                    id={`feature-${feature.key}`}
                    checked={!!enabledFeatures[feature.key]}
                    onChange={(checked) =>
                      updateEnabledFeature(feature.key, checked)
                    }
                  />
                </div>
              ))}
            </div>
            <div
              style={{
                fontSize: 12,
                color: "var(--fg-soft)",
                lineHeight: 1.45,
                padding: "0 4px",
                marginBottom: 24,
              }}
            >
              {T("features_desc")}
            </div>

            <div className="grouped-list__title">
              {T("general_preferences")}
            </div>
            <div className="grouped-list" style={{ marginBottom: 8 }}>
              <div
                className="grouped-list__item"
                style={{ flexWrap: "wrap", rowGap: 8 }}
              >
                <span
                  style={{ fontSize: 14, fontWeight: 500, color: "var(--fg)" }}
                >
                  {T("theme_label", "Theme")}
                </span>
                <SegmentedControl
                  options={[
                    { value: "light", label: T("theme_light") },
                    { value: "dark", label: T("theme_dark") },
                    { value: "auto", label: "Auto" },
                  ]}
                  value={themePreference}
                  onChange={setTheme}
                />
              </div>
              <div
                className="grouped-list__item"
                style={{ flexWrap: "wrap", rowGap: 8 }}
              >
                <span
                  style={{ fontSize: 14, fontWeight: 500, color: "var(--fg)" }}
                >
                  {T("choose_language")}
                </span>
                <SegmentedControl
                  options={[
                    { value: "en", label: "English" },
                    { value: "it", label: "Italiano" },
                  ]}
                  value={lang}
                  onChange={(code) => {
                    setLang(code);
                    localStorage.setItem("lang", code);
                  }}
                />
              </div>
              <div
                className="grouped-list__item"
                style={{ flexWrap: "wrap", rowGap: 8 }}
              >
                <span
                  style={{ fontSize: 14, fontWeight: 500, color: "var(--fg)" }}
                >
                  {T("decimal_separator_label")}
                </span>
                <SegmentedControl
                  options={[
                    { value: ",", label: "1.234,56" },
                    { value: ".", label: "1,234.56" },
                  ]}
                  value={decimalSeparator}
                  onChange={updateDecimalSeparator}
                />
              </div>
              <div className="grouped-list__item">
                <span
                  style={{ fontSize: 14, fontWeight: 500, color: "var(--fg)" }}
                >
                  {T("currency_title")}
                </span>
                <span style={{ fontSize: 13, color: "var(--fg-soft)" }}>
                  {T("currency_eur_label")}
                </span>
              </div>
              <div className="grouped-list__item">
                <span
                  style={{
                    fontSize: 14,
                    fontWeight: 500,
                    color: "var(--fg)",
                    flex: 1,
                    minWidth: 0,
                  }}
                >
                  {T("accounting_month_start_label", "Accounting month start")}
                </span>
                {accountingSaved && (
                  <span style={{ fontSize: 12, color: "var(--success)" }}>
                    {T("decimal_separator_saved")}
                  </span>
                )}
                <select
                  className="inp"
                  value={accountingMonthStartDay}
                  onChange={async (e) => {
                    const ok = await updateAccountingMonthStartDay(
                      e.target.value,
                    );
                    if (ok) {
                      setAccountingSaved(true);
                      setTimeout(() => setAccountingSaved(false), 2000);
                    }
                  }}
                  style={{ maxWidth: 90 }}
                >
                  {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                    <option key={day} value={day}>
                      {day}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div
              style={{
                fontSize: 12,
                color: "var(--fg-soft)",
                lineHeight: 1.45,
                padding: "0 4px",
              }}
            >
              {(() => {
                const current = currentAccountingMonth();
                const range = accountingMonthDateRange(
                  current.year,
                  current.month,
                );
                return (
                  T(
                    "accounting_month_start_desc",
                    "Monthly cash flow totals use this day as the start of the month.",
                  ) + ` ${range.from} - ${range.to}`
                );
              })()}
            </div>
          </div>
        </AccordionSection>

        {privacyGroups.length > 0 && (
          <AccordionSection sectionKey="privacy" {...accordionProps}>
            <div>
              <div
                style={{
                  fontSize: 13,
                  color: "var(--fg-soft)",
                  marginBottom: 16,
                  lineHeight: 1.45,
                }}
              >
                {T("privacy_desc")}
              </div>
              {privacyGroups.map((group) => (
                <div key={group.scope} style={{ marginBottom: 20 }}>
                  <div className="grouped-list__title">{group.title}</div>
                  <div className="grouped-list">
                    {group.items.map(([key, label]) => (
                      <div
                        key={`${group.scope}.${key}`}
                        className="grouped-list__item"
                      >
                        <span
                          style={{
                            fontSize: 14,
                            fontWeight: 500,
                            color: "var(--fg)",
                            flex: 1,
                            minWidth: 0,
                          }}
                        >
                          {label}
                        </span>
                        <ToggleSwitch
                          id={`privacy-${group.scope}-${key}`}
                          checked={isPrivacyPreferenceEnabled(group.scope, key)}
                          onChange={(checked) =>
                            updatePrivacyPreference(group.scope, key, checked)
                          }
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </AccordionSection>
        )}

        {isFeatureEnabled("dashboard") && (
          <AccordionSection sectionKey="dashboard" {...accordionProps}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
                {T("dash_settings")}
              </div>
              <div
                style={{
                  fontSize: 13,
                  color: "var(--fg-soft)",
                  marginBottom: 12,
                }}
              >
                {T("dash_show_hide")}
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  marginBottom: 10,
                }}
              >
                <button
                  className="btn btn-g btn-sm pressable"
                  onClick={resetDashConfig}
                >
                  ↺ {T("dash_reset")}
                </button>
              </div>
              <div className="grouped-list">
                {visibleDashCards.map((c, idx) => {
                  const handleProps = dashReorder.getHandleProps(idx);
                  return (
                    <div
                      key={c.id}
                      className="grouped-list__item"
                      style={{
                        height: 56,
                        boxSizing: "border-box",
                        background: "var(--card)",
                        ...dashReorder.getRowStyle(idx),
                      }}
                    >
                      <span
                        {...handleProps}
                        role="button"
                        aria-label={T("dash_reorder_handle", "Reorder")}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          width: 36,
                          height: 44,
                          color: "var(--fg-faint)",
                          fontSize: 18,
                          userSelect: "none",
                          flexShrink: 0,
                          ...handleProps.style,
                        }}
                      >
                        ≡
                      </span>
                      <span
                        style={{
                          flex: 1,
                          minWidth: 0,
                          fontSize: 14,
                          fontWeight: 500,
                          color: c.visible ? "var(--fg)" : "var(--fg-faint)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {dashLabels[c.id]}
                      </span>
                      <div
                        className="row"
                        style={{ gap: 4, alignItems: "center" }}
                      >
                        <button
                          onClick={() => idx > 0 && moveDashCard(c.id, -1)}
                          aria-label="Move up"
                          style={{
                            background: "var(--card-inset)",
                            border: "1px solid var(--rule)",
                            color:
                              idx === 0 ? "var(--fg-faint)" : "var(--fg-soft)",
                            borderRadius: 8,
                            width: 28,
                            height: 28,
                            cursor: idx === 0 ? "default" : "pointer",
                          }}
                        >
                          ↑
                        </button>
                        <button
                          onClick={() =>
                            idx < visibleDashCards.length - 1 &&
                            moveDashCard(c.id, 1)
                          }
                          aria-label="Move down"
                          style={{
                            background: "var(--card-inset)",
                            border: "1px solid var(--rule)",
                            color:
                              idx === visibleDashCards.length - 1
                                ? "var(--fg-faint)"
                                : "var(--fg-soft)",
                            borderRadius: 8,
                            width: 28,
                            height: 28,
                            cursor:
                              idx === visibleDashCards.length - 1
                                ? "default"
                                : "pointer",
                          }}
                        >
                          ↓
                        </button>
                        <ToggleSwitch
                          id={`dash-visible-${c.id}`}
                          checked={c.visible}
                          onChange={() => toggleDashCard(c.id)}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </AccordionSection>
        )}

        <AccordionSection sectionKey="about" {...accordionProps}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
              {T("about_title")}
            </div>
            <div
              className="card"
              style={{
                padding: 16,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12,
              }}
            >
              <span style={{ color: "var(--fg-soft)", fontSize: 13 }}>
                {T("about_version")}
              </span>
              <span className="mono" style={{ fontSize: 14, fontWeight: 700 }}>
                {appVersion}
              </span>
            </div>
          </div>
        </AccordionSection>

        {/* ---- Extra section ---- */}
        <AccordionSection sectionKey="extra" {...accordionProps}>
          {
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 14,
              }}
            >
              {/* Reset Transactions card */}
              {isFeatureEnabled("cashflow") && (
                <div className="card">
                  <div
                    style={{
                      fontSize: 15,
                      fontWeight: 600,
                      marginBottom: 6,
                    }}
                  >
                    {T("reset_transactions")}
                  </div>
                  <div
                    style={{
                      fontSize: 13,
                      color: "var(--fg-soft)",
                      marginBottom: 14,
                    }}
                  >
                    {T("reset_transactions_desc")}
                  </div>
                  <button
                    className="btn btn-r"
                    style={{ width: "100%", padding: "10px" }}
                    onClick={() => {
                      setResetConfirm("transactions");
                      setResetUnderstood(false);
                    }}
                  >
                    {T("reset_transactions")}
                  </button>
                </div>
              )}

              {/* Reset Portfolio card */}
              {(isFeatureEnabled("accounts") ||
                isFeatureEnabled("investments")) && (
                <div className="card">
                  <div
                    style={{
                      fontSize: 15,
                      fontWeight: 600,
                      marginBottom: 6,
                    }}
                  >
                    {T("reset_portfolio")}
                  </div>
                  <div
                    style={{
                      fontSize: 13,
                      color: "var(--fg-soft)",
                      marginBottom: 14,
                    }}
                  >
                    {T("reset_portfolio_desc")}
                  </div>
                  <button
                    className="btn btn-r"
                    style={{ width: "100%", padding: "10px" }}
                    onClick={() => {
                      setResetConfirm("portfolio");
                      setResetUnderstood(false);
                    }}
                  >
                    {T("reset_portfolio")}
                  </button>
                </div>
              )}

              {/* Reset feedback */}
              {resetMsg && (
                <div
                  style={{
                    padding: "12px 14px",
                    borderRadius: 10,
                    fontSize: 13,
                    background:
                      resetMsg.deleted > 0
                        ? "var(--success-soft)"
                        : "var(--rule)",
                    color:
                      resetMsg.deleted > 0
                        ? "var(--success)"
                        : "var(--fg-soft)",
                    border: `1px solid ${resetMsg.deleted > 0 ? "var(--success-soft)" : "var(--rule)"}`,
                  }}
                >
                  {resetMsg.deleted > 0
                    ? `${T("reset_success")} (${resetMsg.deleted})`
                    : T("reset_empty")}
                </div>
              )}

              {/* Load Demo Data card */}
              <div className="card">
                <div
                  style={{
                    fontSize: 15,
                    fontWeight: 600,
                    marginBottom: 6,
                  }}
                >
                  {T("load_demo")}
                </div>
                <div
                  style={{
                    fontSize: 13,
                    color: "var(--fg-soft)",
                    marginBottom: 14,
                  }}
                >
                  {T("load_demo_desc")}
                </div>
                <button
                  className="btn"
                  style={{
                    width: "100%",
                    padding: "10px",
                    background: "var(--accent-ring)",
                    color: "var(--accent)",
                    border: "1px solid var(--accent-ring)",
                    borderRadius: 10,
                    fontFamily: "inherit",
                    fontSize: 14,
                    fontWeight: 500,
                    cursor: "pointer",
                  }}
                  onClick={() => {
                    setDemoConfirm(true);
                    setDemoUnderstood(false);
                  }}
                >
                  {T("load_demo")}
                </button>
              </div>
            </div>
          }
        </AccordionSection>
      </div>

      {resetConfirm && (
        <Modal
          title={T("modal_are_you_sure")}
          onClose={() => {
            setResetConfirm(null);
            setResetUnderstood(false);
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 16,
            }}
          >
            <div style={{ fontSize: 13, color: "var(--fg-soft)" }}>
              {resetConfirm === "transactions"
                ? `${T("reset_transactions_desc")} ${T("action_cannot_be_undone")}`
                : `${T("reset_portfolio_desc")} ${T("action_cannot_be_undone")}`}
            </div>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                cursor: "pointer",
                background: "var(--card-inset)",
                borderRadius: 10,
                padding: "12px 14px",
                border: "1px solid var(--rule)",
                fontSize: 13,
                color: "var(--fg)",
              }}
            >
              <input
                type="checkbox"
                checked={resetUnderstood}
                onChange={(e) => setResetUnderstood(e.target.checked)}
              />
              {T("understand_checkbox")}
            </label>
            <div className="row" style={{ justifyContent: "flex-end", gap: 8 }}>
              <button
                className="btn btn-g"
                onClick={() => {
                  setResetConfirm(null);
                  setResetUnderstood(false);
                }}
              >
                {T("btn_cancel")}
              </button>
              <button
                className="btn"
                disabled={!resetUnderstood}
                style={{
                  background: resetUnderstood
                    ? "var(--danger)"
                    : "var(--danger)",
                  color: resetUnderstood
                    ? "var(--btn-primary-fg)"
                    : "var(--fg-soft)",
                  padding: "10px 18px",
                  cursor: resetUnderstood ? "pointer" : "not-allowed",
                  border: "none",
                  borderRadius: 10,
                  fontFamily: "inherit",
                  fontSize: 14,
                  fontWeight: 500,
                }}
                onClick={
                  resetConfirm === "transactions"
                    ? resetTransactions
                    : resetPortfolio
                }
              >
                {T("btn_confirm")}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {demoConfirm && (
        <Modal
          title={T("load_demo")}
          onClose={() => {
            setDemoConfirm(false);
            setDemoUnderstood(false);
            setDemoError("");
            setDemoLoading(false);
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 16,
            }}
          >
            <div style={{ fontSize: 13, color: "var(--fg-soft)" }}>
              {T("demo_warning")}
            </div>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                cursor: "pointer",
                background: "var(--card-inset)",
                borderRadius: 10,
                padding: "12px 14px",
                border: "1px solid var(--rule)",
                fontSize: 13,
                color: "var(--fg)",
              }}
            >
              <input
                type="checkbox"
                checked={demoUnderstood}
                onChange={(e) => setDemoUnderstood(e.target.checked)}
              />
              {T("demo_checkbox")}
            </label>
            {demoError && (
              <div style={{ fontSize: 12, color: "var(--danger)" }}>
                {demoError}
              </div>
            )}
            <div className="row" style={{ justifyContent: "flex-end", gap: 8 }}>
              <button
                className="btn btn-g"
                onClick={() => {
                  setDemoConfirm(false);
                  setDemoUnderstood(false);
                  setDemoError("");
                }}
              >
                {T("btn_cancel")}
              </button>
              <button
                className="btn"
                disabled={!demoUnderstood || demoLoading}
                style={{
                  background: demoUnderstood
                    ? "var(--accent)"
                    : "var(--accent-ring)",
                  color: demoUnderstood
                    ? "var(--btn-primary-fg)"
                    : "var(--fg-soft)",
                  padding: "10px 18px",
                  cursor:
                    demoUnderstood && !demoLoading ? "pointer" : "not-allowed",
                  border: "none",
                  borderRadius: 10,
                  fontFamily: "inherit",
                  fontSize: 14,
                  fontWeight: 500,
                }}
                onClick={loadDemoData}
              >
                {demoLoading ? "..." : T("load_demo")}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {showCatAddModal && (
        <Modal
          title={
            editingCatId
              ? T("modal_edit_category")
              : catAddContext.parent
                ? T("modal_add_subcategory")
                : catAddContext.type === "expense"
                  ? T("add_expense_cat")
                  : T("add_income_cat")
          }
          onClose={() => {
            setShowCatAddModal(false);
            setCatAddError("");
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            {!editingCatId &&
              catAddContext.parent &&
              (() => {
                const parent = categories.find(
                  (c) => c.id === catAddContext.parent,
                );
                return (
                  <div
                    style={{
                      background: "var(--card-inset)",
                      borderRadius: 9,
                      padding: "9px 14px",
                      fontSize: 12,
                      color: "var(--fg-soft)",
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <span>{T("under_label")}</span>
                    <div
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        background: parent?.color,
                      }}
                    />
                    <span style={{ color: "var(--fg)" }}>
                      {parent?.icon} {parent?.name}
                    </span>
                  </div>
                );
              })()}

            <input
              className="inp"
              placeholder={T("placeholder_cat_name")}
              value={catForm.name}
              onChange={(e) => {
                setCatForm((p) => ({
                  ...p,
                  name: e.target.value,
                }));
                setCatAddError("");
              }}
              style={{
                borderColor: catAddError ? "var(--danger)" : undefined,
              }}
              autoFocus
            />
            {catAddError && (
              <div
                style={{
                  fontSize: 12,
                  color: "var(--danger)",
                  marginTop: -6,
                }}
              >
                {catAddError}
              </div>
            )}
            <div className="row">
              <input
                className="inp"
                placeholder={T("placeholder_icon")}
                value={catForm.icon}
                onChange={(e) =>
                  setCatForm((p) => ({
                    ...p,
                    icon: e.target.value,
                  }))
                }
              />
              <input
                type="color"
                value={catForm.color}
                onChange={(e) =>
                  setCatForm((p) => ({
                    ...p,
                    color: e.target.value,
                  }))
                }
                style={{
                  width: 48,
                  height: 42,
                  borderRadius: 10,
                  border: "1px solid var(--rule)",
                  background: "var(--card-inset)",
                  cursor: "pointer",
                  padding: 4,
                  flexShrink: 0,
                }}
              />
            </div>
            <div
              className="row"
              style={{
                justifyContent: "flex-end",
                gap: 8,
                marginTop: 4,
              }}
            >
              <button
                className="btn btn-g"
                onClick={() => setShowCatAddModal(false)}
              >
                {T("btn_cancel")}
              </button>
              <button className="btn btn-p" onClick={addCategory}>
                {editingCatId ? T("btn_save") : T("btn_add")}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {showInvTypeModal && (
        <Modal
          title={
            editingInvTypeId
              ? invTypeContext === "account_types"
                ? T("modal_edit_account_type")
                : T("modal_edit_inv_type")
              : invTypeContext === "account_types"
                ? T("modal_add_account_type")
                : T("modal_add_inv_type")
          }
          onClose={closeInvTypeModal}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            <input
              className="inp"
              placeholder={T("placeholder_inv_type_name")}
              value={invTypeForm.name}
              onChange={(e) => {
                setInvTypeForm((p) => ({
                  ...p,
                  name: e.target.value,
                }));
                setInvTypeError("");
              }}
              style={{
                borderColor: invTypeError ? "var(--danger)" : undefined,
              }}
              autoFocus
            />
            {invTypeError && (
              <div
                style={{
                  fontSize: 12,
                  color: "var(--danger)",
                  marginTop: -6,
                }}
              >
                {invTypeError}
              </div>
            )}
            <div className="row">
              <input
                className="inp"
                placeholder={T("placeholder_icon")}
                value={invTypeForm.icon}
                onChange={(e) =>
                  setInvTypeForm((p) => ({
                    ...p,
                    icon: e.target.value,
                  }))
                }
              />
              <input
                type="color"
                value={invTypeForm.color}
                onChange={(e) =>
                  setInvTypeForm((p) => ({
                    ...p,
                    color: e.target.value,
                  }))
                }
                style={{
                  width: 48,
                  height: 42,
                  borderRadius: 10,
                  border: "1px solid var(--rule)",
                  background: "var(--card-inset)",
                  cursor: "pointer",
                  padding: 4,
                  flexShrink: 0,
                }}
              />
            </div>
            {invTypeContext === "investments" && (
              <>
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    cursor: "pointer",
                    fontSize: 13,
                    color: "var(--fg)",
                    background: "var(--card-inset)",
                    borderRadius: 10,
                    padding: "10px 14px",
                    border: "1px solid var(--rule)",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={invTypeForm.supports_ticker}
                    onChange={(e) =>
                      setInvTypeForm((p) => ({
                        ...p,
                        supports_ticker: e.target.checked,
                      }))
                    }
                  />
                  {T("supports_ticker")}
                </label>
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    cursor: "pointer",
                    fontSize: 13,
                    color: "var(--fg)",
                    background: "var(--card-inset)",
                    borderRadius: 10,
                    padding: "10px 14px",
                    border: "1px solid var(--rule)",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={!!invTypeForm.supports_contribution_source}
                    onChange={(e) =>
                      setInvTypeForm((p) => ({
                        ...p,
                        supports_contribution_source: e.target.checked,
                      }))
                    }
                  />
                  {T("supports_contribution_source")}
                </label>
              </>
            )}
            <div>
              <div
                style={{
                  fontSize: 12,
                  color: "var(--fg-soft)",
                  marginBottom: 5,
                }}
              >
                {T("label_tax_rate")} ({T("tax_rate_zero_none")})
              </div>
              <input
                className="inp"
                type="number"
                step="0.01"
                min="0"
                max="100"
                placeholder="0"
                value={invTypeForm.tax_rate}
                onChange={(e) =>
                  setInvTypeForm((p) => ({
                    ...p,
                    tax_rate: e.target.value,
                  }))
                }
              />
            </div>
            <div
              className="row"
              style={{
                justifyContent: "flex-end",
                gap: 8,
                marginTop: 4,
              }}
            >
              <button className="btn btn-g" onClick={closeInvTypeModal}>
                {T("btn_cancel")}
              </button>
              <button className="btn btn-p" onClick={addInvestmentType}>
                {editingInvTypeId ? T("btn_save") : T("btn_add")}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {showContributionSourceModal && (
        <Modal
          title={
            editingContributionSourceId
              ? T("modal_edit_contribution_source")
              : T("modal_add_contribution_source")
          }
          onClose={closeContributionSourceModal}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            <input
              className="inp"
              placeholder={T("placeholder_contribution_source_name")}
              value={contributionSourceForm.name}
              onChange={(e) => {
                setContributionSourceForm((p) => ({
                  ...p,
                  name: e.target.value,
                }));
                setContributionSourceError("");
              }}
              style={{
                borderColor: contributionSourceError
                  ? "var(--danger)"
                  : undefined,
              }}
              autoFocus
            />
            <div>
              <FieldLabel text={T("sort_order")} />
              <input
                className="inp"
                type="number"
                min="0"
                step="1"
                value={contributionSourceForm.sort_order}
                onChange={(e) =>
                  setContributionSourceForm((p) => ({
                    ...p,
                    sort_order: e.target.value,
                  }))
                }
              />
            </div>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                cursor: "pointer",
                fontSize: 13,
                color: "var(--fg)",
                background: "var(--card-inset)",
                borderRadius: 10,
                padding: "10px 14px",
                border: "1px solid var(--rule)",
              }}
            >
              <input
                type="checkbox"
                checked={contributionSourceForm.is_active}
                onChange={(e) =>
                  setContributionSourceForm((p) => ({
                    ...p,
                    is_active: e.target.checked,
                  }))
                }
              />
              {T("active")}
            </label>
            {contributionSourceError && (
              <div
                style={{
                  fontSize: 12,
                  color: "var(--danger)",
                  marginTop: -6,
                }}
              >
                {contributionSourceError}
              </div>
            )}
            <div
              className="row"
              style={{
                justifyContent: "flex-end",
                gap: 8,
                marginTop: 4,
              }}
            >
              <button
                className="btn btn-g"
                onClick={closeContributionSourceModal}
              >
                {T("btn_cancel")}
              </button>
              <button className="btn btn-p" onClick={saveContributionSource}>
                {editingContributionSourceId ? T("btn_save") : T("btn_add")}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {deleteCatFlow && (
        <Modal
          title={T("modal_delete_category")}
          onClose={() => setDeleteCatFlow(null)}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 14,
            }}
          >
            {/* Category info */}
            <div
              style={{
                background: "var(--card-inset)",
                borderRadius: 10,
                padding: "10px 14px",
                display: "flex",
                alignItems: "center",
                gap: 10,
              }}
            >
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 8,
                  background: `${deleteCatFlow.cat.color}22`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 14,
                  flexShrink: 0,
                }}
              >
                {deleteCatFlow.cat.icon}
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>
                  {deleteCatFlow.cat.name}
                </div>
                <div style={{ fontSize: 11, color: "var(--fg-soft)" }}>
                  {deleteCatFlow.cat.expense_count || 0} {T("transactions")}
                </div>
              </div>
            </div>

            {/* Step: subs */}
            {deleteCatFlow.step === "subs" &&
              (() => {
                const subs = categories.filter(
                  (c) => c.parent === deleteCatFlow.cat.id,
                );
                const otherRootCats = categories.filter(
                  (c) =>
                    !c.parent &&
                    c.category_type === deleteCatFlow.cat.category_type &&
                    c.id !== deleteCatFlow.cat.id,
                );
                return (
                  <div>
                    <div
                      style={{
                        fontSize: 13,
                        color: "var(--fg-soft)",
                        marginBottom: 12,
                      }}
                    >
                      {T("cat_has_subs")}{" "}
                      <strong style={{ color: "var(--fg)" }}>
                        {subs.length} {T("subcategories")}
                      </strong>
                      . {T("what_to_do_subs")}
                    </div>
                    {[
                      ["delete", T("delete_subs_and_tx")],
                      ["reassign", T("move_subs_to")],
                      ["null", T("keep_subs")],
                    ].map(([val, label]) => (
                      <div
                        key={val}
                        className={`radio-opt${deleteCatFlow.subsChoice === val ? " selected" : ""}`}
                        onClick={() =>
                          setDeleteCatFlow((p) => ({
                            ...p,
                            subsChoice: val,
                            subsTarget: null,
                          }))
                        }
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          gap: 10,
                          padding: "10px 12px",
                          borderRadius: 10,
                          cursor: "pointer",
                          border: "1px solid",
                          borderColor:
                            deleteCatFlow.subsChoice === val
                              ? "var(--accent-ring)"
                              : "var(--rule)",
                          background:
                            deleteCatFlow.subsChoice === val
                              ? "var(--accent-ring)"
                              : "var(--card-inset)",
                          marginBottom: 8,
                        }}
                      >
                        <input
                          type="radio"
                          readOnly
                          checked={deleteCatFlow.subsChoice === val}
                          style={{
                            marginTop: 2,
                            flexShrink: 0,
                          }}
                        />
                        <div>
                          <div
                            style={{
                              fontSize: 13,
                              color: "var(--fg)",
                            }}
                          >
                            {label}
                          </div>
                          {val === "reassign" &&
                            deleteCatFlow.subsChoice === "reassign" && (
                              <select
                                className="inp"
                                style={{
                                  marginTop: 8,
                                  fontSize: 12,
                                }}
                                value={deleteCatFlow.subsTarget || ""}
                                onChange={(e) =>
                                  setDeleteCatFlow((p) => ({
                                    ...p,
                                    subsTarget: e.target.value,
                                  }))
                                }
                                onClick={(e) => e.stopPropagation()}
                              >
                                <option value="">{T("select_category")}</option>
                                {otherRootCats.map((c) => (
                                  <option key={c.id} value={c.id}>
                                    {c.icon} {c.name}
                                  </option>
                                ))}
                              </select>
                            )}
                        </div>
                      </div>
                    ))}
                    <div
                      className="row"
                      style={{
                        justifyContent: "flex-end",
                        gap: 8,
                        marginTop: 8,
                      }}
                    >
                      <button
                        className="btn btn-g"
                        onClick={() => setDeleteCatFlow(null)}
                      >
                        {T("btn_cancel")}
                      </button>
                      <button
                        className="btn btn-p"
                        disabled={
                          !deleteCatFlow.subsChoice ||
                          (deleteCatFlow.subsChoice === "reassign" &&
                            !deleteCatFlow.subsTarget)
                        }
                        style={{
                          opacity:
                            !deleteCatFlow.subsChoice ||
                            (deleteCatFlow.subsChoice === "reassign" &&
                              !deleteCatFlow.subsTarget)
                              ? 0.5
                              : 1,
                        }}
                        onClick={() =>
                          setDeleteCatFlow((p) => ({
                            ...p,
                            step: "expenses",
                          }))
                        }
                      >
                        {T("btn_next")}
                      </button>
                    </div>
                  </div>
                );
              })()}

            {/* Step: expenses */}
            {deleteCatFlow.step === "expenses" &&
              (() => {
                const allCatsOfType = categories.filter(
                  (c) =>
                    c.category_type === deleteCatFlow.cat.category_type &&
                    c.id !== deleteCatFlow.cat.id,
                );
                return (
                  <div>
                    <div
                      style={{
                        fontSize: 13,
                        color: "var(--fg-soft)",
                        marginBottom: 12,
                      }}
                    >
                      {T("cat_has_tx")}{" "}
                      <strong style={{ color: "var(--fg)" }}>
                        {deleteCatFlow.cat.expense_count || 0}{" "}
                        {T("transactions")}
                      </strong>
                      . {T("what_to_do_tx")}
                    </div>
                    {[
                      ["delete", T("delete_tx")],
                      ["reassign", T("move_tx_to")],
                      ["null", T("keep_uncategorized")],
                    ].map(([val, label]) => (
                      <div
                        key={val}
                        onClick={() =>
                          setDeleteCatFlow((p) => ({
                            ...p,
                            expChoice: val,
                            expTarget: null,
                          }))
                        }
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          gap: 10,
                          padding: "10px 12px",
                          borderRadius: 10,
                          cursor: "pointer",
                          border: "1px solid",
                          borderColor:
                            deleteCatFlow.expChoice === val
                              ? "var(--accent-ring)"
                              : "var(--rule)",
                          background:
                            deleteCatFlow.expChoice === val
                              ? "var(--accent-ring)"
                              : "var(--card-inset)",
                          marginBottom: 8,
                        }}
                      >
                        <input
                          type="radio"
                          readOnly
                          checked={deleteCatFlow.expChoice === val}
                          style={{
                            marginTop: 2,
                            flexShrink: 0,
                          }}
                        />
                        <div>
                          <div
                            style={{
                              fontSize: 13,
                              color: "var(--fg)",
                            }}
                          >
                            {label}
                          </div>
                          {val === "reassign" &&
                            deleteCatFlow.expChoice === "reassign" && (
                              <select
                                className="inp"
                                style={{
                                  marginTop: 8,
                                  fontSize: 12,
                                }}
                                value={deleteCatFlow.expTarget || ""}
                                onChange={(e) =>
                                  setDeleteCatFlow((p) => ({
                                    ...p,
                                    expTarget: e.target.value,
                                  }))
                                }
                                onClick={(e) => e.stopPropagation()}
                              >
                                <option value="">{T("select_category")}</option>
                                {allCatsOfType.map((c) => (
                                  <option key={c.id} value={c.id}>
                                    {c.icon} {c.name}
                                  </option>
                                ))}
                              </select>
                            )}
                        </div>
                      </div>
                    ))}
                    {!deleteCatFlow.expChoice && (
                      <div
                        style={{
                          fontSize: 12,
                          color: "var(--fg-soft)",
                          marginTop: 4,
                        }}
                      >
                        {T("select_option_to_continue")}
                      </div>
                    )}
                    <div
                      className="row"
                      style={{
                        justifyContent: "flex-end",
                        gap: 8,
                        marginTop: 8,
                      }}
                    >
                      <button
                        className="btn btn-g"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteCatFlow(null);
                        }}
                      >
                        {T("btn_cancel")}
                      </button>
                      <button
                        className="btn"
                        disabled={
                          !deleteCatFlow.expChoice ||
                          (deleteCatFlow.expChoice === "reassign" &&
                            !deleteCatFlow.expTarget)
                        }
                        style={{
                          background:
                            !deleteCatFlow.expChoice ||
                            (deleteCatFlow.expChoice === "reassign" &&
                              !deleteCatFlow.expTarget)
                              ? "var(--danger)"
                              : "var(--danger)",
                          color:
                            !deleteCatFlow.expChoice ||
                            (deleteCatFlow.expChoice === "reassign" &&
                              !deleteCatFlow.expTarget)
                              ? "var(--fg-soft)"
                              : "var(--btn-primary-fg)",
                          padding: "10px 18px",
                          border: "none",
                          borderRadius: 10,
                          fontFamily: "inherit",
                          fontSize: 14,
                          fontWeight: 500,
                          cursor:
                            !deleteCatFlow.expChoice ||
                            (deleteCatFlow.expChoice === "reassign" &&
                              !deleteCatFlow.expTarget)
                              ? "not-allowed"
                              : "pointer",
                        }}
                        onClick={confirmDeleteCategory}
                      >
                        {T("btn_confirm")}
                      </button>
                    </div>
                  </div>
                );
              })()}
          </div>
        </Modal>
      )}

      {deleteContributionSourceFlow && (
        <Modal
          title={T("modal_delete_contribution_source")}
          onClose={() => setDeleteContributionSourceFlow(null)}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 14,
            }}
          >
            <div
              style={{
                background: "var(--card-inset)",
                borderRadius: 10,
                padding: "10px 14px",
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 600 }}>
                {deleteContributionSourceFlow.source.name}
              </div>
              <div style={{ fontSize: 11, color: "var(--fg-soft)" }}>
                {deleteContributionSourceFlow.source.transaction_count || 0}{" "}
                {T("transactions")}
              </div>
            </div>

            <div style={{ fontSize: 13, color: "var(--fg-soft)" }}>
              {T("contribution_source_has_tx")}{" "}
              <strong style={{ color: "var(--fg)" }}>
                {deleteContributionSourceFlow.source.transaction_count || 0}{" "}
                {T("transactions")}
              </strong>
              . {T("what_to_do_tx")}
            </div>

            {[
              ["delete", T("delete_tx")],
              ["reassign", T("move_tx_to_source")],
              ["null", T("keep_uncategorized")],
            ].map(([val, label]) => {
              const targets = contributionSources.filter(
                (source) =>
                  source.id !== deleteContributionSourceFlow.source.id &&
                  source.is_active !== false,
              );
              return (
                <div
                  key={val}
                  onClick={() =>
                    setDeleteContributionSourceFlow((p) => ({
                      ...p,
                      txChoice: val,
                      txTarget: null,
                    }))
                  }
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 10,
                    padding: "10px 12px",
                    borderRadius: 10,
                    cursor: "pointer",
                    border: "1px solid",
                    borderColor:
                      deleteContributionSourceFlow.txChoice === val
                        ? "var(--accent-ring)"
                        : "var(--rule)",
                    background:
                      deleteContributionSourceFlow.txChoice === val
                        ? "var(--accent-ring)"
                        : "var(--card-inset)",
                  }}
                >
                  <input
                    type="radio"
                    readOnly
                    checked={deleteContributionSourceFlow.txChoice === val}
                    style={{ marginTop: 2, flexShrink: 0 }}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, color: "var(--fg)" }}>
                      {label}
                    </div>
                    {val === "reassign" &&
                      deleteContributionSourceFlow.txChoice === "reassign" && (
                        <select
                          className="inp"
                          style={{ marginTop: 8, fontSize: 12 }}
                          value={deleteContributionSourceFlow.txTarget || ""}
                          onChange={(e) =>
                            setDeleteContributionSourceFlow((p) => ({
                              ...p,
                              txTarget: e.target.value,
                            }))
                          }
                          onClick={(e) => e.stopPropagation()}
                        >
                          <option value="">
                            {T("select_contribution_source")}
                          </option>
                          {targets.map((source) => (
                            <option key={source.id} value={source.id}>
                              {source.name}
                            </option>
                          ))}
                        </select>
                      )}
                  </div>
                </div>
              );
            })}

            <div
              className="row"
              style={{
                justifyContent: "flex-end",
                gap: 8,
                marginTop: 4,
              }}
            >
              <button
                className="btn btn-g"
                onClick={() => setDeleteContributionSourceFlow(null)}
              >
                {T("btn_cancel")}
              </button>
              <button
                className="btn"
                disabled={
                  !deleteContributionSourceFlow.txChoice ||
                  (deleteContributionSourceFlow.txChoice === "reassign" &&
                    !deleteContributionSourceFlow.txTarget)
                }
                style={{
                  background: "var(--danger)",
                  color:
                    !deleteContributionSourceFlow.txChoice ||
                    (deleteContributionSourceFlow.txChoice === "reassign" &&
                      !deleteContributionSourceFlow.txTarget)
                      ? "var(--fg-soft)"
                      : "var(--btn-primary-fg)",
                  padding: "10px 18px",
                  border: "none",
                  borderRadius: 10,
                  fontFamily: "inherit",
                  fontSize: 14,
                  fontWeight: 500,
                  cursor:
                    !deleteContributionSourceFlow.txChoice ||
                    (deleteContributionSourceFlow.txChoice === "reassign" &&
                      !deleteContributionSourceFlow.txTarget)
                      ? "not-allowed"
                      : "pointer",
                }}
                onClick={confirmDeleteContributionSource}
              >
                {T("btn_confirm")}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {deleteInvTypeFlow && (
        <Modal
          title={
            deleteInvTypeFlow.invType.is_bank_account
              ? T("modal_delete_account_type")
              : T("modal_delete_inv_type")
          }
          onClose={() => setDeleteInvTypeFlow(null)}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 14,
            }}
          >
            {/* Type info */}
            <div
              style={{
                background: "var(--card-inset)",
                borderRadius: 10,
                padding: "10px 14px",
                display: "flex",
                alignItems: "center",
                gap: 10,
              }}
            >
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 8,
                  background: `${deleteInvTypeFlow.invType.color}22`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 14,
                  flexShrink: 0,
                }}
              >
                {deleteInvTypeFlow.invType.icon}
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>
                  {deleteInvTypeFlow.invType.name}
                </div>
                <div style={{ fontSize: 11, color: "var(--fg-soft)" }}>
                  {deleteInvTypeFlow.invType.asset_count || 0} {T("assets")}
                </div>
              </div>
            </div>

            <div style={{ fontSize: 13, color: "var(--fg-soft)" }}>
              {T("inv_type_has_assets")}{" "}
              <strong style={{ color: "var(--fg)" }}>
                {deleteInvTypeFlow.invType.asset_count || 0} {T("assets")}
              </strong>
              .
            </div>

            {[
              ["delete", T("delete_all_assets")],
              ["reassign", T("reassign_assets_to")],
              ["null", T("keep_assets_untyped")],
            ].map(([val, label]) => {
              const otherTypes = investmentTypes.filter(
                (t) => t.id !== deleteInvTypeFlow.invType.id,
              );
              return (
                <div
                  key={val}
                  onClick={() =>
                    setDeleteInvTypeFlow((p) => ({
                      ...p,
                      assetsChoice: val,
                      assetsTarget: null,
                    }))
                  }
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 10,
                    padding: "10px 12px",
                    borderRadius: 10,
                    cursor: "pointer",
                    border: "1px solid",
                    borderColor:
                      deleteInvTypeFlow.assetsChoice === val
                        ? "var(--accent-ring)"
                        : "var(--rule)",
                    background:
                      deleteInvTypeFlow.assetsChoice === val
                        ? "var(--accent-ring)"
                        : "var(--card-inset)",
                  }}
                >
                  <input
                    type="radio"
                    readOnly
                    checked={deleteInvTypeFlow.assetsChoice === val}
                    style={{ marginTop: 2, flexShrink: 0 }}
                  />
                  <div style={{ flex: 1 }}>
                    <div
                      style={{
                        fontSize: 13,
                        color: "var(--fg)",
                      }}
                    >
                      {label}
                    </div>
                    {val === "reassign" &&
                      deleteInvTypeFlow.assetsChoice === "reassign" && (
                        <select
                          className="inp"
                          style={{
                            marginTop: 8,
                            fontSize: 12,
                          }}
                          value={deleteInvTypeFlow.assetsTarget || ""}
                          onChange={(e) =>
                            setDeleteInvTypeFlow((p) => ({
                              ...p,
                              assetsTarget: e.target.value,
                            }))
                          }
                          onClick={(e) => e.stopPropagation()}
                        >
                          <option value="">{T("select_type")}</option>
                          {otherTypes.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.icon} {t.name}
                            </option>
                          ))}
                        </select>
                      )}
                  </div>
                </div>
              );
            })}

            <div
              className="row"
              style={{
                justifyContent: "flex-end",
                gap: 8,
                marginTop: 4,
              }}
            >
              <button
                className="btn btn-g"
                onClick={() => setDeleteInvTypeFlow(null)}
              >
                {T("btn_cancel")}
              </button>
              <button
                className="btn"
                disabled={
                  !deleteInvTypeFlow.assetsChoice ||
                  (deleteInvTypeFlow.assetsChoice === "reassign" &&
                    !deleteInvTypeFlow.assetsTarget)
                }
                style={{
                  background:
                    !deleteInvTypeFlow.assetsChoice ||
                    (deleteInvTypeFlow.assetsChoice === "reassign" &&
                      !deleteInvTypeFlow.assetsTarget)
                      ? "var(--danger)"
                      : "var(--danger)",
                  color:
                    !deleteInvTypeFlow.assetsChoice ||
                    (deleteInvTypeFlow.assetsChoice === "reassign" &&
                      !deleteInvTypeFlow.assetsTarget)
                      ? "var(--fg-soft)"
                      : "var(--btn-primary-fg)",
                  padding: "10px 18px",
                  border: "none",
                  borderRadius: 10,
                  fontFamily: "inherit",
                  fontSize: 14,
                  fontWeight: 500,
                  cursor:
                    !deleteInvTypeFlow.assetsChoice ||
                    (deleteInvTypeFlow.assetsChoice === "reassign" &&
                      !deleteInvTypeFlow.assetsTarget)
                      ? "not-allowed"
                      : "pointer",
                }}
                onClick={confirmDeleteInvType}
              >
                {T("btn_confirm")}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {showRecurringModal && (
        <Modal
          title={
            editingRecurringId
              ? T("modal_edit_recurring")
              : T("modal_add_recurring")
          }
          onClose={closeRecurringModal}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            <div>
              <FieldLabel text={T("label_description")} />
              <input
                className="inp"
                placeholder={T("placeholder_description")}
                value={recurringForm.description}
                onChange={(e) =>
                  setRecurringForm((p) => ({
                    ...p,
                    description: e.target.value,
                  }))
                }
              />
            </div>
            <div>
              <FieldLabel text={T("label_amount")} />
              <input
                className="inp"
                type="text"
                inputMode="decimal"
                placeholder={decimalSeparator === "," ? "0,00" : "0.00"}
                value={recurringForm.amount}
                onChange={(e) =>
                  setRecurringForm((p) => ({
                    ...p,
                    amount: filterAmountInput(e.target.value),
                  }))
                }
              />
            </div>
            <div>
              <FieldLabel text={T("label_category")} />
              <CategorySelect
                value={recurringForm.category}
                onChange={(val) =>
                  setRecurringForm((p) => ({
                    ...p,
                    category: val,
                  }))
                }
                categoryType="expense"
                categories={categories}
                placeholder={T("no_category")}
              />
            </div>
            <div>
              <FieldLabel text={T("label_linked_asset")} />
              <select
                className="inp"
                value={recurringForm.linked_asset}
                onChange={(e) =>
                  setRecurringForm((p) => ({
                    ...p,
                    linked_asset: e.target.value,
                  }))
                }
              >
                <option value="">{T("no_linked_asset")}</option>
                {bankAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.investment_type_detail?.icon || ""} {a.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <FieldLabel text={T("recurring_frequency")} />
              <select
                className="inp"
                value={recurringForm.frequency}
                onChange={(e) =>
                  setRecurringForm((p) => ({
                    ...p,
                    frequency: e.target.value,
                    month_of_year:
                      e.target.value === "YEARLY"
                        ? p.month_of_year || String(new Date().getMonth() + 1)
                        : "",
                  }))
                }
              >
                <option value="MONTHLY">{T("frequency_MONTHLY")}</option>
                <option value="YEARLY">{T("frequency_YEARLY")}</option>
              </select>
            </div>
            {recurringForm.frequency === "YEARLY" && (
              <div>
                <FieldLabel text={T("recurring_month")} />
                <select
                  className="inp"
                  value={recurringForm.month_of_year}
                  onChange={(e) =>
                    setRecurringForm((p) => ({
                      ...p,
                      month_of_year: e.target.value,
                    }))
                  }
                >
                  {MONTHS.map((monthName, idx) => (
                    <option key={monthName} value={idx + 1}>
                      {monthName}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <FieldLabel text={T("recurring_day")} />
              <input
                className="inp"
                type="number"
                min="1"
                max="31"
                value={recurringForm.day_of_month}
                onChange={(e) =>
                  setRecurringForm((p) => ({
                    ...p,
                    day_of_month: e.target.value,
                  }))
                }
              />
            </div>
            <div>
              <FieldLabel text={T("recurring_start_date")} />
              <input
                className="inp"
                type="date"
                required
                value={recurringForm.start_date}
                onChange={(e) =>
                  setRecurringForm((p) => ({
                    ...p,
                    start_date: e.target.value,
                  }))
                }
              />
            </div>
            <div>
              <FieldLabel text={T("recurring_end_date")} />
              <input
                className="inp"
                type="date"
                value={recurringForm.end_date}
                onChange={(e) =>
                  setRecurringForm((p) => ({
                    ...p,
                    end_date: e.target.value,
                  }))
                }
              />
            </div>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                cursor: "pointer",
                fontSize: 13,
              }}
            >
              <input
                type="checkbox"
                checked={recurringForm.is_active}
                onChange={(e) =>
                  setRecurringForm((p) => ({
                    ...p,
                    is_active: e.target.checked,
                  }))
                }
              />
              {T("recurring_active")}
            </label>
            {recurringError && (
              <div
                style={{
                  fontSize: 12,
                  color: "var(--danger)",
                  background: "#ff6b6b11",
                  border: "1px solid #ff6b6b33",
                  borderRadius: 8,
                  padding: "8px 10px",
                }}
              >
                {recurringError}
              </div>
            )}
            <div
              style={{
                display: "flex",
                gap: 8,
                justifyContent: "flex-end",
              }}
            >
              <button className="btn btn-g" onClick={closeRecurringModal}>
                {T("btn_cancel")}
              </button>
              <button
                className="btn btn-p"
                disabled={recurringSaving}
                onClick={submitRecurring}
              >
                {recurringSaving
                  ? "..."
                  : editingRecurringId
                    ? T("btn_update")
                    : T("btn_add")}
              </button>
            </div>
          </div>
        </Modal>
      )}
      {showPacModal && (
        <Modal
          title={editingPacId ? T("modal_edit_pac") : T("modal_add_pac")}
          onClose={closePacModal}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <FieldLabel text={T("label_name")} />
              <input
                className="inp"
                value={pacForm.name}
                onChange={(e) =>
                  setPacForm((p) => ({ ...p, name: e.target.value }))
                }
              />
            </div>
            <div>
              <FieldLabel text={T("label_asset")} />
              <select
                className="inp"
                value={pacForm.asset}
                onChange={(e) =>
                  setPacForm((p) => ({ ...p, asset: e.target.value }))
                }
              >
                <option value="">{T("select_asset")}</option>
                {investments
                  .filter((a) => a.tracking_type === "AUTO" && !a.is_archived)
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.investment_type_detail?.icon || ""} {a.name}
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <FieldLabel text={T("pac_source_account")} />
              <select
                className="inp"
                value={pacForm.source_account}
                onChange={(e) =>
                  setPacForm((p) => ({
                    ...p,
                    source_account: e.target.value,
                  }))
                }
              >
                <option value="">{T("no_linked_asset")}</option>
                {bankAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.investment_type_detail?.icon || ""} {a.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <FieldLabel text={T("label_amount")} />
              <input
                className="inp"
                type="text"
                inputMode="decimal"
                placeholder={decimalSeparator === "," ? "0,00" : "0.00"}
                value={pacForm.amount}
                onChange={(e) =>
                  setPacForm((p) => ({
                    ...p,
                    amount: filterAmountInput(e.target.value),
                  }))
                }
              />
            </div>
            <div>
              <FieldLabel text={T("recurring_frequency")} />
              <select
                className="inp"
                value={pacForm.frequency}
                onChange={(e) =>
                  setPacForm((p) => ({
                    ...p,
                    frequency: e.target.value,
                    anchor_month: [
                      "QUARTERLY",
                      "SEMIANNUAL",
                      "ANNUAL",
                    ].includes(e.target.value)
                      ? p.anchor_month || String(new Date().getMonth() + 1)
                      : "",
                  }))
                }
              >
                <option value="WEEKLY">{T("frequency_WEEKLY")}</option>
                <option value="MONTHLY">{T("frequency_MONTHLY")}</option>
                <option value="QUARTERLY">{T("frequency_QUARTERLY")}</option>
                <option value="SEMIANNUAL">{T("frequency_SEMIANNUAL")}</option>
                <option value="ANNUAL">{T("frequency_ANNUAL")}</option>
              </select>
            </div>
            {pacForm.frequency === "WEEKLY" ? (
              <div>
                <FieldLabel text={T("pac_day_of_week")} />
                <select
                  className="inp"
                  value={pacForm.day_of_week}
                  onChange={(e) =>
                    setPacForm((p) => ({
                      ...p,
                      day_of_week: e.target.value,
                    }))
                  }
                >
                  {[1, 2, 3, 4, 5, 6, 7].map((day) => (
                    <option key={day} value={day}>
                      {T(`weekday_${day}`)}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div>
                <FieldLabel text={T("recurring_day")} />
                <input
                  className="inp"
                  type="number"
                  min="1"
                  max="31"
                  value={pacForm.day_of_month}
                  onChange={(e) =>
                    setPacForm((p) => ({
                      ...p,
                      day_of_month: e.target.value,
                    }))
                  }
                />
              </div>
            )}
            {["QUARTERLY", "SEMIANNUAL", "ANNUAL"].includes(
              pacForm.frequency,
            ) && (
              <div>
                <FieldLabel text={T("pac_anchor_month")} />
                <select
                  className="inp"
                  value={pacForm.anchor_month}
                  onChange={(e) =>
                    setPacForm((p) => ({
                      ...p,
                      anchor_month: e.target.value,
                    }))
                  }
                >
                  {MONTHS.map((monthName, idx) => (
                    <option key={monthName} value={idx + 1}>
                      {monthName}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <FieldLabel text={T("recurring_start_date")} />
              <input
                className="inp"
                type="date"
                required
                value={pacForm.start_date}
                onChange={(e) =>
                  setPacForm((p) => ({ ...p, start_date: e.target.value }))
                }
              />
            </div>
            <div>
              <FieldLabel text={T("recurring_end_date")} />
              <input
                className="inp"
                type="date"
                value={pacForm.end_date}
                onChange={(e) =>
                  setPacForm((p) => ({ ...p, end_date: e.target.value }))
                }
              />
            </div>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                cursor: "pointer",
                fontSize: 13,
              }}
            >
              <input
                type="checkbox"
                checked={pacForm.generated_transactions_verified}
                onChange={(e) =>
                  setPacForm((p) => ({
                    ...p,
                    generated_transactions_verified: e.target.checked,
                  }))
                }
              />
              {T("pac_generated_verified")}
            </label>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                cursor: "pointer",
                fontSize: 13,
              }}
            >
              <input
                type="checkbox"
                checked={pacForm.is_active}
                onChange={(e) =>
                  setPacForm((p) => ({ ...p, is_active: e.target.checked }))
                }
              />
              {T("recurring_active")}
            </label>
            {pacError && (
              <div
                style={{
                  fontSize: 12,
                  color: "var(--danger)",
                  background: "#ff6b6b11",
                  border: "1px solid #ff6b6b33",
                  borderRadius: 8,
                  padding: "8px 10px",
                }}
              >
                {pacError}
              </div>
            )}
            <div
              style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}
            >
              <button className="btn btn-g" onClick={closePacModal}>
                {T("btn_cancel")}
              </button>
              <button
                className="btn btn-p"
                disabled={pacSaving}
                onClick={submitPac}
              >
                {pacSaving
                  ? "..."
                  : editingPacId
                    ? T("btn_update")
                    : T("btn_add")}
              </button>
            </div>
          </div>
        </Modal>
      )}
      {deleteRecurringTarget && (
        <Modal
          title={T("modal_are_you_sure")}
          onClose={() => setDeleteRecurringTarget(null)}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ fontSize: 13, color: "var(--fg-soft)" }}>
              {T("recurring_delete_confirm")} "
              {deleteRecurringTarget.description}"?
            </div>
            <div className="row" style={{ justifyContent: "flex-end", gap: 8 }}>
              <button
                className="btn btn-g"
                onClick={() => setDeleteRecurringTarget(null)}
              >
                {T("btn_cancel")}
              </button>
              <button
                className="btn btn-r"
                disabled={recurringSaving}
                onClick={async () => {
                  const ok = await deleteRecurring(deleteRecurringTarget);
                  if (ok) setDeleteRecurringTarget(null);
                }}
              >
                {recurringSaving ? "..." : T("btn_delete")}
              </button>
            </div>
          </div>
        </Modal>
      )}
      {deletePacTarget && (
        <Modal
          title={T("modal_are_you_sure")}
          onClose={() => setDeletePacTarget(null)}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ fontSize: 13, color: "var(--fg-soft)" }}>
              {T("pac_delete_confirm")} "{deletePacTarget.name}"?
            </div>
            <div className="row" style={{ justifyContent: "flex-end", gap: 8 }}>
              <button
                className="btn btn-g"
                onClick={() => setDeletePacTarget(null)}
              >
                {T("btn_cancel")}
              </button>
              <button
                className="btn btn-r"
                disabled={pacSaving}
                onClick={async () => {
                  const ok = await deletePac(deletePacTarget);
                  if (ok) setDeletePacTarget(null);
                }}
              >
                {pacSaving ? "..." : T("btn_delete")}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

function SharingSection({ T }) {
  const { grants, fetchGrants, apiFetch } = useApp();
  const [email, setEmail] = useState("");
  const [permission, setPermission] = useState("read");
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const given = grants?.given ?? [];
  const received = grants?.received ?? [];

  const handleShare = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const res = await apiFetch(`${API}/auth/grants/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, permission }),
    });
    setSaving(false);
    if (res.ok) {
      setEmail("");
      fetchGrants();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(
        data.error === "user_not_found"
          ? T("user_not_found")
          : data.error || "Error",
      );
    }
  };

  const handleRevoke = async (id) => {
    await apiFetch(`${API}/auth/grants/${id}/`, { method: "DELETE" });
    fetchGrants();
  };

  const handlePermChange = async (id, newPerm) => {
    await apiFetch(`${API}/auth/grants/${id}/`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ permission: newPerm }),
    });
    fetchGrants();
  };

  return (
    <div>
      {/* Form condivisione */}
      <form
        onSubmit={handleShare}
        style={{
          display: "flex",
          gap: 8,
          marginBottom: 16,
          flexWrap: "wrap",
        }}
      >
        <input
          className="inp"
          type="email"
          placeholder={T("share_with_placeholder")}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          style={{ flex: 1, minWidth: 180 }}
        />
        <select
          className="inp"
          value={permission}
          onChange={(e) => setPermission(e.target.value)}
          style={{ minWidth: 140 }}
        >
          <option value="read">{T("permission_read")}</option>
          <option value="write">{T("permission_write")}</option>
          <option value="full">{T("permission_full")}</option>
        </select>
        <button
          type="submit"
          className="btn"
          disabled={saving}
          style={{ whiteSpace: "nowrap", padding: "8px 16px" }}
        >
          {T("share_btn")}
        </button>
      </form>
      {error && (
        <div style={{ color: "var(--danger)", fontSize: 12, marginBottom: 10 }}>
          {error}
        </div>
      )}

      {/* Grant dati */}
      <div
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: "var(--fg-soft)",
          marginBottom: 8,
        }}
      >
        {T("sharing_given_title")}
      </div>
      {given.length === 0 ? (
        <div
          style={{ fontSize: 12, color: "var(--fg-soft)", marginBottom: 12 }}
        >
          {T("no_grants_given")}
        </div>
      ) : (
        given.map((g) => (
          <div
            key={g.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 8,
              padding: "8px 10px",
              background: "var(--rule-soft)",
              borderRadius: 8,
            }}
          >
            <span style={{ flex: 1, fontSize: 13 }}>{g.grantee_email}</span>
            <select
              className="inp"
              value={g.permission}
              onChange={(e) => handlePermChange(g.id, e.target.value)}
              style={{
                fontSize: 11,
                padding: "2px 6px",
                minWidth: 110,
              }}
            >
              <option value="read">{T("permission_read")}</option>
              <option value="write">{T("permission_write")}</option>
              <option value="full">{T("permission_full")}</option>
            </select>
            <button
              onClick={() => handleRevoke(g.id)}
              className="btn btn-r"
              style={{ fontSize: 11, padding: "2px 10px" }}
            >
              {T("revoke_access")}
            </button>
          </div>
        ))
      )}

      {/* Grant ricevuti */}
      <div
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: "var(--fg-soft)",
          marginBottom: 8,
          marginTop: 8,
        }}
      >
        {T("sharing_received_title")}
      </div>
      {received.length === 0 ? (
        <div style={{ fontSize: 12, color: "var(--fg-soft)" }}>
          {T("no_grants_received")}
        </div>
      ) : (
        received.map((g) => (
          <div
            key={g.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 8,
              padding: "8px 10px",
              background: "var(--rule-soft)",
              borderRadius: 8,
            }}
          >
            <span style={{ flex: 1, fontSize: 13 }}>{g.owner_email}</span>
            <span
              style={{
                fontSize: 11,
                color: "var(--fg-soft)",
                padding: "2px 8px",
                background: "var(--card-inset)",
                borderRadius: 6,
              }}
            >
              {g.permission === "read"
                ? T("permission_read")
                : g.permission === "write"
                  ? T("permission_write")
                  : T("permission_full")}
            </span>
          </div>
        ))
      )}
    </div>
  );
}
