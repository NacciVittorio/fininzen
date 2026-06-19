import { useEffect, useMemo, useState } from "react";
import { useApp } from "../context/useApp";
import {
  formatDate,
  localeFromSeparator,
  parseFlexibleDecimal,
  today,
} from "../utils/formatters";
import { useFormatters } from "../utils/useFormatters";
import { regroupTargets } from "../utils/allocationGroups";
import { PieChart } from "../components/Charts";
import FieldLabel from "../components/FieldLabel";
import AssetCard from "../components/AssetCard";
import InvSummaryCard from "../components/portfolio/InvSummaryCard";
import PrivacyValue from "../components/PrivacyValue";
import {
  BottomSheet,
  CategoryDot,
  GroupedList,
  Icon,
  Label,
  LargeTitleHeader,
  MonthPicker,
  Pill,
  PullToRefresh,
  SegmentedControl,
  SheetTitle,
  SpeedDialFab,
  VerifiedToggleButton,
} from "../components/ui";
import { API } from "../utils/api";

// Estimated realized tax on a SELL, computed from the asset's *current* effective
// rate. Used both to prefill the editable tax field on a new sell (the snapshot
// the user can adjust) and to show the hint under the live total. Returns 0 when
// inputs are incomplete or the rate is 0. Mirrors services.realized_tax_for_sell.
function estimateSellTax(form, asset, editingId, editingItem) {
  if (form.transaction_type !== "sell") return 0;
  const shares = parseFlexibleDecimal(form.shares);
  const price = parseFlexibleDecimal(form.price_per_share);
  const fee = form.fee ? parseFlexibleDecimal(form.fee) : 0;
  if (
    !Number.isFinite(shares) ||
    !Number.isFinite(price) ||
    !Number.isFinite(fee) ||
    shares <= 0 ||
    price <= 0
  ) {
    return 0;
  }
  const rate = Number.parseFloat(
    asset?.effective_tax_rate ??
      editingItem?.asset?.effective_tax_rate ??
      asset?.investment_type_detail?.tax_rate ??
      0,
  );
  if (!(rate > 0)) return 0;
  const editingShares = Number.parseFloat(editingItem?.shares || 0);
  const editingTaxCostBasis = Number.parseFloat(
    editingItem?.tax_cost_basis || 0,
  );
  const assetShares = Number.parseFloat(asset?.shares || 0);
  const assetTaxCostBasis = Number.parseFloat(
    asset?.tax_cost_basis ?? asset?.invested_capital ?? 0,
  );
  const taxCostPerShare =
    editingId && Number.isFinite(editingShares) && editingShares > 0
      ? editingTaxCostBasis / editingShares
      : assetShares > 0 && Number.isFinite(assetTaxCostBasis)
        ? assetTaxCostBasis / assetShares
        : 0;
  const total = shares * price;
  return Math.max(total - shares * taxCostPerShare - fee, 0) * rate;
}

function TickerResultsDrop({ results, onSelect, T }) {
  return (
    <div className="ticker-drop">
      {results.map((r, i) => (
        <div
          key={`${r.source || "unknown"}-${r.symbol || i}`}
          className="ticker-opt"
          onMouseDown={(e) => {
            e.preventDefault();
            onSelect(r);
          }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.background = "var(--rule)")
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.background = "transparent")
          }
        >
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontWeight: 600,
              color: "var(--fg)",
            }}
          >
            {r.symbol}
          </span>
          <span style={{ color: "var(--fg-soft)", marginLeft: 8 }}>
            — {r.name}
            {r.source && (
              <span style={{ marginLeft: 6 }}>
                · {r.source === "BORSA_ITALIANA" ? "Borsa Italiana" : "Yahoo"}
              </span>
            )}
            {r.match_reason === "isin" && (
              <span style={{ marginLeft: 6 }}>· {T("matched_by_isin")}</span>
            )}
            {r.match_reason === "name" && (
              <span style={{ marginLeft: 6 }}>· {T("matched_by_name")}</span>
            )}
          </span>
          {r.exchange && (
            <span
              style={{
                color: "var(--accent)",
                marginLeft: 8,
                fontSize: 11,
              }}
            >
              ({r.exchange})
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

const ALL_ASSET_TX_TYPES = ["buy", "sell", "adjustment"];

function FilterChip({ active, onClick, children, testId }) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      aria-pressed={active}
      className="pressable"
      style={{
        background: active ? "var(--accent-soft)" : "var(--card-inset)",
        color: active ? "var(--accent-deep)" : "var(--fg)",
        border: `1px solid ${active ? "var(--accent-ring)" : "var(--rule)"}`,
        borderRadius: 999,
        padding: "8px 14px",
        fontSize: 13,
        fontWeight: active ? 700 : 500,
        cursor: "pointer",
        fontFamily: "inherit",
      }}
    >
      {children}
    </button>
  );
}

function SheetSection({ label, children }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <Label style={{ marginBottom: 8, display: "block" }}>{label}</Label>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {children}
      </div>
    </div>
  );
}

// All transaction-feed filters in one bottom sheet (replaces the five
// per-filter popovers; mirrors the Cash Flow CfFiltersSheet precedent).
function TxFiltersSheet({
  open,
  onClose,
  T,
  investments,
  archivedInvestments = [],
  filters,
  setFilters,
  toggleType,
  periodMode,
  setPeriodMode,
}) {
  const reset = () =>
    setFilters((p) => ({
      ...p,
      asset_ids: [],
      types: ALL_ASSET_TX_TYPES,
      verified: null,
      date_from: null,
      date_to: null,
      ordering: "-date",
    }));

  return (
    <BottomSheet open={open} onClose={onClose} ariaLabel={T("cf_filters")}>
      <div style={{ padding: "8px 18px 18px" }}>
        <SheetTitle>{T("cf_filters")}</SheetTitle>

        <SheetSection label={T("portfolio_tx_filter_all_assets")}>
          <FilterChip
            active={!filters.asset_ids?.length}
            onClick={() => setFilters((p) => ({ ...p, asset_ids: [] }))}
          >
            {T("portfolio_tx_filter_all_assets")}
          </FilterChip>
          {investments.map((a) => (
            <FilterChip
              key={a.id}
              active={String(filters.asset_ids?.[0]) === String(a.id)}
              onClick={() => setFilters((p) => ({ ...p, asset_ids: [a.id] }))}
            >
              {a.name}
            </FilterChip>
          ))}
          {archivedInvestments.map((a) => (
            <FilterChip
              key={a.id}
              active={String(filters.asset_ids?.[0]) === String(a.id)}
              onClick={() => setFilters((p) => ({ ...p, asset_ids: [a.id] }))}
            >
              {`${a.name} (${T("label_archived")})`}
            </FilterChip>
          ))}
        </SheetSection>

        <SheetSection label={T("type_filter_label")}>
          <FilterChip
            active={filters.types.length === ALL_ASSET_TX_TYPES.length}
            onClick={() =>
              setFilters((p) => ({ ...p, types: ALL_ASSET_TX_TYPES }))
            }
          >
            {T("cf_all_types")}
          </FilterChip>
          {ALL_ASSET_TX_TYPES.map((type) => (
            <FilterChip
              key={type}
              active={
                filters.types.includes(type) &&
                filters.types.length < ALL_ASSET_TX_TYPES.length
              }
              onClick={() => toggleType(type)}
            >
              {T(`tx_type_${type}`)}
            </FilterChip>
          ))}
        </SheetSection>

        <SheetSection label={T("verified_filter_label")}>
          {[
            { val: null, label: T("verified_filter_all") },
            { val: true, label: T("verified_filter_yes") },
            { val: false, label: T("verified_filter_no") },
          ].map(({ val, label }) => (
            <FilterChip
              key={String(val)}
              active={filters.verified === val}
              onClick={() => setFilters((p) => ({ ...p, verified: val }))}
            >
              {label}
            </FilterChip>
          ))}
        </SheetSection>

        <div style={{ marginBottom: 18 }}>
          <Label style={{ marginBottom: 8, display: "block" }}>
            {T("period_label")}
          </Label>
          <div style={{ marginBottom: 10 }}>
            <FilterChip
              active={!filters.date_from}
              onClick={() =>
                setFilters((p) => ({ ...p, date_from: null, date_to: null }))
              }
            >
              {T("time_all")}
            </FilterChip>
          </div>
          <MonthPicker
            month={
              filters.date_from
                ? new Date(filters.date_from).getMonth() + 1
                : new Date().getMonth() + 1
            }
            year={
              filters.date_from
                ? new Date(filters.date_from).getFullYear()
                : new Date().getFullYear()
            }
            viewMode={periodMode}
            onChange={({ month, year }) => {
              if (month) {
                const from = `${year}-${String(month).padStart(2, "0")}-01`;
                const lastDay = new Date(year, month, 0).getDate();
                const to = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
                setFilters((p) => ({ ...p, date_from: from, date_to: to }));
              } else {
                setFilters((p) => ({
                  ...p,
                  date_from: `${year}-01-01`,
                  date_to: `${year}-12-31`,
                }));
              }
            }}
            onViewModeChange={setPeriodMode}
          />
        </div>

        <SheetSection label={T("sort_label")}>
          {[
            { val: "-date", label: T("sort_date_desc") },
            { val: "date", label: T("sort_date_asc") },
            { val: "-amount", label: T("sort_amount_desc") },
            { val: "amount", label: T("sort_amount_asc") },
          ].map(({ val, label }) => (
            <FilterChip
              key={val}
              testId={`asset-tx-sort-option-${val}`}
              active={(filters.ordering || "-date") === val}
              onClick={() => setFilters((p) => ({ ...p, ordering: val }))}
            >
              {label}
            </FilterChip>
          ))}
        </SheetSection>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 8,
            marginTop: 4,
          }}
        >
          <button className="btn btn-g pressable" onClick={reset}>
            {T("cf_filters_reset", "Reset")}
          </button>
          <button className="btn btn-p pressable" onClick={onClose}>
            {T("btn_close", "OK")}
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}

