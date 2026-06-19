import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../context/useApp";
import { API } from "../utils/api";
import { useFormatters } from "../utils/useFormatters";
import { PullToRefresh } from "../components/ui";
import CashflowFeed from "./expenses/CashflowFeed";
import CashflowOverlays from "./expenses/CashflowOverlays";
import {
  countCashflowFilters,
  decorateDatedItems,
  getCashflowPeriod,
  getCashflowTotals,
} from "./transactionFeedModel";

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
    applyCfBulk,
    setCfItemVerified,
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

  const totals = useMemo(
    () => getCashflowTotals(cfItems, cfSummary),
    [cfItems, cfSummary],
  );

  // ── Period control (MonthPager promoted to the header) ──
  // Derived from the active accounting-month range; the label opens a sheet
  // that exposes the year / "all" options. (periodSheetOpen / filtersSheetOpen
  // are declared with the other UI state above, ahead of the sync effect.)
  const period = useMemo(() => getCashflowPeriod(cfFilters), [cfFilters]);
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
  const activeFilterCount = countCashflowFilters(cfFilters);

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

  const cfDecoratedItems = useMemo(
    () => decorateDatedItems(cfItems, MONTHS, T),
    [cfItems, MONTHS, T],
  );

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
    !!pendingBulkVerify;

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
      <PullToRefresh onRefresh={handlePullRefresh} disabled={cfSelectionMode}>
        <CashflowFeed
          T={T}
          period={period}
          periodMonth={periodMonth}
          periodYear={periodYear}
          periodLabel={periodLabel}
          disableForward={disableForward}
          setAccountingMonth={setAccountingMonth}
          setPeriodSheetOpen={setPeriodSheetOpen}
          totals={totals}
          cfFilters={cfFilters}
          setCfFilters={setCfFilters}
          activeFilterCount={activeFilterCount}
          setFiltersSheetOpen={setFiltersSheetOpen}
          cfSelectionMode={cfSelectionMode}
          enterCfSelectionMode={enterCfSelectionMode}
          unverifiedCount={unverifiedCount}
          cfItems={cfItems}
          cfTotalCount={cfTotalCount}
          cfSelectedCount={cfSelectedCount}
          cfSelectAllFiltered={cfSelectAllFiltered}
          exitCfSelectionMode={exitCfSelectionMode}
          selectAllFilteredCf={selectAllFilteredCf}
          selectVisibleCf={selectVisibleCf}
          clearCfSelection={clearCfSelection}
          cfLoading={cfLoading}
          decoratedItems={cfDecoratedItems}
          isCfItemSelected={isCfItemSelected}
          swipedRowId={swipedRowId}
          setSwipedRowId={setSwipedRowId}
          toggleCfItemSelected={toggleCfItemSelected}
          setDetailItem={setDetailItem}
          handleEditCfItem={handleEditCfItem}
          setCfItemVerified={setCfItemVerified}
          setDeleteCfTarget={setDeleteCfTarget}
          cfHasMore={cfHasMore}
          loadMoreCf={loadMoreCf}
          loadAllCf={loadAllCf}
        />
      </PullToRefresh>

      <CashflowOverlays
        T={T}
        formatEur={formatEur}
        deleteCfTarget={deleteCfTarget}
        setDeleteCfTarget={setDeleteCfTarget}
        deleteCfExpense={deleteCfExpense}
        deleteCfTx={deleteCfTx}
        showExpModal={showExpModal}
        closeExpenseModal={closeExpenseModal}
        expModalTitle={expModalTitle}
        modalDir={modalDir}
        setModalDir={setModalDir}
        expForm={expForm}
        setExpForm={setExpForm}
        expError={expError}
        setExpError={setExpError}
        transferForm={transferForm}
        setTransferForm={setTransferForm}
        transferError={transferError}
        setTransferError={setTransferError}
        transferWarning={transferWarning}
        transferLoading={transferLoading}
        submitTransferInCfModal={submitTransferInCfModal}
        submitExpense={submitExpense}
        editingExpenseId={editingExpenseId}
        bankAccounts={bankAccounts}
        assets={assets}
        categories={categories}
        handleExpenseCategoryChange={handleExpenseCategoryChange}
        descSuggestions={descSuggestions}
        showSuggestions={showSuggestions}
        setShowSuggestions={setShowSuggestions}
        setDescTouched={setDescTouched}
        decimalSeparator={decimalSeparator}
        cfEditTransferItem={cfEditTransferItem}
        cfEditTransferForm={cfEditTransferForm}
        setCfEditTransferForm={setCfEditTransferForm}
        cfEditTransferError={cfEditTransferError}
        cfEditTransferLoading={cfEditTransferLoading}
        closeCfEditTransfer={closeCfEditTransfer}
        submitCfEditTransfer={submitCfEditTransfer}
        filtersSheetOpen={filtersSheetOpen}
        setFiltersSheetOpen={setFiltersSheetOpen}
        detailItem={detailItem}
        setDetailItem={setDetailItem}
        handleEditCfItem={handleEditCfItem}
        setCfItemVerified={setCfItemVerified}
        periodSheetOpen={periodSheetOpen}
        setPeriodSheetOpen={setPeriodSheetOpen}
        cfFilters={cfFilters}
        setCfFilters={setCfFilters}
        periodMonth={periodMonth}
        periodYear={periodYear}
        cfPeriodMode={cfPeriodMode}
        setCfPeriodMode={setCfPeriodMode}
        setAccountingMonth={setAccountingMonth}
        accountingMonthDateRange={accountingMonthDateRange}
        hasActiveOverlay={hasActiveOverlay}
        openExpenseModal={openExpenseModal}
        showKindMismatchToast={showKindMismatchToast}
        cfSelectionMode={cfSelectionMode}
        cfSelectedCount={cfSelectedCount}
        cfBulkLoading={cfBulkLoading}
        cfBulkError={cfBulkError}
        cfBulkEditOpen={cfBulkEditOpen}
        setCfBulkEditOpen={setCfBulkEditOpen}
        cfSelectionKind={cfSelectionKind}
        cfSelectAllFiltered={cfSelectAllFiltered}
        bulkActionsAllowed={bulkActionsAllowed}
        pendingBulkVerify={pendingBulkVerify}
        setPendingBulkVerify={setPendingBulkVerify}
        bulkDeleteConfirm={bulkDeleteConfirm}
        setBulkDeleteConfirm={setBulkDeleteConfirm}
        triggerBulkVerify={triggerBulkVerify}
        clearCfSelection={clearCfSelection}
        exitCfSelectionMode={exitCfSelectionMode}
        applyCfBulk={applyCfBulk}
      />
    </>
  );
}
