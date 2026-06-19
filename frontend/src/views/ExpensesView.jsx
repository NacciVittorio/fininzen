import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useApp } from "../context/useApp";
import { API } from "../utils/api";
import { formatDate, filterAmountInput } from "../utils/formatters";
import { useFormatters } from "../utils/useFormatters";
import Modal from "../components/Modal";
import FieldLabel from "../components/FieldLabel";
import CategorySelect from "../components/CategorySelect";
import BulkEditModal from "../components/BulkEditModal";
import CfSummaryCard from "../components/cashflow/CfSummaryCard";
import CfFiltersSheet from "../components/cashflow/CfFiltersSheet";
import CfTransactionRow from "../components/cashflow/CfTransactionRow";
import CfDetailSheet from "../components/cashflow/CfDetailSheet";
import {
  PageHeader,
  Fab,
  Popover,
  Icon,
  MonthPager,
  MonthPicker,
  BottomSheet,
  SegmentedControl,
  VerifiedToggleButton,
  PullToRefresh,
} from "../components/ui";

const overflowMenuItemStyle = {
  background: "transparent",
  border: 0,
  color: "var(--fg)",
  padding: "8px 10px",
  borderRadius: 8,
  fontSize: 13,
  fontWeight: 500,
  cursor: "pointer",
  fontFamily: "inherit",
  textAlign: "left",
  display: "flex",
  alignItems: "center",
  gap: 6,
};

const selectLikeCategoryShellStyle = {
  position: "relative",
  background: "var(--card-inset)",
  border: "1px solid var(--rule)",
  borderRadius: 10,
  overflow: "hidden",
};

const selectLikeCategoryStyle = {
  width: "100%",
  appearance: "none",
  WebkitAppearance: "none",
  MozAppearance: "none",
  background: "transparent",
  border: 0,
  color: "var(--fg)",
  padding: "10px 36px 10px 14px",
  fontSize: 16,
  fontFamily: "inherit",
  lineHeight: 1.2,
};

const selectLikeCategoryChevronStyle = {
  position: "absolute",
  right: 12,
  top: "50%",
  transform: "translateY(-50%)",
  fontSize: 11,
  color: "var(--fg-soft)",
  pointerEvents: "none",
};

const ALL_CF_TYPES = ["income", "outcome", "transfer", "adjustment"];