export default function PortfolioView() {
  const { formatEur } = useFormatters();
  const {
    tab,
    setTab,
    lang,
    setLang,
    T,
    decimalSeparator,
    MONTHS,
    dashConfig,
    showDashSettings,
    setShowDashSettings,
    toggleDashCard,
    moveDashCard,
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
    setShowRecurringModal,
    editingRecurringId,
    setEditingRecurringId,
    recurringForm,
    setRecurringForm,
    generateRecurringMsg,
    setGenerateRecurringMsg,
    monthlyInvestmentStats,
    fetchMonthlyInvestmentStats,
    invStatsMonth,
    invStatsYear,
    setInvStatsMonth,
    setInvStatsYear,
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
    priceRefreshCounter,
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
    txDeleteConfirm,
    setTxDeleteConfirm,
    tickerQuery,
    tickerResults,
    tickerLoading,
    showTickerDrop,
    tickerSearchOrigin,
    setShowTickerDrop,
    csvFile,
    csvParsed,
    csvSep,
    csvMap,
    setCsvMap,
    csvSignConv,
    setCsvSignConv,
    csvImportResult,
    csvImporting,
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
    fetchBudgets,
    fetchRecurringExpenses,
    fetchAllocationData,
    openExpenseModal,
    closeExpenseModal,
    submitExpense,
    deleteExpense,
    openAssetAdd,
    openAssetEdit,
    closeAssetModal,
    saveAsset,
    deleteAsset,
    archiveAsset,
    unarchiveAsset,
    archivedInvestments,
    refreshPrices,
    openAdjustBalance,
    closeAdjustModal,
    saveAdjustBalance,
    showAdjustModal,
    adjustForm,
    setAdjustForm,
    adjustError,
    submitAddTxFromModal,
    deleteTx,
    // asset transactions feed
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
    handleTickerInput,
    handleIsinInput,
    handlePriceSourceChange,
    selectTicker,
    addCategory,
    openDeleteCatFlow,
    confirmDeleteCategory,
    openAddMain,
    openAddSub,
    toggleExpandCat,
    addInvestmentType,
    openDeleteInvTypeFlow,
    confirmDeleteInvType,
    resetTransactions,
    resetPortfolio,
    loadDemoData,
    handleCSVUpload,
    handleCsvSepChange,
    doImportCSV,
    apiFetch,
    isValueHidden,
    transactionPrefs,
  } = useApp();

  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addTxAssetId, setAddTxAssetId] = useState("");
  const [addTxForm, setAddTxForm] = useState({
    transaction_type: "buy",
    date: today(),
    shares: "",
    price_per_share: "",
    fee: "",
    tax_amount: "",
    notes: "",
    linked_account_id: "",
    contribution_source: "",
    is_verified: false,
  });
  const [addTxError, setAddTxError] = useState(null);
  const [addTxLoading, setAddTxLoading] = useState(false);
  const [editingAddTxId, setEditingAddTxId] = useState(null);
  const [editingAddTxItem, setEditingAddTxItem] = useState(null);
  const [addTxPriceTouched, setAddTxPriceTouched] = useState(false);
  // Whether the user has hand-edited the tax field. Drives tax_amount_is_manual:
  // an untouched field keeps the auto snapshot (server recomputes at the current
  // rate); a touched one is a manual override the rate-change popup won't rewrite.
  const [addTxTaxTouched, setAddTxTaxTouched] = useState(false);
  const [assetTxPeriodMode, setAssetTxPeriodMode] = useState("month");
  const [debouncedAssetTxFilters, setDebouncedAssetTxFilters] =
    useState(assetTxFilters);
  const [allocGroup, setAllocGroup] = useState("all");
  const [activeActionRow, setActiveActionRow] = useState(null);
  const [archivedInvExpanded, setArchivedInvExpanded] = useState(false);
  const [openSwipeId, setOpenSwipeId] = useState(null);
  const [txFiltersSheetOpen, setTxFiltersSheetOpen] = useState(false);
  const [archiveBlockedModal, setArchiveBlockedModal] = useState(null);
  const [realizeModal, setRealizeModal] = useState(null);
  const [realizeForm, setRealizeForm] = useState({
    sale_price: "",
    dest_account_id: "",
    fee: "",
  });
  const [realizeError, setRealizeError] = useState(null);
  const [realizeLoading, setRealizeLoading] = useState(false);
  const [pendingAssetTxBulkVerify, setPendingAssetTxBulkVerify] =
    useState(null);
  const ASSET_TX_BULK_VERIFY_CONFIRM_THRESHOLD = 25;

  const handleArchiveInvestment = async (asset) => {
    const result = await archiveAsset(asset.id);
    if (!result || result.ok) return;
    if (result.data?.error === "non_zero_shares") {
      setArchiveBlockedModal({
        type: "shares",
        assetName: asset.name,
        shares: result.data.shares,
      });
      return;
    }
    if (result.data?.error === "non_zero_balance") {
      setArchiveBlockedModal({
        type: "balance",
        assetName: asset.name,
        currentValue: result.data.current_value,
        currency: result.data.currency,
      });
    }
  };

  const handleUnarchiveInvestment = async (id) => {
    await unarchiveAsset(id);
  };

  const openRealizeAsset = (asset) => {
    setRealizeModal(asset);
    setRealizeForm({
      sale_price: String(asset.current_value ?? ""),
      dest_account_id: "",
      fee: "",
    });
    setRealizeError(null);
  };

  const submitRealizeAsset = async () => {
    if (!realizeModal) return;
    const salePrice = parseFlexibleDecimal(realizeForm.sale_price);
    const fee = realizeForm.fee ? parseFlexibleDecimal(realizeForm.fee) : 0;
    if (
      Number.isNaN(salePrice) ||
      Number.isNaN(fee) ||
      salePrice <= 0 ||
      fee < 0 ||
      !realizeForm.dest_account_id
    ) {
      setRealizeError(T("error_invalid_amount"));
      return;
    }
    setRealizeLoading(true);
    setRealizeError(null);
    try {
      const res = await apiFetch(
        `${API}/portfolio/${realizeModal.id}/realize/`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sale_price: String(salePrice),
            dest_account_id: realizeForm.dest_account_id,
            fee: String(fee),
          }),
        },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setRealizeError(
          Object.values(err).flat().join(" ") || T("error_save_failed"),
        );
        return;
      }
      setRealizeModal(null);
      await Promise.all([
        fetchAssets(),
        fetchPortfolioSummary(),
        loadAssetTxFeed(1),
      ]);
    } catch {
      setRealizeError(T("error_network"));
    } finally {
      setRealizeLoading(false);
    }
  };

  const triggerAssetTxBulkVerify = (value) => {
    if (
      assetTxSelectAllFiltered ||
      assetTxSelectedCount > ASSET_TX_BULK_VERIFY_CONFIRM_THRESHOLD
    ) {
      setPendingAssetTxBulkVerify({ value });
      return;
    }
    applyAssetTxBulkVerify(value);
  };

  const activeContributionSources = useMemo(
    () => contributionSources.filter((source) => source.is_active !== false),
    [contributionSources],
  );
  // Allocation-target rows recomputed within the selected group (all / investments
  // / accounts) so percentages and buy/sell actions are relative to that group.
  const regroupedAlloc = useMemo(
    () => regroupTargets(allocationData, allocGroup),
    [allocationData, allocGroup],
  );
  const getAvailableContributionSources = (asset) => {
    if (!asset?.supports_contribution_source) return [];
    const assetSources = Array.isArray(asset.available_contribution_sources)
      ? asset.available_contribution_sources
      : [];
    const hasCustomSources =
      Array.isArray(asset.custom_contribution_source_ids) &&
      asset.custom_contribution_source_ids.length > 0;
    return (hasCustomSources ? assetSources : activeContributionSources).filter(
      (source) => source.is_active !== false,
    );
  };
  const assetFormSupportsContributionSource = useMemo(() => {
    const selectedType = investmentTypes.find(
      (t) => t.id === parseInt(assetForm.investment_type, 10),
    );
    if (!selectedType || selectedType.is_bank_account) return false;
    const mode = assetForm.contribution_source_mode || "inherit";
    if (mode === "enabled") return true;
    if (mode === "disabled") return false;
    return !!selectedType.supports_contribution_source;
  }, [
    assetForm.contribution_source_mode,
    assetForm.investment_type,
    investmentTypes,
  ]);
  const hasActiveOverlay =
    addModalOpen ||
    showAssetModal ||
    !!txDeleteConfirm ||
    txFiltersSheetOpen ||
    !!archiveBlockedModal ||
    !!realizeModal ||
    assetTxSelectionMode ||
    !!pendingAssetTxBulkVerify ||
    !!activeActionRow;
  const masked = (key, value, revealControl = false) => (
    <PrivacyValue scope="investments" field={key} revealControl={revealControl}>
      {value}
    </PrivacyValue>
  );

  // Load tx feed only while the Portfolio tab is active: avoids fetching the
  // global asset-transactions list every time refreshAfter() bumps the refresh
  // key on Cash Flow / Settings mutations.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedAssetTxFilters(assetTxFilters), 180);
    return () => clearTimeout(t);
  }, [assetTxFilters]);

  useEffect(() => {
    if (tab !== "portfolio") return;
    loadAssetTxFeed(1, debouncedAssetTxFilters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    tab,
    debouncedAssetTxFilters.asset_ids,
    debouncedAssetTxFilters.types,
    debouncedAssetTxFilters.date_from,
    debouncedAssetTxFilters.date_to,
    debouncedAssetTxFilters.verified,
    debouncedAssetTxFilters.search,
    debouncedAssetTxFilters.ordering,
    assetTxRefreshKey,
  ]);

  // Refetch monthly investment stats while the Portfolio tab is active and when
  // the card's dedicated month/year changes (independent from Cash Flow).
  useEffect(() => {
    if (tab !== "portfolio") return;
    fetchMonthlyInvestmentStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, invStatsMonth, invStatsYear, assetTxRefreshKey]);

  const assetTxDecorated = useMemo(() => {
    let prevDate = null;
    let prevMonthKey = null;
    const todayStr = new Date().toISOString().slice(0, 10);
    const yesterdayStr = new Date(Date.now() - 86400000)
      .toISOString()
      .slice(0, 10);
    return (assetTxItems || []).map((item) => {
      const dayKey = item.date;
      const d = new Date(dayKey);
      const monthKey = `${d.getFullYear()}-${d.getMonth()}`;
      const showMonthDivider = monthKey !== prevMonthKey;
      const monthLabel = `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
      prevMonthKey = monthKey;
      const showDayDivider = dayKey !== prevDate;
      const dayLabel =
        dayKey === todayStr
          ? T("divider_today")
          : dayKey === yesterdayStr
            ? T("divider_yesterday")
            : formatDate(dayKey);
      prevDate = dayKey;
      return {
        item,
        monthKey,
        showMonthDivider,
        monthLabel,
        showDayDivider,
        dayLabel,
      };
    });
  }, [assetTxItems, MONTHS, T]);

  const openAddTxModal = () => {
    setAddModalOpen(true);
    setAddTxAssetId("");
    setEditingAddTxId(null);
    setEditingAddTxItem(null);
    setAddTxError(null);
    setAddTxForm({
      transaction_type: "buy",
      date: today(),
      shares: "",
      price_per_share: "",
      fee: "",
      tax_amount: "",
      notes: "",
      linked_account_id: "",
      contribution_source: "",
      is_verified: transactionPrefs?.investments_default_verified ?? false,
    });
    setAddTxPriceTouched(false);
    setAddTxTaxTouched(false);
  };

  const openEditTransaction = (item) => {
    setAddModalOpen(true);
    setAddTxAssetId(String(item.asset?.id ?? ""));
    setEditingAddTxId(item.id);
    setEditingAddTxItem(item);
    setAddTxError(null);
    setAddTxForm({
      transaction_type: item.transaction_type || "buy",
      date: item.date || today(),
      shares: String(item.shares ?? ""),
      price_per_share: String(item.price_per_share ?? ""),
      fee: String(item.fee ?? ""),
      tax_amount: item.tax_amount_is_manual
        ? String(item.tax_amount ?? "")
        : "",
      notes: item.notes || "",
      linked_account_id: item.linked_account_id
        ? String(item.linked_account_id)
        : "",
      contribution_source: item.contribution_source
        ? String(item.contribution_source)
        : "",
      is_verified: item.is_verified ?? false,
    });
    setAddTxPriceTouched(true);
    // Preserve the manual/auto nature of the tax on edit: a manual override
    // stays manual (and editable); an auto one stays auto unless the user edits.
    setAddTxTaxTouched(!!item.tax_amount_is_manual);
  };

  const closeAddModal = () => {
    setAddModalOpen(false);
    setEditingAddTxId(null);
    setEditingAddTxItem(null);
    setAddTxError(null);
    setAddTxPriceTouched(false);
    setAddTxTaxTouched(false);
  };

  useEffect(() => {
    const selectedAsset = assets.find(
      (a) => String(a.id) === String(addTxAssetId),
    );
    if (
      !addModalOpen ||
      editingAddTxId ||
      !selectedAsset?.ticker ||
      !addTxForm.date ||
      addTxPriceTouched
    )
      return;
    let cancelled = false;
    const run = async () => {
      try {
        const res = await apiFetch(
          `${API}/portfolio/${selectedAsset.id}/historical-price/?date=${addTxForm.date}`,
        );
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (cancelled || !data?.close) return;
        setAddTxForm((prev) => {
          if (prev.price_per_share) return prev;
          return { ...prev, price_per_share: String(data.close) };
        });
      } catch {
        // best effort
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [
    addModalOpen,
    editingAddTxId,
    assets,
    addTxAssetId,
    addTxForm.date,
    addTxPriceTouched,
    apiFetch,
  ]);

  // Prefill the editable tax field on a SELL with the estimate from the asset's
  // current effective rate, so the snapshot is shown and adjustable. Skips once
  // the user has hand-edited the field (addTxTaxTouched) so we never clobber a
  // manual override.
  useEffect(() => {
    if (!addModalOpen || addTxForm.transaction_type !== "sell") return;
    if (addTxTaxTouched) return;
    const selectedAsset = assets.find(
      (a) => String(a.id) === String(addTxAssetId),
    );
    const est = estimateSellTax(
      addTxForm,
      selectedAsset,
      editingAddTxId,
      editingAddTxItem,
    );
    const formatted = est > 0 ? est.toFixed(2) : "";
    setAddTxForm((prev) =>
      prev.tax_amount === formatted ? prev : { ...prev, tax_amount: formatted },
    );
  }, [
    addModalOpen,
    addTxTaxTouched,
    addTxForm.transaction_type,
    addTxForm.shares,
    addTxForm.price_per_share,
    addTxForm.fee,
    addTxAssetId,
    assets,
    editingAddTxId,
    editingAddTxItem,
  ]);

  const handleAddTxSubmit = async () => {
    setAddTxError(null);
    setAddTxLoading(true);
    const taxIsManual =
      addTxForm.transaction_type === "sell" && addTxTaxTouched;
    const result = await submitAddTxFromModal(
      addTxAssetId,
      addTxForm,
      editingAddTxId,
      { taxIsManual },
    );
    setAddTxLoading(false);
    if (result.ok) {
      closeAddModal();
      // Force immediate feed refresh so edited rows reflect new values even
      // before broader refresh orchestration settles.
      await loadAssetTxFeed(1);
    } else {
      setAddTxError(result.error ?? T(result.errorKey ?? "error_save_failed"));
    }
  };

  const totalInvested = investments.reduce(
    (s, a) => s + parseFloat(a.invested_capital || 0),
    0,
  );
  const totalValue = investments.reduce(
    (s, a) => s + parseFloat(a.current_value || 0),
    0,
  );
  const totalGain = totalValue - totalInvested;
  const totalGainPct =
    totalInvested > 0 ? (totalGain / totalInvested) * 100 : 0;
  const gainColor = totalGain >= 0 ? "var(--success)" : "var(--danger)";

  const handlePullRefresh = async () => {
    await Promise.all([
      fetchAssets(),
      fetchPortfolioSummary(),
      loadAssetTxFeed(1),
      fetchMonthlyInvestmentStats(),
    ]);
  };

  return (
    <>
      <PullToRefresh onRefresh={handlePullRefresh}>
        <div>
          <LargeTitleHeader
            eyebrow={T("tab_investments")}
            title={
              <span className="app-net-worth hero-number">
                {masked("total_value", formatEur(totalValue), true)}
              </span>
            }
            compactTitle={T("tab_investments")}
            compactValue={masked("total_value", formatEur(totalValue))}
            actions={
              <>
                {totalValue > 0 && (
                  <Pill tone={totalGain >= 0 ? "success" : "danger"}>
                    <PrivacyValue scope="investments" field="total_gain">
                      <span className="num">
                        {`${totalGain >= 0 ? "+" : ""}${formatEur(totalGain)} · ${totalGainPct >= 0 ? "+" : ""}${totalGainPct.toFixed(2)}%`}
                      </span>
                    </PrivacyValue>
                  </Pill>
                )}
                <button
                  className="btn btn-ghost pressable"
                  style={{
                    whiteSpace: "nowrap",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                  onClick={refreshPrices}
                  disabled={refreshing}
                >
                  <Icon name="refresh" size={16} />
                  {refreshing ? T("refreshing") : T("refresh_prices")}
                </button>
              </>
            }
          />

          {refreshMsg && (
            <div
              style={{
                fontSize: 12,
                color: "var(--success)",
                marginBottom: 10,
                padding: "6px 12px",
                background: "var(--success-soft)",
                borderRadius: 8,
                border: "1px solid var(--success-soft)",
              }}
            >
              ✓ {refreshMsg}
            </div>
          )}

          <InvSummaryCard
            stats={monthlyInvestmentStats}
            month={invStatsMonth}
            year={invStatsYear}
            onChangeMonth={({ month, year }) => {
              setInvStatsMonth(month);
              setInvStatsYear(year);
            }}
          />

          {investments.length === 0 && (
            <div
              style={{
                textAlign: "center",
                padding: "64px 24px",
                color: "var(--fg-soft)",
              }}
            >
              <div
                style={{
                  display: "inline-flex",
                  marginBottom: 16,
                  opacity: 0.42,
                  color: "var(--fg-soft)",
                }}
              >
                <Icon name="investments" size={44} strokeWidth={1.8} />
              </div>
              <div
                style={{
                  fontSize: 16,
                  fontWeight: 600,
                  color: "var(--fg)",
                  marginBottom: 8,
                }}
              >
                {T("portfolio_empty_title", "No investments yet")}
              </div>
              <div
                style={{
                  fontSize: 13,
                  marginBottom: 24,
                  maxWidth: 280,
                  margin: "0 auto 24px",
                }}
              >
                {T(
                  "portfolio_empty_body",
                  "Add your first asset to start tracking your portfolio.",
                )}
              </div>
              <button
                className="btn btn-primary"
                onClick={() => openAssetAdd()}
              >
                + {T("add_modal_mode_asset")}
              </button>
            </div>
          )}

          {investmentTypes
            .filter(
              (t) =>
                !t.is_bank_account &&
                investments.some((a) => a.investment_type_detail?.id === t.id),
            )
            .map((t) => {
              const typeAssets = investments.filter(
                (a) => a.investment_type_detail?.id === t.id,
              );
              const typeCurrent = typeAssets.reduce(
                (s, a) => s + parseFloat(a.current_value || 0),
                0,
              );
              return (
                <GroupedList
                  key={t.id}
                  title={
                    <span
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 7,
                        justifyContent: "space-between",
                      }}
                    >
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 7,
                        }}
                      >
                        <CategoryDot
                          color={t.color || "var(--accent)"}
                          size={7}
                        />
                        {t.name}
                      </span>
                      <span className="num" style={{ letterSpacing: 0 }}>
                        {masked("asset_values", formatEur(typeCurrent))}
                      </span>
                    </span>
                  }
                >
                  {typeAssets.map((a, i) => (
                    <AssetCard
                      key={a.id}
                      a={a}
                      onArchive={handleArchiveInvestment}
                      onDelete={deleteAsset}
                      onEdit={openAssetEdit}
                      onAdjust={openAdjustBalance}
                      onRealize={openRealizeAsset}
                      T={T}
                      totalPortfolioValue={totalValue}
                      priceRefreshCounter={priceRefreshCounter}
                      apiFetch={apiFetch}
                      isValueHidden={isValueHidden}
                      openSwipeId={openSwipeId}
                      onRequestSwipeOpen={setOpenSwipeId}
                      isLast={i === typeAssets.length - 1}
                    />
                  ))}
                </GroupedList>
              );
            })}
          {investments.filter((a) => !a.investment_type_detail).length > 0 && (
            <GroupedList>
              {investments
                .filter((a) => !a.investment_type_detail)
                .map((a, i, arr) => (
                  <AssetCard
                    key={a.id}
                    a={a}
                    onArchive={handleArchiveInvestment}
                    onDelete={deleteAsset}
                    onEdit={openAssetEdit}
                    onAdjust={openAdjustBalance}
                    onRealize={openRealizeAsset}
                    T={T}
                    totalPortfolioValue={totalValue}
                    priceRefreshCounter={priceRefreshCounter}
                    apiFetch={apiFetch}
                    isValueHidden={isValueHidden}
                    openSwipeId={openSwipeId}
                    onRequestSwipeOpen={setOpenSwipeId}
                    isLast={i === arr.length - 1}
                  />
                ))}
            </GroupedList>
          )}

          {/* ── Archived investments section ────────────────────────── */}
          {archivedInvestments.length > 0 && (
            <GroupedList style={{ marginTop: 24 }}>
              <GroupedList.Item
                label={`${T("label_archived_investments")} (${archivedInvestments.length})`}
                icon={<Icon name="archive" size={16} />}
                onClick={() => setArchivedInvExpanded((p) => !p)}
                action={
                  <span
                    aria-hidden="true"
                    style={{
                      display: "inline-block",
                      color: "var(--fg-faint)",
                      fontSize: 17,
                      transform: archivedInvExpanded
                        ? "rotate(90deg)"
                        : "rotate(0deg)",
                      transition: "transform 0.18s ease",
                    }}
                  >
                    ›
                  </span>
                }
              />
              {archivedInvExpanded &&
                archivedInvestments.map((a, i) => (
                  <AssetCard
                    key={a.id}
                    a={a}
                    onUnarchive={handleUnarchiveInvestment}
                    T={T}
                    totalPortfolioValue={0}
                    priceRefreshCounter={0}
                    apiFetch={apiFetch}
                    isValueHidden={isValueHidden}
                    openSwipeId={openSwipeId}
                    onRequestSwipeOpen={setOpenSwipeId}
                    isLast={i === archivedInvestments.length - 1}
                  />
                ))}
            </GroupedList>
          )}

          {/* Allocation targets panel — separato visivamente dalla lista asset */}
          {allocationData.filter((a) => a.target_pct !== null).length > 0 && (
            <>
              <div
                style={{
                  height: 1,
                  background: "var(--card-inset)",
                  margin: "24px 0 20px",
                }}
              />
              <div
                style={{
                  fontSize: 11,
                  letterSpacing: 0,
                  color: "var(--fg-soft)",
                  textTransform: "uppercase",
                  marginBottom: 10,
                }}
              >
                {T("alloc_title")}
              </div>
              <div className="card">
                <div className="between" style={{ marginBottom: 14 }}>
                  <SegmentedControl
                    options={[
                      { value: "bar", label: T("chart_bar") },
                      { value: "pie", label: T("chart_pie") },
                    ]}
                    value={allocChartType}
                    onChange={setAllocChartType}
                  />
                  <button
                    className="btn btn-g btn-sm pressable"
                    style={{ fontSize: 11 }}
                    onClick={() => {
                      setTab("settings");
                      setSettingsMenu("allocation");
                    }}
                  >
                    {T("alloc_save")} ›
                  </button>
                </div>
                <div style={{ marginBottom: 14, display: "flex" }}>
                  <SegmentedControl
                    options={[
                      { value: "all", label: T("alloc_group_all") },
                      {
                        value: "investments",
                        label: T("alloc_group_investments"),
                      },
                      { value: "accounts", label: T("alloc_group_accounts") },
                    ]}
                    value={allocGroup}
                    onChange={setAllocGroup}
                  />
                </div>

                {allocChartType === "pie"
                  ? (() => {
                      const pieData = regroupedAlloc
                        .filter(
                          (a) => a.target_pct !== null && a.current_pct > 0,
                        )
                        .map((a) => ({
                          total: a.current_pct,
                          category__color: a.color,
                          category__name: a.name,
                          _target: a.target_pct,
                          _action: a.action,
                        }));
                      return (
                        <div
                          style={{
                            display: "flex",
                            gap: 20,
                            alignItems: "flex-start",
                            flexWrap: "wrap",
                          }}
                        >
                          <div style={{ flex: "0 0 auto" }}>
                            <div
                              style={{
                                fontSize: 11,
                                color: "var(--fg-soft)",
                                textAlign: "center",
                                marginBottom: 6,
                                textTransform: "uppercase",
                                letterSpacing: 0,
                              }}
                            >
                              {T("alloc_current")}
                            </div>
                            <PieChart
                              data={pieData}
                              size={160}
                              tLabel={T("alloc_current")}
                              tPctOfTotal="%"
                            />
                          </div>
                          <div
                            style={{
                              flex: 1,
                              minWidth: 140,
                            }}
                          >
                            {regroupedAlloc
                              .filter((a) => a.target_pct !== null)
                              .map((a) => {
                                const actionTone =
                                  {
                                    buy: "accent",
                                    sell: "warning",
                                    ok: "neutral",
                                  }[a.action] || "neutral";
                                return (
                                  <div
                                    key={a.id}
                                    className="between"
                                    style={{
                                      marginBottom: 10,
                                      alignItems: "center",
                                    }}
                                  >
                                    <div
                                      className="row"
                                      style={{
                                        gap: 8,
                                        alignItems: "center",
                                      }}
                                    >
                                      <CategoryDot
                                        color={a.color || "var(--accent)"}
                                      />
                                      <span
                                        style={{
                                          fontSize: 13,
                                        }}
                                      >
                                        {a.name}
                                      </span>
                                    </div>
                                    <div
                                      className="row"
                                      style={{
                                        gap: 8,
                                        alignItems: "center",
                                      }}
                                    >
                                      <span
                                        className="num"
                                        style={{
                                          fontSize: 12,
                                          color: "var(--fg-soft)",
                                        }}
                                      >
                                        {a.current_pct.toFixed(1)}% /{" "}
                                        {a.target_pct.toFixed(1)}%
                                      </span>
                                      {a.action && (
                                        <Pill tone={actionTone}>
                                          {T(`alloc_action_${a.action}`)}
                                        </Pill>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                          </div>
                        </div>
                      );
                    })()
                  : regroupedAlloc
                      .filter((a) => a.target_pct !== null)
                      .map((a) => {
                        const actionTone =
                          { buy: "accent", sell: "warning", ok: "neutral" }[
                            a.action
                          ] || "neutral";
                        return (
                          <div key={a.id} style={{ marginBottom: 12 }}>
                            <div
                              className="between"
                              style={{
                                marginBottom: 4,
                              }}
                            >
                              <span
                                className="row"
                                style={{
                                  fontSize: 13,
                                  alignItems: "center",
                                  gap: 8,
                                }}
                              >
                                <CategoryDot
                                  color={a.color || "var(--accent)"}
                                />
                                {a.name}
                              </span>
                              <div
                                className="row"
                                style={{
                                  gap: 8,
                                  alignItems: "center",
                                }}
                              >
                                <span
                                  className="num"
                                  style={{
                                    fontSize: 11,
                                    color: "var(--fg-soft)",
                                  }}
                                >
                                  {a.current_pct.toFixed(1)}% /{" "}
                                  {a.target_pct.toFixed(1)}%
                                </span>
                                {a.action && (
                                  <Pill tone={actionTone}>
                                    {T(`alloc_action_${a.action}`)}
                                  </Pill>
                                )}
                              </div>
                            </div>
                            <div
                              style={{
                                height: 4,
                                background: "var(--card-inset)",
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
                                  transition: "width 0.4s",
                                }}
                              />
                              {a.target_pct > 0 && (
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
                              )}
                            </div>
                          </div>
                        );
                      })}
              </div>
            </>
          )}

          {/* ── Transazioni: feed globale stile cashflow ── */}
          <div style={{ marginTop: 28 }}>
            <div
              style={{
                fontSize: 11,
                letterSpacing: 0,
                color: "var(--fg-soft)",
                textTransform: "uppercase",
                marginBottom: 10,
              }}
            >
              {T("portfolio_transactions")}
            </div>

            <div style={{ position: "relative", marginBottom: 10 }}>
              <span
                aria-hidden
                style={{
                  position: "absolute",
                  left: 12,
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: "var(--fg-soft)",
                  display: "flex",
                  alignItems: "center",
                  pointerEvents: "none",
                }}
              >
                <Icon name="search" size={16} />
              </span>
              <input
                data-testid="asset-tx-search-input"
                type="search"
                value={assetTxFilters.search ?? ""}
                onChange={(e) =>
                  setAssetTxFilters((p) => ({ ...p, search: e.target.value }))
                }
                placeholder={T("cf_search_placeholder")}
                aria-label={T("cf_search_placeholder")}
                style={{
                  width: "100%",
                  background: "var(--card-inset)",
                  border: "1px solid var(--rule)",
                  borderRadius: 10,
                  color: "var(--fg)",
                  padding: "9px 36px 9px 36px",
                  fontSize: 14,
                  fontFamily: "inherit",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
              {assetTxFilters.search && (
                <button
                  type="button"
                  data-testid="asset-tx-search-clear"
                  onClick={() =>
                    setAssetTxFilters((p) => ({ ...p, search: "" }))
                  }
                  aria-label={T("cf_search_clear")}
                  style={{
                    position: "absolute",
                    right: 8,
                    top: "50%",
                    transform: "translateY(-50%)",
                    background: "transparent",
                    border: 0,
                    color: "var(--fg-soft)",
                    cursor: "pointer",
                    padding: 4,
                    lineHeight: 1,
                    fontSize: 16,
                    fontFamily: "inherit",
                  }}
                >
                  ×
                </button>
              )}
            </div>

            {(() => {
              const typeActive =
                assetTxFilters.types.length < ALL_ASSET_TX_TYPES.length;
              const activeFilterCount =
                (assetTxFilters.asset_ids?.length ? 1 : 0) +
                (typeActive ? 1 : 0) +
                (assetTxFilters.verified !== null ? 1 : 0) +
                (assetTxFilters.date_from ? 1 : 0) +
                ((assetTxFilters.ordering || "-date") !== "-date" ? 1 : 0);
              return (
                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    flexWrap: "wrap",
                    marginBottom: 14,
                    alignItems: "center",
                  }}
                >
                  <button
                    type="button"
                    data-testid="asset-tx-filters-open"
                    onClick={() => setTxFiltersSheetOpen(true)}
                    className="pressable"
                    style={{
                      position: "relative",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 7,
                      border: "1px solid var(--rule)",
                      cursor: "pointer",
                      background: activeFilterCount
                        ? "var(--accent)"
                        : "var(--card-inset)",
                      color: activeFilterCount
                        ? "var(--btn-primary-fg)"
                        : "var(--fg)",
                      borderRadius: 10,
                      minHeight: 38,
                      padding: "0 14px",
                      fontSize: 14,
                      fontWeight: 700,
                      fontFamily: "inherit",
                      flexShrink: 0,
                    }}
                  >
                    {T("cf_filters")}
                    {activeFilterCount > 0 && (
                      <span
                        data-testid="asset-tx-filters-count"
                        style={{
                          background: "var(--card)",
                          color: "var(--accent)",
                          borderRadius: 999,
                          minWidth: 18,
                          height: 18,
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 11.5,
                          fontWeight: 800,
                          padding: "0 5px",
                        }}
                      >
                        {activeFilterCount}
                      </span>
                    )}
                  </button>
                  <button
                    data-testid="asset-tx-bulk-toggle"
                    onClick={() =>
                      assetTxSelectionMode
                        ? exitAssetTxSelectionMode()
                        : enterAssetTxSelectionMode()
                    }
                    className="pressable"
                    style={{
                      marginLeft: "auto",
                      background: assetTxSelectionMode
                        ? "var(--accent-soft)"
                        : "transparent",
                      color: assetTxSelectionMode
                        ? "var(--accent-deep)"
                        : "var(--fg-soft)",
                      border: "1px solid var(--rule)",
                      borderRadius: 999,
                      padding: "6px 12px",
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: "pointer",
                      fontFamily: "inherit",
                    }}
                    aria-pressed={assetTxSelectionMode}
                  >
                    {assetTxSelectionMode
                      ? T("cf_bulk_done")
                      : T("cf_bulk_select")}
                  </button>
                </div>
              );
            })()}

            {assetTxSelectionMode && assetTxItems.length > 0 && (
              <div
                data-testid="asset-tx-bulk-banner"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "10px 12px",
                  background: "var(--accent-soft)",
                  borderRadius: 10,
                  marginBottom: 8,
                  fontSize: 12,
                  flexWrap: "wrap",
                }}
              >
                <span
                  style={{
                    color: "var(--accent-deep)",
                    fontWeight: 700,
                    whiteSpace: "nowrap",
                  }}
                  aria-live="polite"
                >
                  {T("cf_bulk_selected_count").replace(
                    "{count}",
                    String(assetTxSelectedCount),
                  )}
                </span>
                {assetTxTotalCount > assetTxItems.length && (
                  <div style={{ marginLeft: "auto", minWidth: 0 }}>
                    <button
                      data-testid="asset-tx-bulk-select-filtered"
                      className="btn btn-g btn-sm"
                      onClick={selectAllFilteredAssetTx}
                      disabled={assetTxSelectAllFiltered}
                      style={{ fontSize: 11 }}
                    >
                      {T("cf_bulk_select_all_filtered").replace(
                        "{count}",
                        String(assetTxTotalCount),
                      )}
                    </button>
                  </div>
                )}
                <div
                  style={{
                    display: "flex",
                    gap: 6,
                    marginLeft:
                      assetTxTotalCount > assetTxItems.length ? 0 : "auto",
                    flexWrap: "wrap",
                  }}
                >
                  <button
                    data-testid="asset-tx-bulk-select-visible"
                    onClick={selectVisibleAssetTx}
                    className="btn btn-g btn-sm"
                    disabled={
                      !assetTxSelectAllFiltered &&
                      assetTxSelectedCount === assetTxItems.length
                    }
                    style={{ padding: "4px 10px", fontSize: 11 }}
                  >
                    {T("cf_bulk_select_all")}
                  </button>
                  <button
                    data-testid="asset-tx-bulk-deselect"
                    onClick={clearAssetTxSelection}
                    className="btn btn-g btn-sm"
                    disabled={assetTxSelectedCount === 0}
                    style={{ padding: "4px 10px", fontSize: 11 }}
                  >
                    {T("cf_bulk_deselect_all")}
                  </button>
                </div>
              </div>
            )}

            <div className="card" style={{ padding: 0, overflow: "hidden" }}>
              {assetTxLoading && assetTxItems.length === 0 && (
                <div
                  style={{
                    textAlign: "center",
                    color: "var(--fg-soft)",
                    padding: "32px 0",
                    fontSize: 13,
                  }}
                >
                  {T("loading")}…
                </div>
              )}
              {!assetTxLoading && assetTxItems.length === 0 && (
                <div
                  style={{
                    textAlign: "center",
                    color: "var(--fg-soft)",
                    padding: "32px 0",
                    fontSize: 13,
                  }}
                >
                  {T("cf_no_results")}
                </div>
              )}

              {assetTxDecorated.map(
                ({
                  item,
                  monthKey,
                  showMonthDivider,
                  monthLabel,
                  showDayDivider,
                  dayLabel,
                }) => {
                  const monthDivider = showMonthDivider ? (
                    <div
                      key={`m-${monthKey}-${item.id}`}
                      style={{
                        padding: "10px 14px 6px",
                        fontSize: 12,
                        fontWeight: 700,
                        letterSpacing: 0,
                        textTransform: "uppercase",
                        color: "var(--fg)",
                        background: "var(--card-inset)",
                        borderTop: "1px solid var(--rule)",
                        borderBottom: "1px solid var(--rule)",
                      }}
                    >
                      {monthLabel}
                    </div>
                  ) : null;
                  const dayDivider = showDayDivider ? (
                    <div
                      key={`d-${item.date}-${item.id}`}
                      className="tx-day-divider"
                      style={{ padding: "6px 14px 2px" }}
                    >
                      {dayLabel}
                    </div>
                  ) : null;
                  const isArchivedTx = Boolean(item.asset?.is_archived);
                  const rowSelected =
                    assetTxSelectionMode &&
                    !isArchivedTx &&
                    isAssetTxItemSelected(item.id);

                  const typeMeta = {
                    buy: {
                      sign: "-",
                      color: "var(--danger)",
                      icon: <Icon name="investments" size={16} />,
                    },
                    sell: {
                      sign: "+",
                      color: "var(--success)",
                      icon: <Icon name="investments" size={16} />,
                    },
                    cash_in: {
                      sign: "+",
                      color: "var(--success)",
                      icon: <Icon name="cashflow" size={16} />,
                    },
                    cash_out: {
                      sign: "-",
                      color: "var(--danger)",
                      icon: <Icon name="cashflow" size={16} />,
                    },
                    adjustment: {
                      sign: "±",
                      color: "var(--fg-soft)",
                      icon: <Icon name="status" size={16} />,
                    },
                  }[item.transaction_type] || {
                    sign: "",
                    color: "var(--fg-soft)",
                    icon: "•",
                  };

                  return (
                    <div key={item.id}>
                      {monthDivider}
                      {dayDivider}
                      <div
                        className={`tx-row${activeActionRow === `tx-${item.id}` ? " is-active" : ""}${rowSelected ? " is-selected" : ""}`}
                        tabIndex={0}
                        onFocus={() => setActiveActionRow(`tx-${item.id}`)}
                        onBlur={() => setActiveActionRow(null)}
                        onPointerEnter={() =>
                          setActiveActionRow(`tx-${item.id}`)
                        }
                        onPointerLeave={() => setActiveActionRow(null)}
                        onClick={() => {
                          if (isArchivedTx) return;
                          if (assetTxSelectionMode) {
                            toggleAssetTxItemSelected(item.id);
                          } else {
                            openEditTransaction(item);
                          }
                        }}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          padding: "10px 14px",
                          borderBottom: "1px solid var(--card-inset)",
                          cursor: isArchivedTx ? "default" : "pointer",
                          background: rowSelected
                            ? "var(--accent-soft)"
                            : undefined,
                          opacity: isArchivedTx ? 0.82 : 1,
                        }}
                      >
                        {assetTxSelectionMode && !isArchivedTx && (
                          <input
                            type="checkbox"
                            checked={rowSelected}
                            onChange={() => toggleAssetTxItemSelected(item.id)}
                            onClick={(e) => e.stopPropagation()}
                            aria-label={T("cf_bulk_select")}
                            style={{ flexShrink: 0 }}
                          />
                        )}
                        <div
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: 8,
                            background: "var(--card-inset)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 15,
                            flexShrink: 0,
                          }}
                        >
                          {item.asset?.icon || typeMeta.icon}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div
                            style={{
                              fontSize: 13,
                              fontWeight: 500,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {item.asset?.name || "—"}
                          </div>
                          <div
                            style={{
                              fontSize: 11,
                              color: "var(--fg-soft)",
                              marginTop: 2,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {T(`tx_type_${item.transaction_type}`)}
                            {item.shares && item.price_per_share
                              ? ` · ${parseFloat(item.shares)} × ${parseFloat(
                                  item.price_per_share,
                                ).toFixed(4)} ${item.asset?.currency || "EUR"}`
                              : ""}
                            {item.linked_account_name
                              ? ` · ${
                                  item.linked_account_direction === "source"
                                    ? T("tx_source_account")
                                    : T("tx_dest_account")
                                }: ${item.linked_account_name}`
                              : ""}
                            {item.contribution_source_name
                              ? ` · ${T("label_contribution_source")}: ${
                                  item.contribution_source_name
                                }`
                              : ""}
                            {parseFloat(item.fee || 0) > 0
                              ? ` · ${T("tx_fee")}: ${formatEur(item.fee)}`
                              : ""}
                            {parseFloat(item.tax_amount || 0) > 0
                              ? ` · ${T("tx_tax_paid")}: ${formatEur(
                                  item.tax_amount,
                                )}`
                              : ""}
                            {isArchivedTx ? ` · ${T("label_archived")}` : ""}
                            {(() => {
                              const label =
                                item.notes ||
                                (item.transaction_type === "cash_in" &&
                                !item.derived_from
                                  ? T("cf_opening_balance")
                                  : "");
                              return label ? ` · ${label}` : "";
                            })()}
                          </div>
                        </div>
                        {!item.is_verified && (
                          <span
                            title={T("cf_unverified")}
                            style={{
                              width: 8,
                              height: 8,
                              borderRadius: 99,
                              background: "var(--warning)",
                              boxShadow: "0 0 0 3px var(--warning-soft)",
                              flexShrink: 0,
                            }}
                          />
                        )}
                        <span
                          style={{
                            fontSize: 14,
                            fontWeight: 600,
                            fontFamily: "var(--font-mono)",
                            color: typeMeta.color,
                            flexShrink: 0,
                          }}
                        >
                          {typeMeta.sign}
                          {masked(
                            "transactions",
                            formatEur(item.cash_flow_value ?? item.total_value),
                          )}
                        </span>
                        {!assetTxSelectionMode && !isArchivedTx && (
                          <button
                            className="btn btn-g btn-sm tx-delete"
                            style={{
                              fontSize: 11,
                              padding: "4px 8px",
                              flexShrink: 0,
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              setTxDeleteConfirm(item);
                            }}
                            aria-label={T("btn_delete")}
                          >
                            ×
                          </button>
                        )}
                      </div>
                    </div>
                  );
                },
              )}

              {(assetTxHasMore || assetTxItems.length > 0) && (
                <div
                  style={{
                    display: "flex",
                    justifyContent: "center",
                    gap: 10,
                    padding: "12px 14px",
                    background: "var(--rule-soft)",
                  }}
                >
                  {assetTxHasMore && (
                    <button
                      className="btn btn-g btn-sm"
                      style={{ fontSize: 12 }}
                      disabled={assetTxLoading}
                      onClick={loadMoreAssetTx}
                    >
                      {T("cf_load_more")}
                    </button>
                  )}
                  {assetTxHasMore && (
                    <button
                      className="btn btn-g btn-sm"
                      style={{ fontSize: 12 }}
                      disabled={assetTxLoading}
                      onClick={loadAllAssetTx}
                    >
                      {T("cf_load_all")}
                    </button>
                  )}
                  <div
                    style={{
                      alignSelf: "center",
                      fontSize: 11,
                      color: "var(--fg-soft)",
                    }}
                  >
                    {assetTxItems.length}/{assetTxTotalCount}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </PullToRefresh>

      {/* ── Sheets — rendered outside PullToRefresh on purpose: the PTR
           transform breaks position:fixed descendants ── */}

      {/* Add/edit transaction sheet (opened via SpeedDial "Transaction") */}
      <BottomSheet
        open={addModalOpen}
        onClose={closeAddModal}
        ariaLabel={
          editingAddTxId ? T("modal_edit_tx") : T("add_modal_mode_transaction")
        }
      >
        {addModalOpen && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 16,
              padding: "8px 18px 18px",
            }}
          >
            <SheetTitle>
              {editingAddTxId
                ? T("modal_edit_tx")
                : T("add_modal_mode_transaction")}
            </SheetTitle>
            {/* Asset picker */}
            {!addTxAssetId ? (
              <div>
                <FieldLabel text={T("pick_asset")} />
                <select
                  className="inp"
                  value={addTxAssetId}
                  autoFocus
                  onChange={(e) => {
                    setAddTxAssetId(e.target.value);
                    setAddTxPriceTouched(false);
                    setAddTxForm((p) => ({
                      ...p,
                      price_per_share: "",
                      contribution_source: "",
                    }));
                  }}
                >
                  <option value="">{T("pick_asset")}</option>
                  {investments
                    .filter((a) => a.tracking_type === "AUTO")
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name} {a.ticker ? `(${a.ticker})` : ""}
                      </option>
                    ))}
                </select>
              </div>
            ) : (
              (() => {
                const asset = investments.find(
                  (a) => String(a.id) === String(addTxAssetId),
                );
                const parsedShares = parseFlexibleDecimal(addTxForm.shares);
                const parsedPrice = parseFlexibleDecimal(
                  addTxForm.price_per_share,
                );
                const parsedFee = addTxForm.fee
                  ? parseFlexibleDecimal(addTxForm.fee)
                  : 0;
                const parsedTaxAmount = addTxForm.tax_amount
                  ? parseFlexibleDecimal(addTxForm.tax_amount)
                  : 0;
                const totalValueNumber =
                  Number.isFinite(parsedShares) &&
                  Number.isFinite(parsedPrice) &&
                  parsedShares > 0 &&
                  parsedPrice > 0
                    ? parsedShares * parsedPrice
                    : null;
                const total =
                  totalValueNumber !== null
                    ? totalValueNumber.toLocaleString(
                        localeFromSeparator(decimalSeparator),
                        {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        },
                      )
                    : null;
                const estimatedTax = estimateSellTax(
                  addTxForm,
                  asset,
                  editingAddTxId,
                  editingAddTxItem,
                );
                return (
                  <>
                    {/* Selected asset chip */}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "10px 14px",
                        background: "var(--card-inset)",
                        borderRadius: 10,
                        border: "1px solid var(--rule)",
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontWeight: 700,
                            fontSize: 15,
                            lineHeight: 1.2,
                            color: "var(--fg)",
                          }}
                        >
                          {asset?.name}
                        </div>
                        {asset?.ticker && (
                          <div
                            style={{
                              fontSize: 12,
                              color: "var(--fg-soft)",
                              fontFamily: "var(--font-mono)",
                              marginTop: 2,
                            }}
                          >
                            {asset.ticker}
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setAddTxAssetId("");
                          setAddTxPriceTouched(false);
                          setAddTxForm((p) => ({
                            ...p,
                            price_per_share: "",
                            contribution_source: "",
                          }));
                        }}
                        style={{
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          color: "var(--fg-soft)",
                          fontSize: 18,
                          lineHeight: 1,
                          padding: 2,
                          flexShrink: 0,
                        }}
                        aria-label="Change asset"
                      >
                        ×
                      </button>
                    </div>

                    {/* Buy / Sell toggle */}
                    <div>
                      <FieldLabel text={T("tx_type")} />
                      <div
                        style={{
                          display: "flex",
                          background: "var(--card-inset)",
                          border: "1px solid var(--rule)",
                          borderRadius: 8,
                          padding: 3,
                        }}
                      >
                        {[
                          {
                            key: "buy",
                            label: T("tx_buy"),
                            color: "var(--success)",
                          },
                          {
                            key: "sell",
                            label: T("tx_sell"),
                            color: "var(--danger)",
                          },
                        ].map((t) => (
                          <button
                            key={t.key}
                            type="button"
                            onClick={() =>
                              setAddTxForm((p) => ({
                                ...p,
                                transaction_type: t.key,
                                contribution_source:
                                  t.key === "buy" ? p.contribution_source : "",
                              }))
                            }
                            style={{
                              flex: 1,
                              padding: "8px 10px",
                              borderRadius: 6,
                              border: "none",
                              cursor: "pointer",
                              fontFamily: "inherit",
                              fontSize: 13,
                              fontWeight: 700,
                              background:
                                addTxForm.transaction_type === t.key
                                  ? t.color + "22"
                                  : "transparent",
                              color:
                                addTxForm.transaction_type === t.key
                                  ? t.color
                                  : "var(--fg-soft)",
                              transition: "all 0.15s",
                            }}
                          >
                            {t.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Date */}
                    <div>
                      <FieldLabel text={T("tx_date")} />
                      <div style={{ overflow: "hidden", borderRadius: 10 }}>
                        <input
                          type="date"
                          className="inp"
                          value={addTxForm.date}
                          onChange={(e) => {
                            setAddTxPriceTouched(false);
                            setAddTxForm((p) => ({
                              ...p,
                              date: e.target.value,
                              price_per_share: "",
                            }));
                          }}
                        />
                      </div>
                    </div>

                    {/* Shares + Price side by side */}
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: 10,
                      }}
                    >
                      <div>
                        <FieldLabel text={T("tx_shares")} />
                        <input
                          type="text"
                          inputMode="decimal"
                          className="inp"
                          placeholder="0"
                          value={addTxForm.shares}
                          onChange={(e) =>
                            setAddTxForm((p) => ({
                              ...p,
                              shares: e.target.value,
                            }))
                          }
                        />
                      </div>
                      <div>
                        <FieldLabel text={T("tx_price")} />
                        <div style={{ position: "relative" }}>
                          <input
                            type="text"
                            inputMode="decimal"
                            className="inp"
                            placeholder="0.00"
                            style={{ paddingRight: 46 }}
                            value={addTxForm.price_per_share}
                            onChange={(e) => {
                              setAddTxPriceTouched(true);
                              setAddTxForm((p) => ({
                                ...p,
                                price_per_share: e.target.value,
                              }));
                            }}
                          />
                          <span
                            style={{
                              position: "absolute",
                              right: 12,
                              top: "50%",
                              transform: "translateY(-50%)",
                              color: "var(--fg-soft)",
                              fontFamily: "var(--font-mono)",
                              fontSize: 12,
                              pointerEvents: "none",
                            }}
                          >
                            {asset?.currency || "EUR"}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div>
                      <FieldLabel text={T("tx_fee")} />
                      <div style={{ position: "relative" }}>
                        <input
                          type="text"
                          inputMode="decimal"
                          className="inp"
                          placeholder="0.00"
                          style={{ paddingRight: 46 }}
                          value={addTxForm.fee}
                          onChange={(e) =>
                            setAddTxForm((p) => ({
                              ...p,
                              fee: e.target.value,
                            }))
                          }
                        />
                        <span
                          style={{
                            position: "absolute",
                            right: 12,
                            top: "50%",
                            transform: "translateY(-50%)",
                            color: "var(--fg-soft)",
                            fontFamily: "var(--font-mono)",
                            fontSize: 12,
                            pointerEvents: "none",
                          }}
                        >
                          {asset?.currency || "EUR"}
                        </span>
                      </div>
                    </div>

                    {addTxForm.transaction_type === "sell" && (
                      <div>
                        <FieldLabel text={T("tx_tax_paid")} />
                        <div style={{ position: "relative" }}>
                          <input
                            type="text"
                            inputMode="decimal"
                            className="inp"
                            placeholder="0.00"
                            style={{ paddingRight: 46 }}
                            value={addTxForm.tax_amount}
                            onChange={(e) => {
                              setAddTxTaxTouched(true);
                              setAddTxForm((p) => ({
                                ...p,
                                tax_amount: e.target.value,
                              }));
                            }}
                          />
                          <span
                            style={{
                              position: "absolute",
                              right: 12,
                              top: "50%",
                              transform: "translateY(-50%)",
                              color: "var(--fg-soft)",
                              fontFamily: "var(--font-mono)",
                              fontSize: 12,
                              pointerEvents: "none",
                            }}
                          >
                            {asset?.currency || "EUR"}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Live total */}
                    {total && (
                      <div
                        style={{
                          textAlign: "center",
                          padding: "10px 14px",
                          background: "var(--card-inset)",
                          borderRadius: 8,
                          border: "1px solid var(--rule)",
                          marginTop: -6,
                        }}
                      >
                        <span style={{ fontSize: 12, color: "var(--fg-soft)" }}>
                          {T("tx_total")}:{" "}
                        </span>
                        <span
                          style={{
                            fontSize: 17,
                            fontWeight: 700,
                            fontFamily: "var(--font-mono)",
                            color: "var(--fg)",
                          }}
                        >
                          {total}
                        </span>
                        <span
                          style={{
                            fontSize: 12,
                            color: "var(--fg-soft)",
                            marginLeft: 4,
                          }}
                        >
                          {asset?.currency || "EUR"}
                        </span>
                        {Number.isFinite(parsedFee) && parsedFee > 0 && (
                          <div
                            style={{
                              marginTop: 6,
                              fontSize: 12,
                              color: "var(--fg-soft)",
                            }}
                          >
                            {T("tx_fee")}: {formatEur(parsedFee)}
                          </div>
                        )}
                        {estimatedTax > 0 && (
                          <div
                            style={{
                              marginTop: 4,
                              fontSize: 12,
                              color: "var(--fg-soft)",
                            }}
                          >
                            {T("tx_estimated_tax")}: {formatEur(estimatedTax)}
                          </div>
                        )}
                        {addTxForm.transaction_type === "sell" &&
                          addTxForm.tax_amount &&
                          Number.isFinite(parsedTaxAmount) && (
                            <div
                              style={{
                                marginTop: 4,
                                fontSize: 12,
                                color: "var(--fg-soft)",
                              }}
                            >
                              {T("tx_tax_paid")}: {formatEur(parsedTaxAmount)}
                            </div>
                          )}
                      </div>
                    )}

                    {/* Account + Notes (secondary) */}
                    {bankAccounts.length > 0 && (
                      <div>
                        <FieldLabel
                          text={
                            addTxForm.transaction_type === "buy"
                              ? T("tx_source_account")
                              : T("tx_dest_account")
                          }
                        />
                        <select
                          className="inp"
                          value={addTxForm.linked_account_id}
                          onChange={(e) =>
                            setAddTxForm((p) => ({
                              ...p,
                              linked_account_id: e.target.value,
                              contribution_source: e.target.value
                                ? ""
                                : p.contribution_source,
                            }))
                          }
                        >
                          <option value="">{T("no_linked_account")}</option>
                          {bankAccounts.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                    {asset?.supports_contribution_source &&
                      addTxForm.transaction_type === "buy" &&
                      !addTxForm.linked_account_id &&
                      (() => {
                        const availableSources =
                          getAvailableContributionSources(asset);
                        return (
                          <div>
                            <FieldLabel text={T("label_contribution_source")} />
                            <select
                              className="inp"
                              value={addTxForm.contribution_source}
                              onChange={(e) =>
                                setAddTxForm((p) => ({
                                  ...p,
                                  contribution_source: e.target.value,
                                  linked_account_id: e.target.value
                                    ? ""
                                    : p.linked_account_id,
                                }))
                              }
                            >
                              <option value="">
                                {T("contribution_source_none")}
                              </option>
                              {availableSources.map((source) => (
                                <option key={source.id} value={source.id}>
                                  {source.name}
                                </option>
                              ))}
                            </select>
                          </div>
                        );
                      })()}
                    <div>
                      <FieldLabel text={T("tx_notes")} />
                      <input
                        className="inp"
                        placeholder={T("tx_notes")}
                        value={addTxForm.notes}
                        onChange={(e) =>
                          setAddTxForm((p) => ({ ...p, notes: e.target.value }))
                        }
                      />
                    </div>
                    <div>
                      <FieldLabel text={T("verified_filter_label")} />
                      <VerifiedToggleButton
                        checked={addTxForm.is_verified}
                        onToggle={() =>
                          setAddTxForm((p) => ({
                            ...p,
                            is_verified: !p.is_verified,
                          }))
                        }
                        T={T}
                      />
                    </div>
                  </>
                );
              })()
            )}

            {addTxError && (
              <div style={{ fontSize: 13, color: "var(--danger)" }}>
                {addTxError}
              </div>
            )}
            {addTxAssetId && (
              <button
                className="btn btn-primary"
                disabled={
                  addTxLoading ||
                  !addTxForm.shares ||
                  !addTxForm.price_per_share ||
                  !addTxForm.date
                }
                onClick={handleAddTxSubmit}
              >
                {addTxLoading ? "…" : T("btn_save")}
              </button>
            )}
          </div>
        )}
      </BottomSheet>

      {/* Asset add/edit sheet */}
      <BottomSheet
        open={showAssetModal}
        onClose={closeAssetModal}
        ariaLabel={
          editingAssetId ? T("modal_edit_asset") : T("modal_new_asset")
        }
      >
        {showAssetModal && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 11,
              padding: "8px 18px 18px",
            }}
          >
            <SheetTitle>
              {editingAssetId ? T("modal_edit_asset") : T("modal_new_asset")}
            </SheetTitle>
            <div>
              <FieldLabel text={T("label_name")} />
              <input
                className="inp"
                placeholder={T("placeholder_name")}
                value={assetForm.name}
                onChange={(e) =>
                  setAssetForm((p) => ({
                    ...p,
                    name: e.target.value,
                  }))
                }
              />
            </div>

            <div>
              <FieldLabel text={T("label_investment_type")} />
              <select
                className="inp"
                value={assetForm.investment_type}
                onChange={(e) =>
                  setAssetForm((p) => ({
                    ...p,
                    investment_type: e.target.value,
                  }))
                }
              >
                <option value="">{T("select_type")}</option>
                {investmentTypes
                  .filter((t) => !t.is_bank_account)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.icon} {t.name}
                    </option>
                  ))}
              </select>
              {selectedInvType && (
                <div
                  style={{
                    marginTop: 6,
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  {selectedInvType.supports_ticker ? (
                    <>
                      <span
                        style={{
                          fontSize: 11,
                          padding: "2px 8px",
                          borderRadius: 5,
                          background: "var(--accent-ring)",
                          color: "var(--accent)",
                          fontWeight: 600,
                        }}
                      >
                        Investment mode
                      </span>
                      <span
                        style={{
                          fontSize: 11,
                          color: "var(--fg-soft)",
                        }}
                      >
                        — value tracked via shares × price
                      </span>
                    </>
                  ) : (
                    <>
                      <span
                        style={{
                          fontSize: 11,
                          padding: "2px 8px",
                          borderRadius: 5,
                          background: "var(--success-soft)",
                          color: "var(--success)",
                          fontWeight: 600,
                        }}
                      >
                        💰 Balance mode
                      </span>
                      <span
                        style={{
                          fontSize: 11,
                          color: "var(--fg-soft)",
                        }}
                      >
                        — value set manually
                      </span>
                    </>
                  )}
                </div>
              )}
            </div>

            {selectedInvType && !selectedInvType.is_bank_account && (
              <div>
                <FieldLabel text={T("label_contribution_source_mode")} />
                <select
                  className="inp"
                  value={assetForm.contribution_source_mode || "inherit"}
                  onChange={(e) =>
                    setAssetForm((p) => ({
                      ...p,
                      contribution_source_mode: e.target.value,
                    }))
                  }
                >
                  <option value="inherit">
                    {T("contribution_source_mode_inherit")}
                  </option>
                  <option value="enabled">
                    {T("contribution_source_mode_enabled")}
                  </option>
                  <option value="disabled">
                    {T("contribution_source_mode_disabled")}
                  </option>
                </select>
              </div>
            )}

            {assetFormSupportsContributionSource &&
              activeContributionSources.length > 0 && (
                <div>
                  <FieldLabel text={T("label_contribution_sources_asset")} />
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                      background: "var(--card-inset)",
                      border: "1px solid var(--rule)",
                      borderRadius: 10,
                      padding: 10,
                    }}
                  >
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
                        checked={
                          (assetForm.contribution_source_ids || []).length === 0
                        }
                        onChange={(e) => {
                          if (e.target.checked) {
                            setAssetForm((p) => ({
                              ...p,
                              contribution_source_ids: [],
                            }));
                          }
                        }}
                      />
                      {T("contribution_sources_all")}
                    </label>
                    {activeContributionSources.map((source) => {
                      const selected = (
                        assetForm.contribution_source_ids || []
                      ).includes(String(source.id));
                      return (
                        <label
                          key={source.id}
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
                            checked={selected}
                            onChange={(e) =>
                              setAssetForm((p) => {
                                const current = p.contribution_source_ids || [];
                                const id = String(source.id);
                                const next = e.target.checked
                                  ? Array.from(new Set([...current, id]))
                                  : current.filter((item) => item !== id);
                                return {
                                  ...p,
                                  contribution_source_ids: next,
                                };
                              })
                            }
                          />
                          {source.name}
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

            {selectedInvType &&
              !selectedInvType.supports_ticker &&
              !editingAssetId && (
                <div>
                  <FieldLabel text={T("label_purchase_cost")} />
                  <input
                    type="text"
                    inputMode="decimal"
                    className="inp"
                    placeholder="0.00"
                    value={assetForm.initial_balance}
                    onChange={(e) =>
                      setAssetForm((p) => ({
                        ...p,
                        initial_balance: e.target.value,
                      }))
                    }
                  />
                </div>
              )}

            {selectedInvType && !selectedInvType.is_bank_account && (
              <div>
                <FieldLabel text={T("label_asset_tax_rate_override")} />
                <input
                  type="text"
                  inputMode="decimal"
                  className="inp"
                  placeholder={T("tax_rate_zero_none")}
                  value={assetForm.tax_rate_override}
                  onChange={(e) =>
                    setAssetForm((p) => ({
                      ...p,
                      tax_rate_override: e.target.value,
                    }))
                  }
                />
              </div>
            )}

            {/* Ticker autocomplete — only for types with supports_ticker */}
            {selectedInvType?.supports_ticker && (
              <div>
                <FieldLabel text={T("label_price_source")} />
                <select
                  className="inp"
                  value={assetForm.price_source || "AUTO"}
                  onChange={(e) => handlePriceSourceChange(e.target.value)}
                >
                  <option value="AUTO">{T("price_source_auto")}</option>
                  <option value="YAHOO">{T("price_source_yahoo")}</option>
                  <option value="BORSA_ITALIANA">
                    {T("price_source_borsa")}
                  </option>
                </select>
              </div>
            )}

            {selectedInvType?.supports_ticker && (
              <div style={{ position: "relative" }}>
                <FieldLabel text={T("label_ticker")} />
                <div style={{ position: "relative" }}>
                  <input
                    className="inp"
                    placeholder={T("placeholder_ticker")}
                    value={tickerQuery}
                    onChange={(e) => handleTickerInput(e.target.value)}
                    onFocus={() =>
                      tickerResults.length > 0 && setShowTickerDrop(true)
                    }
                    onBlur={() =>
                      setTimeout(() => setShowTickerDrop(false), 150)
                    }
                    autoComplete="off"
                  />
                  {tickerLoading && (
                    <div
                      style={{
                        position: "absolute",
                        right: 12,
                        top: "50%",
                        transform: "translateY(-50%)",
                        fontSize: 12,
                        color: "var(--fg-soft)",
                      }}
                    >
                      <Icon name="refresh" size={16} />
                    </div>
                  )}
                </div>
                {showTickerDrop &&
                  tickerSearchOrigin === "ticker" &&
                  tickerResults.length > 0 && (
                    <TickerResultsDrop
                      results={tickerResults}
                      onSelect={selectTicker}
                      T={T}
                    />
                  )}
              </div>
            )}

            {selectedInvType?.supports_ticker && (
              <div style={{ position: "relative" }}>
                <FieldLabel text={T("label_isin")} />
                <input
                  className="inp"
                  placeholder={T("placeholder_isin")}
                  value={assetForm.isin}
                  onChange={(e) => handleIsinInput(e.target.value)}
                  onFocus={() =>
                    tickerSearchOrigin === "isin" &&
                    tickerResults.length > 0 &&
                    setShowTickerDrop(true)
                  }
                  onBlur={() => setTimeout(() => setShowTickerDrop(false), 150)}
                  maxLength={12}
                  autoComplete="off"
                />
                {showTickerDrop &&
                  tickerSearchOrigin === "isin" &&
                  tickerResults.length > 0 && (
                    <TickerResultsDrop
                      results={tickerResults}
                      onSelect={selectTicker}
                      T={T}
                    />
                  )}
                {assetForm.isin && !assetForm.ticker && (
                  <div
                    style={{
                      marginTop: 5,
                      color: "var(--warning)",
                      fontSize: 11,
                    }}
                  >
                    {tickerSearchOrigin === "isin" &&
                    showTickerDrop &&
                    !tickerLoading &&
                    tickerResults.length === 0
                      ? T("isin_no_match")
                      : T("isin_requires_symbol")}
                  </div>
                )}
              </div>
            )}
            {bankAccounts.length > 0 && (
              <div>
                <FieldLabel text={T("label_source_account")} />
                <select
                  className="inp"
                  value={assetForm.source_account ?? ""}
                  onChange={(e) =>
                    setAssetForm((p) => ({
                      ...p,
                      source_account: e.target.value,
                    }))
                  }
                >
                  <option value="">{T("no_source_account")}</option>
                  {bankAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <FieldLabel text={T("label_notes")} />
              <textarea
                className="inp"
                placeholder={T("placeholder_notes")}
                rows={2}
                value={assetForm.notes}
                onChange={(e) =>
                  setAssetForm((p) => ({
                    ...p,
                    notes: e.target.value,
                  }))
                }
              />
            </div>
            {assetError && (
              <div
                style={{
                  background: "var(--danger-soft)",
                  border: "1px solid var(--danger-soft)",
                  borderRadius: 8,
                  padding: "8px 12px",
                  fontSize: 13,
                  color: "var(--danger)",
                }}
              >
                {assetError}
              </div>
            )}
            <div
              className="row"
              style={{
                justifyContent: "flex-end",
                gap: 8,
                marginTop: 6,
              }}
            >
              <button className="btn btn-g" onClick={closeAssetModal}>
                {T("btn_cancel")}
              </button>
              <button className="btn btn-p" onClick={saveAsset}>
                {editingAssetId ? T("btn_save") : T("btn_add")}
              </button>
            </div>
          </div>
        )}
      </BottomSheet>

      <BottomSheet
        open={!!realizeModal}
        onClose={() => setRealizeModal(null)}
        ariaLabel={T("modal_realize_asset")}
      >
        {realizeModal &&
          (() => {
            const salePrice = parseFlexibleDecimal(realizeForm.sale_price);
            const fee = realizeForm.fee
              ? parseFlexibleDecimal(realizeForm.fee)
              : 0;
            const rate = Number.parseFloat(
              realizeModal.effective_tax_rate ??
                realizeModal.investment_type_detail?.tax_rate ??
                0,
            );
            const taxPreview =
              Number.isFinite(salePrice) && Number.isFinite(fee)
                ? Math.max(
                    salePrice -
                      Number.parseFloat(realizeModal.invested_capital || 0) -
                      fee,
                    0,
                  ) * rate
                : 0;
            return (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 14,
                  padding: "8px 18px 18px",
                }}
              >
                <SheetTitle>{T("modal_realize_asset")}</SheetTitle>
                <div>
                  <FieldLabel text={T("label_sale_price")} />
                  <input
                    type="text"
                    inputMode="decimal"
                    className="inp"
                    value={realizeForm.sale_price}
                    onChange={(e) =>
                      setRealizeForm((p) => ({
                        ...p,
                        sale_price: e.target.value,
                      }))
                    }
                  />
                </div>
                <div>
                  <FieldLabel text={T("tx_dest_account")} />
                  <select
                    className="inp"
                    value={realizeForm.dest_account_id}
                    onChange={(e) =>
                      setRealizeForm((p) => ({
                        ...p,
                        dest_account_id: e.target.value,
                      }))
                    }
                  >
                    <option value="">{T("no_linked_account")}</option>
                    {bankAccounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <FieldLabel text={T("tx_fee")} />
                  <input
                    type="text"
                    inputMode="decimal"
                    className="inp"
                    placeholder="0.00"
                    value={realizeForm.fee}
                    onChange={(e) =>
                      setRealizeForm((p) => ({ ...p, fee: e.target.value }))
                    }
                  />
                </div>
                <div
                  style={{
                    background: "var(--card-inset)",
                    border: "1px solid var(--rule)",
                    borderRadius: 8,
                    padding: "10px 12px",
                    fontSize: 13,
                    color: "var(--fg-soft)",
                  }}
                >
                  {T("tx_estimated_tax")}: {formatEur(taxPreview)}
                </div>
                {realizeError && (
                  <div style={{ color: "var(--danger)", fontSize: 13 }}>
                    {realizeError}
                  </div>
                )}
                <div
                  className="row"
                  style={{ justifyContent: "flex-end", gap: 8 }}
                >
                  <button
                    className="btn btn-g"
                    onClick={() => setRealizeModal(null)}
                  >
                    {T("btn_cancel")}
                  </button>
                  <button
                    className="btn btn-p"
                    disabled={realizeLoading}
                    onClick={submitRealizeAsset}
                  >
                    {realizeLoading ? "..." : T("btn_realize_asset")}
                  </button>
                </div>
              </div>
            );
          })()}
      </BottomSheet>

      {/* Delete transaction confirm sheet */}
      <BottomSheet
        open={!!txDeleteConfirm}
        onClose={() => setTxDeleteConfirm(null)}
        ariaLabel={T("tx_delete_confirm")}
      >
        {txDeleteConfirm && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 16,
              padding: "8px 18px 18px",
            }}
          >
            <SheetTitle>{T("tx_delete_confirm")}</SheetTitle>
            <div
              style={{
                background: "var(--card-inset)",
                borderRadius: 10,
                padding: "12px 14px",
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>
                {T(`tx_type_${txDeleteConfirm.transaction_type}`) ||
                  txDeleteConfirm.transaction_type}
                {" · "}
                {formatDate(txDeleteConfirm.date)}
                {txDeleteConfirm.asset?.name
                  ? ` · ${txDeleteConfirm.asset.name}`
                  : ""}
              </div>
              <div
                style={{
                  fontSize: 16,
                  fontWeight: 600,
                  fontFamily: "var(--font-mono)",
                  color: "var(--danger)",
                }}
              >
                {["buy", "cash_out"].includes(txDeleteConfirm.transaction_type)
                  ? "-"
                  : "+"}
                {formatEur(txDeleteConfirm.total_value)}
              </div>
            </div>
            <div style={{ fontSize: 13, color: "var(--fg-soft)" }}>
              {T("action_cannot_be_undone")}
            </div>
            <div className="row" style={{ justifyContent: "flex-end", gap: 8 }}>
              <button
                className="btn btn-g"
                onClick={() => setTxDeleteConfirm(null)}
              >
                {T("btn_cancel")}
              </button>
              <button
                className="btn"
                style={{
                  background: "var(--danger)",
                  color: "var(--btn-primary-fg)",
                  padding: "10px 18px",
                }}
                onClick={() =>
                  deleteTx(txDeleteConfirm.id, txDeleteConfirm.asset?.id)
                }
              >
                {T("btn_delete")}
              </button>
            </div>
          </div>
        )}
      </BottomSheet>

      {/* Bulk verify confirm sheet */}
      <BottomSheet
        open={!!pendingAssetTxBulkVerify}
        onClose={() => setPendingAssetTxBulkVerify(null)}
        ariaLabel={T("cf_bulk_apply")}
      >
        {pendingAssetTxBulkVerify && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 16,
              padding: "8px 18px 18px",
            }}
          >
            <SheetTitle>
              {T(
                pendingAssetTxBulkVerify.value
                  ? "cf_bulk_verify"
                  : "cf_bulk_unverify",
              )}
            </SheetTitle>
            <div style={{ fontSize: 14 }}>
              {T("cf_bulk_confirm_verify_summary")
                .replace("{count}", String(assetTxSelectedCount))
                .replace(
                  "{verb}",
                  T(
                    pendingAssetTxBulkVerify.value
                      ? "cf_bulk_verify"
                      : "cf_bulk_unverify",
                  ),
                )}
            </div>
            {assetTxSelectAllFiltered && (
              <div style={{ fontSize: 13, color: "var(--fg-soft)" }}>
                {T("cf_bulk_confirm_verify_hint_filtered")}
              </div>
            )}
            {assetTxBulkError && (
              <div style={{ color: "var(--danger)", fontSize: 12 }}>
                {assetTxBulkError}
              </div>
            )}
            <div className="row" style={{ justifyContent: "flex-end", gap: 8 }}>
              <button
                className="btn btn-g"
                onClick={() => setPendingAssetTxBulkVerify(null)}
              >
                {T("btn_cancel")}
              </button>
              <button
                className="btn btn-p"
                disabled={assetTxBulkLoading}
                data-testid="asset-tx-bulk-verify-confirm"
                onClick={async () => {
                  const ok = await applyAssetTxBulkVerify(
                    pendingAssetTxBulkVerify.value,
                  );
                  if (ok) setPendingAssetTxBulkVerify(null);
                }}
              >
                {T("cf_bulk_apply")}
              </button>
            </div>
          </div>
        )}
      </BottomSheet>

      {assetTxSelectionMode && assetTxSelectedCount > 0 && (
        <div
          data-testid="asset-tx-bulk-toolbar"
          role="toolbar"
          aria-label={T("cf_bulk_edit_title")}
          style={{
            position: "fixed",
            left: "50%",
            transform: "translateX(-50%)",
            bottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)",
            zIndex: 1080,
            background: "var(--card)",
            border: "1px solid var(--rule)",
            borderRadius: 16,
            boxShadow: "var(--shadow-modal)",
            padding: "8px 10px",
            display: "flex",
            alignItems: "center",
            gap: 8,
            width: "min(560px, calc(100vw - 24px))",
            maxWidth: "100vw",
          }}
        >
          <span
            aria-live="polite"
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: "var(--accent-deep)",
              padding: "0 8px",
              whiteSpace: "nowrap",
            }}
          >
            {T("cf_bulk_selected_count").replace(
              "{count}",
              String(assetTxSelectedCount),
            )}
          </span>
          <button
            data-testid="asset-tx-bulk-verify"
            className="btn btn-g btn-sm"
            disabled={assetTxBulkLoading}
            onClick={() => triggerAssetTxBulkVerify(true)}
          >
            ✓ {T("cf_bulk_verify")}
          </button>
          <button
            data-testid="asset-tx-bulk-unverify"
            className="btn btn-g btn-sm"
            disabled={assetTxBulkLoading}
            onClick={() => triggerAssetTxBulkVerify(false)}
          >
            ○ {T("cf_bulk_unverify")}
          </button>
          <button
            className="btn btn-g btn-sm"
            onClick={exitAssetTxSelectionMode}
            data-testid="asset-tx-bulk-cancel"
            aria-label={T("btn_cancel")}
            title={T("btn_cancel")}
            style={{
              marginLeft: "auto",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "6px 8px",
            }}
          >
            <Icon name="x" size={16} aria-hidden="true" />
          </button>
        </div>
      )}

      <TxFiltersSheet
        open={txFiltersSheetOpen}
        onClose={() => setTxFiltersSheetOpen(false)}
        T={T}
        investments={investments}
        archivedInvestments={archivedInvestments}
        filters={assetTxFilters}
        setFilters={setAssetTxFilters}
        toggleType={toggleAssetTxType}
        periodMode={assetTxPeriodMode}
        setPeriodMode={setAssetTxPeriodMode}
      />

      <BottomSheet
        open={!!archiveBlockedModal}
        onClose={() => setArchiveBlockedModal(null)}
        ariaLabel={T("archive_investment_blocked_title")}
      >
        {archiveBlockedModal && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 12,
              padding: "8px 18px 18px",
            }}
          >
            <SheetTitle>{T("archive_investment_blocked_title")}</SheetTitle>
            <p style={{ fontSize: 13, color: "var(--fg-soft)", margin: 0 }}>
              {archiveBlockedModal.type === "shares"
                ? T("archive_investment_shares_blocked_body")
                    .replace("{name}", archiveBlockedModal.assetName)
                    .replace("{shares}", archiveBlockedModal.shares)
                : T("archive_investment_balance_blocked_body")
                    .replace("{name}", archiveBlockedModal.assetName)
                    .replace("{value}", archiveBlockedModal.currentValue)
                    .replace("{currency}", archiveBlockedModal.currency)}
            </p>
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                marginTop: 6,
              }}
            >
              <button
                className="btn btn-p"
                onClick={() => setArchiveBlockedModal(null)}
              >
                {T("btn_close")}
              </button>
            </div>
          </div>
        )}
      </BottomSheet>

      <SpeedDialFab
        mainLabel={T("btn_add_investment")}
        hidden={hasActiveOverlay}
        actions={[
          {
            icon: <Icon name="investments" size={18} />,
            label: T("add_modal_mode_asset"),
            testId: "portfolio-fab-add-asset",
            onClick: openAssetAdd,
          },
          {
            icon: <Icon name="transfer" size={18} />,
            label: T("add_modal_mode_transaction"),
            testId: "portfolio-fab-add-transaction",
            onClick: openAddTxModal,
          },
        ]}
      />
    </>
  );
}