export default function ExpensesView() {
  const { formatEur } = useFormatters();
  const {
    T,
    MONTHS,
    categories,
    assets,
    showExpModal,
    editingExpenseId,
    expError,
    setExpError,
    modalDir,
    setModalDir,
    expForm,
    setExpForm,
    bankAccounts,
    archivedBankAccounts,
    transferForm,
    setTransferForm,
    transferError,
    setTransferError,
    transferWarning,
    transferLoading,
    submitTransferInCfModal,
    openExpenseModal,
    closeExpenseModal,
    submitExpense,
    openAdjustBalance,
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
    deleteCfExpense,
    deleteCfTx,
    openCfEditTransfer,
    closeCfEditTransfer,
    submitCfEditTransfer,
    // cash flow bulk selection (K-3.7)
    cfSelectionMode,
    cfSelectAllFiltered,
    cfSelectedCount,
    cfBulkLoading,
    cfBulkError,
    cfBulkEditOpen,
    cfSelectionKind,
    cfSelectionRejectionTick,
    bulkActionsAllowed,
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
    decimalSeparator,
    apiFetch,
    filterMonth,
    filterYear,
    accountingMonthDateRange,
    refreshAfter,
    transactionPrefs,
  } = useApp();

  const [deleteCfTarget, setDeleteCfTarget] = useState(null);
  // Transaction tapped open in the detail sheet; row whose swipe actions are revealed.
  const [detailItem, setDetailItem] = useState(null);
  const [swipedRowId, setSwipedRowId] = useState(null);
  // Period / Filtri bottom-sheet visibility. Declared up here (not next to the
  // period useMemo below) because the accounting-month sync effect reads
  // periodSheetOpen in its dependency array, which is evaluated during render —
  // a later declaration would hit the temporal dead zone and crash the view.
  const [periodSheetOpen, setPeriodSheetOpen] = useState(false);
  const [filtersSheetOpen, setFiltersSheetOpen] = useState(false);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  // Single object: { value: bool } when a verify/unverify needs confirmation.
  const [pendingBulkVerify, setPendingBulkVerify] = useState(null);
  // Above this many rows, verify/unverify requires explicit confirmation.
  // select-all-filtered always confirms (the user can't see every target row).
  const BULK_VERIFY_CONFIRM_THRESHOLD = 25;
  const [cfPeriodMode, setCfPeriodMode] = useState("month");
  const [bulkOverflowOpen, setBulkOverflowOpen] = useState(false);
  const bulkOverflowAnchorRef = useRef(null);
  // Ephemeral toast shown when a click tries to add a row of a kind that
  // doesn't match the current locked selection kind. Observed via the tick
  // counter the context bumps — separate state keeps the message + timer
  // independent of other UI state.
  const [kindMismatchToastUntil, setKindMismatchToastUntil] = useState(0);
  useEffect(() => {
    if (cfSelectionRejectionTick === 0) return;
    setKindMismatchToastUntil(Date.now() + 2400);
    const t = setTimeout(() => setKindMismatchToastUntil(0), 2400);
    return () => clearTimeout(t);
  }, [cfSelectionRejectionTick]);
  const showKindMismatchToast = kindMismatchToastUntil > Date.now();

  // Selection mode hides the mobile bottom nav (the bulk toolbar owns the
  // bottom edge); toggled via a body class consumed in tokens.css.
  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    document.body.classList.toggle("cf-select-mode", cfSelectionMode);
    return () => document.body.classList.remove("cf-select-mode");
  }, [cfSelectionMode]);
  // Compact toolbar layout on narrow viewports — overflow extra actions into a
  // popover so the bar never wraps. Listens to viewport changes so rotating
  // a tablet between portrait/landscape updates the layout live.
  const [isBulkCompact, setIsBulkCompact] = useState(() =>
    typeof window === "undefined"
      ? false
      : window.matchMedia("(max-width: 720px)").matches,
  );
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 720px)");
    const update = (e) => setIsBulkCompact(e.matches);
    mq.addEventListener?.("change", update);
    return () => mq.removeEventListener?.("change", update);
  }, []);
  const [debouncedCfFilters, setDebouncedCfFilters] = useState(cfFilters);

  const [descSuggestions, setDescSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [descTouched, setDescTouched] = useState(false);
  const debounceRef = useRef(null);
  const wasExpModalOpenRef = useRef(false);

  const fetchSuggestions = useCallback(
    async (categoryId, q) => {
      if (!categoryId || !q) {
        setDescSuggestions([]);
        setShowSuggestions(false);
        return;
      }
      const url = `${API}/expenses/description-suggestions/?category_id=${categoryId}&q=${encodeURIComponent(q)}`;
      try {
        const res = await apiFetch(url);
        if (res.ok) {
          const data = await res.json();
          setDescSuggestions(data);
          setShowSuggestions(data.length > 0);
        }
      } catch {
        // network error — silently ignore, autocomplete is non-critical
      }
    },
    [apiFetch],
  );

  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (!descTouched || !expForm.category || !expForm.description) {
      setDescSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    debounceRef.current = setTimeout(() => {
      fetchSuggestions(expForm.category, expForm.description);
    }, 280);
    return () => clearTimeout(debounceRef.current);
  }, [expForm.description, expForm.category, descTouched, fetchSuggestions]);

  useEffect(() => {
    setDescTouched(false);
    setShowSuggestions(false);
    setDescSuggestions([]);
  }, [showExpModal, editingExpenseId]);

  // When the autofill preference is on, picking a category pre-fills the
  // account (linked_asset) with the one used on the most recent expense of that
  // category — but only if the user hasn't already chosen an account.
  const handleExpenseCategoryChange = useCallback(
    async (val) => {
      setExpForm((p) => ({ ...p, category: val }));
      if (!val || !transactionPrefs?.cashflow_autofill_last_account) return;
      try {
        const res = await apiFetch(
          `${API}/expenses/last-account/?category=${encodeURIComponent(val)}`,
        );
        if (!res.ok) return;
        const data = await res.json();
        if (data?.linked_asset == null) return;
        setExpForm((p) =>
          p.linked_asset
            ? p
            : { ...p, linked_asset: String(data.linked_asset) },
        );
      } catch {
        /* network error — leave the account untouched */
      }
    },
    [apiFetch, setExpForm, transactionPrefs?.cashflow_autofill_last_account],
  );

  useEffect(() => {
    const t = setTimeout(() => setDebouncedCfFilters(cfFilters), 180);
    return () => clearTimeout(t);
  }, [cfFilters]);

  useEffect(() => {
    loadCfFeed(1, debouncedCfFilters);
  }, [loadCfFeed, debouncedCfFilters]);

  useEffect(() => {
    if (wasExpModalOpenRef.current && !showExpModal) {
      loadCfFeed(1);
    }
    wasExpModalOpenRef.current = showExpModal;
  }, [showExpModal, loadCfFeed]);

  useEffect(() => {
    if (!periodSheetOpen) return;
    if (!cfFilters.date_from || !cfFilters.date_to) {
      setCfPeriodMode("month");
      return;
    }
    const from = new Date(cfFilters.date_from);
    const fromYear = from.getFullYear();
    const fromMonth = from.getMonth() + 1;
    const accountingRange = accountingMonthDateRange(fromYear, fromMonth);
    const sameAccountingMonth =
      cfFilters.date_from === accountingRange.from &&
      cfFilters.date_to === accountingRange.to;
    setCfPeriodMode(sameAccountingMonth ? "month" : "year");
  }, [
    accountingMonthDateRange,
    periodSheetOpen,
    cfFilters.date_from,
    cfFilters.date_to,
  ]);

  const monthlyExp = useMemo(() => {
    if (cfSummary?.outcome !== undefined) {
      return parseFloat(cfSummary.outcome || 0);
    }
    return (cfItems || []).reduce(
      (acc, item) =>
        acc +
        (item.is_verified && item.type === "outcome"
          ? parseFloat(item.amount || 0)
          : 0),
      0,
    );
  }, [cfItems, cfSummary]);
  const monthlyInc = useMemo(() => {
    if (cfSummary?.income !== undefined) {
      return parseFloat(cfSummary.income || 0);
    }
    return (cfItems || []).reduce(
      (acc, item) =>
        acc +
        (item.is_verified && item.type === "income"
          ? parseFloat(item.amount || 0)
          : 0),
      0,
    );
  }, [cfItems, cfSummary]);
  const netto = monthlyInc - monthlyExp;

  // ── Period control (MonthPager promoted to the header) ──
  // Derived from the active accounting-month range; the label opens a sheet
  // that exposes the year / "all" options. (periodSheetOpen / filtersSheetOpen
  // are declared with the other UI state above, ahead of the sync effect.)
  const period = useMemo(() => {
    const from = cfFilters.date_from;
    const to = cfFilters.date_to;
    if (!from) return { kind: "all" };
    const d = new Date(from);
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    if (from === `${y}-01-01` && to === `${y}-12-31`) {
      return { kind: "year", year: y };
    }
    return { kind: "month", month: m, year: y };
  }, [cfFilters.date_from, cfFilters.date_to]);
  const periodMonth = period.month || filterMonth || new Date().getMonth() + 1;
  const periodYear = period.year || filterYear || new Date().getFullYear();
  const periodLabel =
    period.kind === "all"
      ? T("time_all")
      : period.kind === "year"
        ? String(periodYear)
        : MONTHS[periodMonth - 1];
  const setAccountingMonth = useCallback(
    ({ month, year }) => {
      const { from, to } = accountingMonthDateRange(year, month);
      setCfFilters((p) => ({ ...p, date_from: from, date_to: to }));
    },
    [accountingMonthDateRange, setCfFilters],
  );
  const nowForPager = new Date();
  const disableForward =
    periodYear > nowForPager.getFullYear() ||
    (periodYear === nowForPager.getFullYear() &&
      periodMonth >= nowForPager.getMonth() + 1);

  // Active-filter badge on the "Filtri" button. Period lives in the header and
  // is intentionally excluded (matches the prototype).
  const activeFilterCount =
    (cfFilters.types.length !== 4 ? 1 : 0) +
    (cfFilters.verified !== null && cfFilters.verified !== undefined ? 1 : 0) +
    ((cfFilters.account_ids?.length || 0) > 0 ? 1 : 0) +
    ((cfFilters.category_ids?.length || 0) > 0 ? 1 : 0) +
    ((cfFilters.ordering || "-date") !== "-date" ? 1 : 0);

  // "Da verificare" nudge — counts unverified rows currently loaded for the
  // period. Hidden once the user is already filtering to unverified only.
  const unverifiedCount = useMemo(
    () => (cfItems || []).filter((i) => !i.is_verified).length,
    [cfItems],
  );

  // Title for the "Nuovo movimento" sheet (was the Modal title prop).
  const expModalTitle =
    modalDir === "transfer"
      ? T("modal_new_transfer")
      : editingExpenseId
        ? modalDir === "income"
          ? T("modal_edit_income")
          : T("modal_edit_expense")
        : modalDir === "income"
          ? T("modal_new_income")
          : T("modal_new_expense");

  const cfDecoratedItems = useMemo(() => {
    let prevDate = null;
    let prevMonthKey = null;
    const todayStr = new Date().toISOString().slice(0, 10);
    const yesterdayStr = new Date(Date.now() - 86400000)
      .toISOString()
      .slice(0, 10);
    return (cfItems || []).map((item) => {
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
  }, [cfItems, MONTHS, T]);

  const hasActiveOverlay =
    showExpModal ||
    !!deleteCfTarget ||
    !!cfEditTransferItem ||
    periodSheetOpen ||
    filtersSheetOpen ||
    !!detailItem ||
    cfSelectionMode ||
    !!cfBulkEditOpen ||
    bulkDeleteConfirm ||
    !!pendingBulkVerify ||
    bulkOverflowOpen;

  const triggerBulkVerify = (value) => {
    if (
      cfSelectAllFiltered ||
      cfSelectedCount > BULK_VERIFY_CONFIRM_THRESHOLD
    ) {
      setPendingBulkVerify({ value });
      return;
    }
    applyCfBulk({ action: "edit", patch: { is_verified: value } });
  };

  const handlePullRefresh = useCallback(async () => {
    await loadCfFeed({ reset: true });
    refreshAfter("expense_updated");
  }, [loadCfFeed, refreshAfter]);

  // Edit a cashflow item — opens the right editor per source_type. Shared by the
  // detail-sheet Edit button and the row right-swipe Edit action.
  const handleEditCfItem = (it) => {
    setDetailItem(null);
    if (it.source_type === "expense") {
      openExpenseModal({
        id: it.source_id,
        description: it.description,
        amount: it.amount,
        category: it.category?.id,
        date: it.date,
        linked_asset: it.account?.id,
        is_verified: it.is_verified,
      });
    } else if (it.source_type === "transfer") {
      openCfEditTransfer(it);
    } else if (it.source_type === "adjustment" && it.account) {
      const asset = assets.find((a) => a.id === it.account.id);
      if (asset) openAdjustBalance(asset);
    }
  };

  return (
    <>
      {/* ── All Transactions View (K-3.2) ── */}
      <PullToRefresh onRefresh={handlePullRefresh} disabled={cfSelectionMode}>
        <div>
          <PageHeader
            title={T("tab_cashflow")}
            actions={
              period.kind === "month" ? (
                <MonthPager
                  month={periodMonth}
                  year={periodYear}
                  onChange={setAccountingMonth}
                  onLabelClick={() => setPeriodSheetOpen(true)}
                  disableForward={disableForward}
                />
              ) : (
                <button
                  type="button"
                  data-testid="cf-period-button"
                  onClick={() => setPeriodSheetOpen(true)}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    background: "var(--card-inset)",
                    border: "1px solid var(--rule)",
                    borderRadius: 999,
                    padding: "7px 14px",
                    fontSize: 13,
                    fontWeight: 700,
                    color: "var(--fg)",
                    cursor: "pointer",
                    fontFamily: "inherit",
                    textTransform: "uppercase",
                    letterSpacing: "var(--ls-label)",
                  }}
                >
                  {period.kind === "all" ? T("time_all") : String(periodYear)}
                  <Icon name="chevronDown" size={12} />
                </button>
              )
            }
          />

          <CfSummaryCard
            monthLabel={periodLabel}
            net={netto}
            income={monthlyInc}
            outcome={monthlyExp}
            activeType={
              cfFilters.types.length === 1 ? cfFilters.types[0] : null
            }
            onToggleType={(ty) =>
              setCfFilters((p) => ({
                ...p,
                types:
                  p.types.length === 1 && p.types[0] === ty
                    ? ALL_CF_TYPES
                    : [ty],
              }))
            }
          />

          {/* Search + Filtri + Seleziona row (hidden in selection mode) */}
          {!cfSelectionMode && (
            <div
              style={{
                display: "flex",
                gap: 8,
                marginBottom: 10,
              }}
            >
              <div style={{ position: "relative", flex: 1, minWidth: 0 }}>
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
                  data-testid="cf-search-input"
                  type="search"
                  value={cfFilters.search ?? ""}
                  onChange={(e) =>
                    setCfFilters((p) => ({ ...p, search: e.target.value }))
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
                {cfFilters.search && (
                  <button
                    type="button"
                    data-testid="cf-search-clear"
                    onClick={() => setCfFilters((p) => ({ ...p, search: "" }))}
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

              <button
                type="button"
                data-testid="cf-filters-open"
                onClick={() => setFiltersSheetOpen(true)}
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
                    data-testid="cf-filters-count"
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
                type="button"
                data-testid="cf-select-mode"
                onClick={() => enterCfSelectionMode()}
                style={{
                  border: "1px solid var(--rule)",
                  cursor: "pointer",
                  background: "var(--card-inset)",
                  color: "var(--fg)",
                  borderRadius: 10,
                  padding: "0 14px",
                  fontSize: 14,
                  fontWeight: 700,
                  fontFamily: "inherit",
                  flexShrink: 0,
                  display: "inline-flex",
                  alignItems: "center",
                }}
              >
                {T("cf_bulk_select")}
              </button>
            </div>
          )}

          {!cfSelectionMode &&
            unverifiedCount > 0 &&
            cfFilters.verified !== false && (
              <button
                type="button"
                data-testid="cf-unverified-banner"
                onClick={() => setCfFilters((p) => ({ ...p, verified: false }))}
                style={{
                  width: "100%",
                  marginBottom: 10,
                  padding: "11px 14px",
                  borderRadius: 12,
                  border: "1px solid var(--warning-ring)",
                  cursor: "pointer",
                  background: "var(--warning-soft)",
                  color: "var(--warning)",
                  fontSize: 13.5,
                  fontWeight: 600,
                  textAlign: "left",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 8,
                  fontFamily: "inherit",
                }}
              >
                <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span aria-hidden="true">⚠︎</span>
                  {T("cf_unverified_nudge").replace(
                    "{count}",
                    String(unverifiedCount),
                  )}
                </span>
                <span style={{ fontWeight: 700, whiteSpace: "nowrap" }}>
                  {T("cf_review")} ›
                </span>
              </button>
            )}

          {/* Selection banner — visible only in selection mode */}
          {cfSelectionMode && cfItems.length > 0 && (
            <div
              data-testid="cf-bulk-banner"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "10px 12px",
                background: "var(--accent-soft)",
                borderRadius: 10,
                marginBottom: 8,
                fontSize: 12,
              }}
            >
              <button
                type="button"
                data-testid="cf-select-exit"
                onClick={exitCfSelectionMode}
                style={{
                  border: 0,
                  background: "none",
                  color: "var(--accent-deep)",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  whiteSpace: "nowrap",
                  padding: 0,
                }}
              >
                {T("btn_cancel")}
              </button>
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
                  String(cfSelectedCount),
                )}
              </span>
              {cfTotalCount > cfItems.length && (
                <div
                  data-testid="cf-bulk-mode-segmented"
                  style={{ marginLeft: "auto", minWidth: 0 }}
                  title={
                    cfFilters.types.length === 1
                      ? undefined
                      : T("cf_bulk_filter_to_select_all")
                  }
                >
                  <SegmentedControl
                    value={cfSelectAllFiltered ? "filtered" : "visible"}
                    onChange={(mode) => {
                      if (mode === "filtered") {
                        // Selecting all filtered requires a single-type filter
                        // so the resulting selection stays homogeneous.
                        if (cfFilters.types.length !== 1) return;
                        selectAllFilteredCf();
                      } else {
                        selectVisibleCf();
                      }
                    }}
                    options={[
                      {
                        value: "visible",
                        label: T("cf_bulk_select_mode_visible").replace(
                          "{count}",
                          String(cfItems.length),
                        ),
                      },
                      {
                        value: "filtered",
                        label: T("cf_bulk_select_mode_filtered").replace(
                          "{count}",
                          String(cfTotalCount),
                        ),
                      },
                    ]}
                  />
                </div>
              )}
              <div
                style={{
                  display: "flex",
                  gap: 6,
                  marginLeft: cfTotalCount > cfItems.length ? 0 : "auto",
                  flexWrap: "wrap",
                }}
              >
                <button
                  data-testid="cf-bulk-select-all"
                  onClick={selectVisibleCf}
                  className="btn btn-g btn-sm"
                  disabled={cfSelectedCount === cfItems.length}
                  style={{
                    padding: "4px 10px",
                    fontSize: 11,
                    opacity: cfSelectedCount === cfItems.length ? 0.5 : 1,
                  }}
                >
                  {T("cf_bulk_select_all")}
                </button>
                <button
                  data-testid="cf-bulk-deselect-all"
                  onClick={clearCfSelection}
                  className="btn btn-g btn-sm"
                  disabled={cfSelectedCount === 0}
                  style={{
                    padding: "4px 10px",
                    fontSize: 11,
                    opacity: cfSelectedCount === 0 ? 0.5 : 1,
                  }}
                >
                  {T("cf_bulk_deselect_all")}
                </button>
              </div>
            </div>
          )}

          {/* Feed list */}
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            {cfLoading && cfItems.length === 0 && (
              <div
                style={{
                  textAlign: "center",
                  color: "var(--fg-soft)",
                  padding: "32px 0",
                  fontSize: 13,
                }}
              >
                …
              </div>
            )}
            {!cfLoading && cfItems.length === 0 && (
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
            {cfDecoratedItems.map(
              ({
                item,
                monthKey,
                showMonthDivider,
                monthLabel,
                showDayDivider,
                dayLabel,
              }) => {
                let divider = null;
                let monthDivider = null;
                if (showMonthDivider) {
                  monthDivider = (
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
                  );
                }
                if (showDayDivider) {
                  divider = (
                    <div
                      key={`d-${item.date}-${item.id}`}
                      className="tx-day-divider"
                      style={{ padding: "6px 14px 2px" }}
                    >
                      {dayLabel}
                    </div>
                  );
                }

                const rowSelected =
                  cfSelectionMode && isCfItemSelected(item.id);
                return (
                  <div key={item.id}>
                    {monthDivider}
                    {divider}
                    <CfTransactionRow
                      item={item}
                      selectionMode={cfSelectionMode}
                      selected={rowSelected}
                      swipeOpen={swipedRowId === item.id}
                      onRequestSwipeOpen={setSwipedRowId}
                      onToggleSelect={(it) =>
                        toggleCfItemSelected(it.id, it.type)
                      }
                      onOpenDetail={(it) => {
                        setSwipedRowId(null);
                        setDetailItem(it);
                      }}
                      onEdit={(it) => {
                        setSwipedRowId(null);
                        handleEditCfItem(it);
                      }}
                      onVerifyToggle={(it) =>
                        setCfItemVerified(it, !it.is_verified)
                      }
                      onDelete={(it) => setDeleteCfTarget({ item: it })}
                      canVerify={item.source_type !== "adjustment"}
                    />
                  </div>
                );
              },
            )}
          </div>

          {/* Pagination (K-3.6) */}
          {(cfHasMore || cfLoading) && (
            <div
              className="row"
              style={{ gap: 8, marginTop: 10, justifyContent: "center" }}
            >
              {cfHasMore && (
                <button
                  className="btn btn-g btn-sm"
                  onClick={loadMoreCf}
                  disabled={cfLoading}
                >
                  {T("cf_load_more")}
                </button>
              )}
              {cfHasMore && (
                <button
                  className="btn btn-g btn-sm"
                  onClick={loadAllCf}
                  disabled={cfLoading}
                >
                  {T("cf_load_all")}
                </button>
              )}
            </div>
          )}
        </div>
      </PullToRefresh>

      {deleteCfTarget && (
        <Modal
          title={T("modal_delete_expense")}
          onClose={() => setDeleteCfTarget(null)}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div
              style={{
                background: "var(--card-inset)",
                borderRadius: 10,
                padding: "12px 14px",
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>
                {deleteCfTarget.item.description}
              </div>
              <div
                style={{
                  fontSize: 16,
                  fontWeight: 600,
                  fontFamily: "var(--font-mono)",
                  color: "var(--danger)",
                }}
              >
                {formatEur(deleteCfTarget.item.amount)}
              </div>
            </div>
            <div style={{ fontSize: 13, color: "var(--fg-soft)" }}>
              {T("action_cannot_be_undone")}
            </div>
            <div className="row" style={{ justifyContent: "flex-end", gap: 8 }}>
              <button
                className="btn btn-g"
                onClick={() => setDeleteCfTarget(null)}
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
                onClick={async () => {
                  const { item } = deleteCfTarget;
                  setDeleteCfTarget(null);
                  if (item.source_type === "expense") {
                    await deleteCfExpense(item.source_id);
                  } else {
                    await deleteCfTx(item);
                  }
                }}
              >
                {T("btn_delete")}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {showExpModal && (
        <BottomSheet open onClose={closeExpenseModal} ariaLabel={expModalTitle}>
          <div style={{ padding: "0 18px" }}>
            <div
              style={{
                fontSize: 18,
                fontWeight: 800,
                color: "var(--fg)",
                padding: "2px 2px 14px",
              }}
            >
              {expModalTitle}
            </div>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 12,
              }}
            >
              <div>
                <FieldLabel text={T("label_type")} />
                <div
                  style={{
                    display: "flex",
                    background: "rgba(0,0,0,0.22)",
                    border: "1px solid var(--rule)",
                    borderRadius: 8,
                    padding: 3,
                  }}
                >
                  {[
                    {
                      key: "expense",
                      label: T("direction_expense"),
                      color: "var(--danger)",
                    },
                    {
                      key: "income",
                      label: T("direction_income"),
                      color: "var(--success)",
                    },
                    {
                      key: "transfer",
                      label: T("direction_transfer"),
                      color: "var(--chart-4)",
                    },
                  ].map((t) => (
                    <button
                      key={t.key}
                      onClick={() => {
                        setModalDir(t.key);
                        setExpForm((p) => ({ ...p, category: "" }));
                        if (t.key === "transfer") {
                          setTransferForm({
                            from_account_id: "",
                            to_account_id: "",
                            amount: "",
                            date: new Date().toISOString().slice(0, 10),
                            notes: "",
                          });
                        }
                      }}
                      style={{
                        flex: 1,
                        padding: "6px 10px",
                        borderRadius: 6,
                        border: "none",
                        cursor: "pointer",
                        fontFamily: "inherit",
                        fontSize: 12,
                        fontWeight: 600,
                        background:
                          modalDir === t.key ? t.color + "22" : "transparent",
                        color: modalDir === t.key ? t.color : "var(--fg-soft)",
                        transition: "all 0.15s",
                      }}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
              {modalDir === "transfer" ? (
                <>
                  <div>
                    <FieldLabel text={T("transfer_from")} />
                    <div style={selectLikeCategoryShellStyle}>
                      <select
                        className="inp"
                        data-testid="transfer-from-account"
                        value={transferForm.from_account_id}
                        onChange={(e) =>
                          setTransferForm((p) => ({
                            ...p,
                            from_account_id: e.target.value,
                          }))
                        }
                        style={selectLikeCategoryStyle}
                      >
                        <option value="">{T("no_linked_account")}</option>
                        {bankAccounts.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name}
                          </option>
                        ))}
                      </select>
                      <span
                        aria-hidden="true"
                        style={selectLikeCategoryChevronStyle}
                      >
                        ▼
                      </span>
                    </div>
                  </div>
                  <div>
                    <FieldLabel text={T("transfer_to")} />
                    <div style={selectLikeCategoryShellStyle}>
                      <select
                        className="inp"
                        data-testid="transfer-to-account"
                        value={transferForm.to_account_id}
                        onChange={(e) =>
                          setTransferForm((p) => ({
                            ...p,
                            to_account_id: e.target.value,
                          }))
                        }
                        style={selectLikeCategoryStyle}
                      >
                        <option value="">{T("no_linked_account")}</option>
                        {bankAccounts
                          .filter(
                            (a) =>
                              String(a.id) !==
                              String(transferForm.from_account_id),
                          )
                          .map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.name}
                            </option>
                          ))}
                      </select>
                      <span
                        aria-hidden="true"
                        style={selectLikeCategoryChevronStyle}
                      >
                        ▼
                      </span>
                    </div>
                  </div>
                  <div>
                    <FieldLabel text={T("label_description_optional")} />
                    <input
                      className="inp"
                      placeholder={T("placeholder_description")}
                      value={transferForm.notes}
                      onChange={(e) =>
                        setTransferForm((p) => ({
                          ...p,
                          notes: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <div>
                    <FieldLabel text={T("transfer_amount")} />
                    <input
                      className="inp"
                      type="text"
                      inputMode="decimal"
                      placeholder={decimalSeparator === "," ? "0,00" : "0.00"}
                      data-testid="transfer-amount"
                      value={transferForm.amount}
                      onChange={(e) => {
                        setTransferError(null);
                        setTransferForm((p) => ({
                          ...p,
                          amount: filterAmountInput(e.target.value),
                        }));
                      }}
                    />
                  </div>
                  <div>
                    <FieldLabel text={T("label_date")} />
                    <div style={{ overflow: "hidden", borderRadius: 10 }}>
                      <input
                        className="inp"
                        type="date"
                        value={transferForm.date}
                        onChange={(e) =>
                          setTransferForm((p) => ({
                            ...p,
                            date: e.target.value,
                          }))
                        }
                      />
                    </div>
                  </div>
                  <div>
                    <FieldLabel text={T("verified_filter_label")} />
                    <VerifiedToggleButton
                      checked={transferForm.is_verified}
                      onToggle={() =>
                        setTransferForm((p) => ({
                          ...p,
                          is_verified: !p.is_verified,
                        }))
                      }
                      T={T}
                    />
                  </div>
                  {transferWarning && (
                    <div
                      style={{
                        background: "var(--warning-soft)",
                        border: "1px solid var(--warning-ring)",
                        borderRadius: 8,
                        padding: "8px 12px",
                        fontSize: 13,
                        color: "var(--warning)",
                      }}
                    >
                      ⚠ {transferWarning}
                    </div>
                  )}
                  {transferError && (
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
                      {transferError}
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div>
                    <FieldLabel text={T("label_category")} />
                    <CategorySelect
                      value={expForm.category}
                      onChange={handleExpenseCategoryChange}
                      categoryType={modalDir}
                      placeholder={T("no_category")}
                      categories={categories}
                    />
                  </div>
                  <div style={{ position: "relative" }}>
                    <FieldLabel text={T("label_description")} />
                    <input
                      className="inp"
                      placeholder={T("placeholder_description")}
                      value={expForm.description}
                      onChange={(e) => {
                        setDescTouched(true);
                        setExpForm((p) => ({
                          ...p,
                          description: e.target.value,
                        }));
                      }}
                      onBlur={() =>
                        setTimeout(() => setShowSuggestions(false), 150)
                      }
                      onFocus={() =>
                        descSuggestions.length > 0 && setShowSuggestions(true)
                      }
                      autoComplete="off"
                    />
                    {showSuggestions && descSuggestions.length > 0 && (
                      <div
                        style={{
                          position: "absolute",
                          top: "100%",
                          left: 0,
                          right: 0,
                          zIndex: 100,
                          background: "#1a1f2e",
                          border: "1px solid var(--rule)",
                          borderRadius: 10,
                          marginTop: 4,
                          overflow: "hidden",
                        }}
                      >
                        {descSuggestions.map((text) => (
                          <button
                            key={text}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              setExpForm((p) => ({ ...p, description: text }));
                              setShowSuggestions(false);
                              setDescTouched(false);
                            }}
                            style={{
                              display: "block",
                              width: "100%",
                              textAlign: "left",
                              padding: "9px 14px",
                              background: "transparent",
                              border: "none",
                              borderBottom: "1px solid var(--card-inset)",
                              color: "#e2e8f0",
                              fontSize: 13,
                              cursor: "pointer",
                              fontFamily: "inherit",
                            }}
                            onMouseEnter={(e) =>
                              (e.currentTarget.style.background =
                                "var(--card-inset)")
                            }
                            onMouseLeave={(e) =>
                              (e.currentTarget.style.background = "transparent")
                            }
                          >
                            {text}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div>
                    <FieldLabel text={T("label_amount")} />
                    <div style={{ position: "relative" }}>
                      <input
                        className="inp"
                        type="text"
                        inputMode="decimal"
                        placeholder={decimalSeparator === "," ? "0,00" : "0.00"}
                        style={{ paddingRight: 52 }}
                        value={expForm.amount}
                        onChange={(e) => {
                          setExpError(null);
                          setExpForm((p) => ({
                            ...p,
                            amount: filterAmountInput(e.target.value),
                          }));
                        }}
                      />
                      <span
                        style={{
                          position: "absolute",
                          right: 14,
                          top: "50%",
                          transform: "translateY(-50%)",
                          color: "var(--fg-soft)",
                          fontFamily: "var(--font-mono)",
                          fontSize: 13,
                          pointerEvents: "none",
                        }}
                      >
                        EUR
                      </span>
                    </div>
                  </div>
                  <div>
                    <FieldLabel text={T("label_date")} />
                    <div style={{ overflow: "hidden", borderRadius: 10 }}>
                      <input
                        className="inp"
                        type="date"
                        value={expForm.date}
                        onChange={(e) =>
                          setExpForm((p) => ({ ...p, date: e.target.value }))
                        }
                      />
                    </div>
                  </div>
                  <div>
                    <FieldLabel text={T("label_linked_asset")} />
                    <div style={selectLikeCategoryShellStyle}>
                      <select
                        className="inp"
                        value={expForm.linked_asset}
                        onChange={(e) =>
                          setExpForm((p) => ({
                            ...p,
                            linked_asset: e.target.value,
                          }))
                        }
                        style={selectLikeCategoryStyle}
                      >
                        <option value="">{T("no_linked_asset")}</option>
                        {assets
                          .filter(
                            (a) =>
                              a.tracking_type === "MANUAL" && !a.is_archived,
                          )
                          .map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.investment_type_detail?.icon || ""} {a.name}
                            </option>
                          ))}
                      </select>
                      <span
                        aria-hidden="true"
                        style={selectLikeCategoryChevronStyle}
                      >
                        ▼
                      </span>
                    </div>
                  </div>
                  <div>
                    <FieldLabel text={T("verified_filter_label")} />
                    <VerifiedToggleButton
                      checked={expForm.is_verified}
                      onToggle={() =>
                        setExpForm((p) => ({
                          ...p,
                          is_verified: !p.is_verified,
                        }))
                      }
                      T={T}
                    />
                  </div>
                  {expError && (
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
                      {expError}
                    </div>
                  )}
                </>
              )}
              <div
                className="row"
                style={{
                  justifyContent: "flex-end",
                  gap: 8,
                  marginTop: 8,
                }}
              >
                <button className="btn btn-g" onClick={closeExpenseModal}>
                  {T("btn_cancel")}
                </button>
                <button
                  className="btn btn-p"
                  onClick={
                    modalDir === "transfer"
                      ? submitTransferInCfModal
                      : submitExpense
                  }
                  disabled={modalDir === "transfer" && transferLoading}
                >
                  {modalDir === "transfer"
                    ? transferLoading
                      ? "..."
                      : T("btn_transfer")
                    : editingExpenseId
                      ? T("btn_update")
                      : T("btn_add")}
                </button>
              </div>
            </div>
          </div>
        </BottomSheet>
      )}

      {/* ── Edit Transfer Sheet (K-3.5) ── */}
      {cfEditTransferItem && (
        <BottomSheet
          open
          onClose={closeCfEditTransfer}
          ariaLabel={T("cf_edit_transfer")}
        >
          <div style={{ padding: "0 18px" }}>
            <div
              style={{
                fontSize: 18,
                fontWeight: 800,
                color: "var(--fg)",
                padding: "2px 2px 14px",
              }}
            >
              {T("cf_edit_transfer")}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div
                style={{
                  fontSize: 12,
                  color: "var(--fg-soft)",
                  background: "var(--rule-soft)",
                  borderRadius: 8,
                  padding: "8px 12px",
                }}
              >
                {cfEditTransferItem.from_account?.name} →{" "}
                {cfEditTransferItem.to_account?.name}
              </div>
              <div>
                <FieldLabel text={T("label_description_optional")} />
                <input
                  className="inp"
                  placeholder={T("placeholder_description")}
                  value={cfEditTransferForm.notes}
                  onChange={(e) =>
                    setCfEditTransferForm((p) => ({
                      ...p,
                      notes: e.target.value,
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
                  value={cfEditTransferForm.amount}
                  onChange={(e) =>
                    setCfEditTransferForm((p) => ({
                      ...p,
                      amount: filterAmountInput(e.target.value),
                    }))
                  }
                />
              </div>
              <div>
                <FieldLabel text={T("cf_edit_date")} />
                <input
                  className="inp"
                  type="date"
                  value={cfEditTransferForm.date}
                  onChange={(e) =>
                    setCfEditTransferForm((p) => ({
                      ...p,
                      date: e.target.value,
                    }))
                  }
                />
              </div>
              <div>
                <FieldLabel text={T("verified_filter_label")} />
                <VerifiedToggleButton
                  checked={cfEditTransferForm.is_verified}
                  onToggle={() =>
                    setCfEditTransferForm((p) => ({
                      ...p,
                      is_verified: !p.is_verified,
                    }))
                  }
                  T={T}
                />
              </div>
              {cfEditTransferError && (
                <div style={{ color: "var(--danger)", fontSize: 12 }}>
                  {cfEditTransferError}
                </div>
              )}
              <div
                className="row"
                style={{ justifyContent: "flex-end", gap: 8, marginTop: 4 }}
              >
                <button className="btn btn-g" onClick={closeCfEditTransfer}>
                  {T("btn_cancel")}
                </button>
                <button
                  className="btn btn-p"
                  onClick={submitCfEditTransfer}
                  disabled={cfEditTransferLoading}
                >
                  {T("cf_save")}
                </button>
              </div>
            </div>
          </div>
        </BottomSheet>
      )}

      {/* Rendered outside <PullToRefresh> on purpose: that wrapper applies a
          transform, which would become the containing block for this sheet's
          position:fixed overlay and anchor it to the page content instead of
          the viewport (top clipped, options hidden). */}
      <CfFiltersSheet
        open={filtersSheetOpen}
        onClose={() => setFiltersSheetOpen(false)}
      />

      <CfDetailSheet
        item={detailItem}
        open={!!detailItem}
        onClose={() => setDetailItem(null)}
        onEdit={handleEditCfItem}
        onDelete={(it) => {
          setDetailItem(null);
          setDeleteCfTarget({ item: it });
        }}
        onVerifyToggle={(it) => {
          setCfItemVerified(it, !it.is_verified);
          setDetailItem((prev) =>
            prev && prev.id === it.id
              ? { ...prev, is_verified: !it.is_verified }
              : prev,
          );
        }}
      />

      <BottomSheet
        open={periodSheetOpen}
        onClose={() => setPeriodSheetOpen(false)}
        ariaLabel={T("cf_period")}
      >
        <div style={{ padding: "4px 16px 12px" }}>
          <div
            style={{
              fontSize: 18,
              fontWeight: 800,
              color: "var(--fg)",
              padding: "2px 2px 12px",
            }}
          >
            {T("cf_period")}
          </div>
          <button
            type="button"
            onClick={() => {
              setCfFilters((p) => ({ ...p, date_from: null, date_to: null }));
              setPeriodSheetOpen(false);
            }}
            style={{
              width: "100%",
              background: !cfFilters.date_from
                ? "var(--accent-soft)"
                : "var(--card-inset)",
              color: !cfFilters.date_from ? "var(--accent-deep)" : "var(--fg)",
              border: 0,
              padding: "12px 14px",
              borderRadius: 12,
              fontSize: 14,
              fontWeight: !cfFilters.date_from ? 700 : 500,
              cursor: "pointer",
              textAlign: "left",
              fontFamily: "inherit",
              marginBottom: 12,
            }}
          >
            {T("time_all")}
          </button>
          <MonthPicker
            month={periodMonth}
            year={periodYear}
            viewMode={cfPeriodMode}
            onChange={({ month, year }) => {
              if (month) {
                setAccountingMonth({ month, year });
                setPeriodSheetOpen(false);
              } else {
                setCfFilters((p) => ({
                  ...p,
                  date_from: `${year}-01-01`,
                  date_to: `${year}-12-31`,
                }));
              }
            }}
            onViewModeChange={(mode) => {
              setCfPeriodMode(mode);
              const baseYear = cfFilters.date_from
                ? new Date(cfFilters.date_from).getFullYear()
                : periodYear;
              if (mode === "year") {
                setCfFilters((p) => ({
                  ...p,
                  date_from: `${baseYear}-01-01`,
                  date_to: `${baseYear}-12-31`,
                }));
              } else {
                const m = cfFilters.date_from
                  ? new Date(cfFilters.date_from).getMonth() + 1
                  : periodMonth;
                const { from, to } = accountingMonthDateRange(baseYear, m);
                setCfFilters((p) => ({ ...p, date_from: from, date_to: to }));
              }
            }}
          />
        </div>
      </BottomSheet>

      <Fab
        testId="expenses-add-fab"
        label={T("fab_add_transaction")}
        onClick={() => openExpenseModal()}
        hidden={hasActiveOverlay}
      />

      {showKindMismatchToast && (
        <div
          data-testid="cf-bulk-kind-mismatch-toast"
          role="status"
          aria-live="polite"
          style={{
            position: "fixed",
            top: "calc(env(safe-area-inset-top, 0px) + 12px)",
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 1085,
            background: "var(--warning-soft, #f59e0b22)",
            color: "var(--warning, #b45309)",
            border: "1px solid var(--warning-ring, #f59e0b55)",
            borderRadius: 999,
            padding: "8px 14px",
            fontSize: 13,
            fontWeight: 600,
            maxWidth: "calc(100vw - 24px)",
            boxShadow: "var(--shadow-modal)",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <Icon name="status" size={14} aria-hidden="true" />
          <span>{T("cf_bulk_kind_mismatch_toast")}</span>
        </div>
      )}

      {cfSelectionMode && cfSelectedCount > 0 && (
        <div
          data-testid="cf-bulk-toolbar"
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
            paddingLeft: "max(10px, env(safe-area-inset-left, 0px))",
            paddingRight: "max(10px, env(safe-area-inset-right, 0px))",
            display: "flex",
            alignItems: "center",
            gap: 8,
            width: isBulkCompact
              ? "calc(100vw - 16px)"
              : "min(760px, calc(100vw - 24px))",
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
              String(cfSelectedCount),
            )}
          </span>

          {!isBulkCompact && bulkActionsAllowed.verify && (
            <>
              <button
                data-testid="cf-bulk-verify"
                className="btn btn-g btn-sm"
                disabled={cfBulkLoading}
                onClick={() => triggerBulkVerify(true)}
              >
                ✓ {T("cf_bulk_verify")}
              </button>
              <button
                data-testid="cf-bulk-unverify"
                className="btn btn-g btn-sm"
                disabled={cfBulkLoading}
                onClick={() => triggerBulkVerify(false)}
              >
                ○ {T("cf_bulk_unverify")}
              </button>
            </>
          )}

          {bulkActionsAllowed.edit && (
            <button
              data-testid="cf-bulk-edit"
              className="btn btn-p btn-sm"
              disabled={cfBulkLoading}
              onClick={() => setCfBulkEditOpen(true)}
              style={{ marginLeft: isBulkCompact ? "auto" : 0 }}
            >
              {T("cf_bulk_edit")}
            </button>
          )}

          {cfSelectionKind === "adjustment" && (
            <span
              data-testid="cf-bulk-adjustment-hint"
              style={{
                marginLeft: "auto",
                fontSize: 11,
                color: "var(--fg-soft)",
                fontStyle: "italic",
                maxWidth: 220,
                lineHeight: 1.2,
              }}
            >
              {T("cf_bulk_adjustment_locked")}
            </span>
          )}

          <button
            data-testid="cf-bulk-delete-open"
            className="btn btn-sm"
            disabled={cfBulkLoading}
            onClick={() => setBulkDeleteConfirm(true)}
            aria-label={T("cf_bulk_delete")}
            title={T("cf_bulk_delete")}
            style={{
              background: "transparent",
              color: "var(--danger)",
              border: "1px solid var(--danger)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              padding: isBulkCompact ? "6px 10px" : "6px 12px",
              gap: 6,
            }}
          >
            <Icon name="trash" size={16} aria-hidden="true" />
            {!isBulkCompact && <span>{T("cf_bulk_delete")}</span>}
          </button>

          {isBulkCompact && bulkActionsAllowed.verify && (
            <>
              <button
                ref={bulkOverflowAnchorRef}
                data-testid="cf-bulk-overflow"
                className="btn btn-g btn-sm"
                disabled={cfBulkLoading}
                onClick={() => setBulkOverflowOpen((v) => !v)}
                aria-label={T("cf_bulk_more_actions")}
                aria-haspopup="menu"
                aria-expanded={bulkOverflowOpen}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "6px 8px",
                }}
              >
                <Icon name="moreVertical" size={18} aria-hidden="true" />
              </button>
              <Popover
                open={bulkOverflowOpen}
                onClose={() => setBulkOverflowOpen(false)}
                anchorRef={bulkOverflowAnchorRef}
                align="end"
                minWidth={200}
                zIndex={1090}
              >
                <div
                  role="menu"
                  style={{ display: "flex", flexDirection: "column", gap: 2 }}
                >
                  <button
                    role="menuitem"
                    data-testid="cf-bulk-verify"
                    onClick={() => {
                      setBulkOverflowOpen(false);
                      triggerBulkVerify(true);
                    }}
                    disabled={cfBulkLoading}
                    style={overflowMenuItemStyle}
                  >
                    ✓ {T("cf_bulk_verify")}
                  </button>
                  <button
                    role="menuitem"
                    data-testid="cf-bulk-unverify"
                    onClick={() => {
                      setBulkOverflowOpen(false);
                      triggerBulkVerify(false);
                    }}
                    disabled={cfBulkLoading}
                    style={overflowMenuItemStyle}
                  >
                    ○ {T("cf_bulk_unverify")}
                  </button>
                  <div
                    style={{
                      height: 1,
                      background: "var(--rule)",
                      margin: "4px 0",
                    }}
                  />
                  <button
                    role="menuitem"
                    onClick={() => {
                      setBulkOverflowOpen(false);
                      clearCfSelection();
                    }}
                    style={overflowMenuItemStyle}
                  >
                    {T("cf_bulk_clear_selection")}
                  </button>
                </div>
              </Popover>
            </>
          )}

          <button
            className="btn btn-g btn-sm"
            onClick={exitCfSelectionMode}
            data-testid="cf-bulk-cancel"
            aria-label={T("btn_cancel")}
            title={T("btn_cancel")}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              padding: isBulkCompact ? "6px 8px" : "6px 12px",
            }}
          >
            <Icon name="x" size={16} aria-hidden="true" />
            {!isBulkCompact && (
              <span style={{ marginLeft: 4 }}>{T("btn_cancel")}</span>
            )}
          </button>
        </div>
      )}

      {cfBulkEditOpen && (
        <BulkEditModal onClose={() => setCfBulkEditOpen(false)} />
      )}

      {pendingBulkVerify && (
        <Modal
          title={T(
            pendingBulkVerify.value ? "cf_bulk_verify" : "cf_bulk_unverify",
          )}
          onClose={() => setPendingBulkVerify(null)}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ fontSize: 14 }}>
              {T("cf_bulk_confirm_verify_summary")
                .replace("{count}", String(cfSelectedCount))
                .replace(
                  "{verb}",
                  T(
                    pendingBulkVerify.value
                      ? "cf_bulk_verify"
                      : "cf_bulk_unverify",
                  ),
                )}
            </div>
            {cfSelectAllFiltered && (
              <div style={{ fontSize: 13, color: "var(--fg-soft)" }}>
                {T("cf_bulk_confirm_verify_hint_filtered")}
              </div>
            )}
            {cfBulkError && (
              <div style={{ color: "var(--danger)", fontSize: 12 }}>
                {cfBulkError}
              </div>
            )}
            <div className="row" style={{ justifyContent: "flex-end", gap: 8 }}>
              <button
                className="btn btn-g"
                onClick={() => setPendingBulkVerify(null)}
              >
                {T("btn_cancel")}
              </button>
              <button
                className="btn btn-p"
                disabled={cfBulkLoading}
                data-testid="cf-bulk-verify-confirm"
                onClick={async () => {
                  const ok = await applyCfBulk({
                    action: "edit",
                    patch: { is_verified: pendingBulkVerify.value },
                  });
                  if (ok) setPendingBulkVerify(null);
                }}
              >
                {T("cf_bulk_apply")}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {bulkDeleteConfirm && (
        <Modal
          title={T("cf_bulk_delete_title")}
          onClose={() => setBulkDeleteConfirm(false)}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ fontSize: 14 }}>
              {T("cf_bulk_delete_summary")
                .replace("{count}", String(cfSelectedCount))
                .replace("{amount}", "")}
            </div>
            <div style={{ fontSize: 13, color: "var(--fg-soft)" }}>
              {T("action_cannot_be_undone")}
            </div>
            {cfBulkError && (
              <div style={{ color: "var(--danger)", fontSize: 12 }}>
                {cfBulkError}
              </div>
            )}
            <div className="row" style={{ justifyContent: "flex-end", gap: 8 }}>
              <button
                className="btn btn-g"
                onClick={() => setBulkDeleteConfirm(false)}
              >
                {T("btn_cancel")}
              </button>
              <button
                className="btn"
                disabled={cfBulkLoading}
                style={{
                  background: "var(--danger)",
                  color: "var(--btn-primary-fg)",
                  padding: "10px 18px",
                }}
                onClick={async () => {
                  const ok = await applyCfBulk({ action: "delete" });
                  if (ok) setBulkDeleteConfirm(false);
                }}
                data-testid="cf-bulk-delete-confirm"
              >
                {T("cf_bulk_confirm_delete")}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
