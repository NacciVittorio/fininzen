"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "../context/useApp";
import { API } from "../utils/api";
import { useFormatters } from "../utils/useFormatters";
import { PullToRefresh } from "../components/ui";
import type { CfItem } from "../components/cashflow/CfTransactionRow";
import CashflowViewToggle from "../components/cashflow/CashflowViewToggle";
import type { CashflowFeedItem, EntityId } from "../context/feedTypes";
import { getCurrentMonthDateRange } from "../context/feedDefaults";
import CashflowFeed from "./expenses/CashflowFeed";
import CashflowOverlays from "./expenses/CashflowOverlays";
import type { DeleteCfTarget } from "./expenses/CashflowDeleteConfirmModal";
import type { PendingBulkVerify } from "./expenses/bulkActions/cashflowBulkTypes";
import {
    countCashflowFilters,
    decorateDatedItems,
    getCashflowPeriod,
    getCashflowTotals,
} from "./transactionFeedModel";

export default function ExpensesView() {
    const router = useRouter();
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
        deleteCfSplitSettlement,
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
        accountingMonthDisplay,
        currentAccountingMonth,
        refreshAfter,
        transactionPrefs,
    } = useApp();

    const [deleteCfTarget, setDeleteCfTarget] = useState<DeleteCfTarget | null>(
        null,
    );
    // Transaction tapped open in the detail sheet; row whose swipe actions are revealed.
    const [detailItem, setDetailItem] = useState<CfItem | null>(null);
    const [swipedRowId, setSwipedRowId] = useState<EntityId | null>(null);
    // Period / Filtri bottom-sheet visibility. The month/year mode of the period
    // picker is not tracked here: PeriodFilterSection derives it from the active
    // range each time the sheet mounts.
    const [periodSheetOpen, setPeriodSheetOpen] = useState(false);
    const [filtersSheetOpen, setFiltersSheetOpen] = useState(false);
    const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
    // Single object: { value: bool } when a verify/unverify needs confirmation.
    const [pendingBulkVerify, setPendingBulkVerify] =
        useState<PendingBulkVerify | null>(null);
    // Above this many rows, verify/unverify requires explicit confirmation.
    // select-all-filtered always confirms (the user can't see every target row).
    const BULK_VERIFY_CONFIRM_THRESHOLD = 25;
    // Ephemeral toast shown when a click tries to add a row of a kind that
    // doesn't match the current locked selection kind. Observed via the tick
    // counter the context bumps — separate state keeps the message + timer
    // independent of other UI state.
    const [showKindMismatchToast, setShowKindMismatchToast] = useState(false);
    useEffect(() => {
        if (cfSelectionRejectionTick === 0) return;
        setShowKindMismatchToast(true);
        const t = setTimeout(() => setShowKindMismatchToast(false), 2400);
        return () => clearTimeout(t);
    }, [cfSelectionRejectionTick]);

    // Selection mode hides the mobile bottom nav (the bulk toolbar owns the
    // bottom edge); toggled via a body class consumed in tokens.css.
    useEffect(() => {
        if (typeof document === "undefined") return undefined;
        document.body.classList.toggle("cf-select-mode", cfSelectionMode);
        return () => document.body.classList.remove("cf-select-mode");
    }, [cfSelectionMode]);
    const [debouncedCfFilters, setDebouncedCfFilters] = useState(cfFilters);

    const [descSuggestions, setDescSuggestions] = useState<string[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [descTouched, setDescTouched] = useState(false);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(
        undefined,
    );
    const wasExpModalOpenRef = useRef(false);

    const fetchSuggestions = useCallback(
        async (categoryId: string, q: string) => {
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
        async (val: string) => {
            setExpForm((p) => ({ ...p, category: val }));
            if (!val || !transactionPrefs?.cashflow_autofill_last_account)
                return;
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
        [
            apiFetch,
            setExpForm,
            transactionPrefs?.cashflow_autofill_last_account,
        ],
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

    const totals = useMemo(
        () => getCashflowTotals(cfItems, cfSummary),
        [cfItems, cfSummary],
    );

    // ── Period control (MonthPager promoted to the header) ──
    // Derived from the active accounting-month range; the label opens a sheet
    // that exposes the year / "all" options. (periodSheetOpen / filtersSheetOpen
    // are declared with the other UI state above, ahead of the sync effect.)
    const period = useMemo(() => getCashflowPeriod(cfFilters), [cfFilters]);
    const periodMonth =
        (period.kind === "month" ? period.month : undefined) ||
        filterMonth ||
        new Date().getMonth() + 1;
    const periodYear =
        (period.kind !== "all" ? period.year : undefined) ||
        filterYear ||
        new Date().getFullYear();
    const periodLabel =
        period.kind === "all"
            ? T("time_all")
            : period.kind === "year"
              ? String(periodYear)
              : (MONTHS[
                    accountingMonthDisplay(periodYear, periodMonth).month - 1
                ] ?? "");
    const setAccountingMonth = useCallback(
        ({ month, year }: { month: number; year: number }) => {
            const { from, to } = accountingMonthDateRange(year, month);
            setCfFilters((p) => ({ ...p, date_from: from, date_to: to }));
        },
        [accountingMonthDateRange, setCfFilters],
    );
    // Boundary follows the accounting month (matching CashflowCategoryCard), not
    // the calendar month — otherwise on the current accounting period the arrow
    // would let the user page into a future period.
    const curAccounting = currentAccountingMonth();
    const disableForward =
        periodYear > curAccounting.year ||
        (periodYear === curAccounting.year &&
            periodMonth >= curAccounting.month);

    // Active-filter badge on the "Filtri" button. The period now lives in the
    // sheet as well as the header, so it counts — but only once it moves off the
    // current month (see isDefaultPeriod).
    const defaultPeriodRanges = useMemo(
        () => [
            accountingMonthDateRange(curAccounting.year, curAccounting.month),
            getCurrentMonthDateRange(),
        ],
        [accountingMonthDateRange, curAccounting.year, curAccounting.month],
    );
    const activeFilterCount = countCashflowFilters(
        cfFilters,
        defaultPeriodRanges,
    );

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

    // Day dividers carry the day's signed net. Transfers and adjustments move
    // money between accounts rather than in or out, so they count as zero.
    // "split" is a shared expense's net personal quota — real outcome money,
    // same convention as CfTransactionRow's isOutcome. "split_reimbursement"
    // stays neutral like transfer/adjustment: it's a settle-up, not a spend.
    const cfDecoratedItems = useMemo(
        () =>
            decorateDatedItems(cfItems, MONTHS, T, undefined, (row) => {
                const amount = Number.parseFloat(String(row.amount ?? 0)) || 0;
                if (row.type === "income") return amount;
                if (row.type === "outcome" || row.type === "split")
                    return -amount;
                return 0;
            }),
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

    const triggerBulkVerify = (value: boolean) => {
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
        await loadCfFeed(1);
        refreshAfter("expense_updated");
    }, [loadCfFeed, refreshAfter]);

    // Edit a cashflow item — opens the right editor per source_type. Shared by the
    // detail-sheet Edit button and the row right-swipe Edit action. For split
    // rows this is really "Apri in Split" (see CfDetailSheet/CfTransactionRow,
    // piano Batch 1): a shared expense's edit form and a settlement's own
    // group page both live in the Split tab, not here.
    const handleEditCfItem = (it: CfItem) => {
        setDetailItem(null);
        const item = it as CashflowFeedItem;
        if (item.source_type === "expense") {
            openExpenseModal({
                id: item.source_id,
                description: item.description,
                amount: item.amount,
                category: item.category?.id,
                date: item.date,
                linked_asset: item.account?.id,
                is_verified: item.is_verified,
            });
        } else if (item.source_type === "transfer") {
            openCfEditTransfer(item);
        } else if (item.source_type === "adjustment" && item.account) {
            const asset = assets.find((a) => a.id === item.account?.id);
            if (asset) openAdjustBalance(asset);
        } else if (item.source_type === "split_expense") {
            router.push(`/split?openExpense=${item.source_id}`);
        } else if (
            item.source_type === "split_settlement" &&
            item.group_id != null
        ) {
            router.push(`/split?openSettlement=${item.source_id}`);
        }
    };

    return (
        <>
            <PullToRefresh
                onRefresh={handlePullRefresh}
                disabled={cfSelectionMode}
            >
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
                    viewToggle={
                        <CashflowViewToggle
                            cfFilters={cfFilters}
                            setCfFilters={setCfFilters}
                        />
                    }
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
                    toggleCfItemSelected={
                        toggleCfItemSelected as (
                            id: EntityId,
                            type?: string,
                        ) => void
                    }
                    setDetailItem={setDetailItem}
                    handleEditCfItem={handleEditCfItem}
                    setCfItemVerified={
                        setCfItemVerified as unknown as (
                            item: CfItem,
                            verified: boolean,
                        ) => void
                    }
                    setDeleteCfTarget={
                        setDeleteCfTarget as unknown as (target: {
                            item: CfItem;
                        }) => void
                    }
                    cfHasMore={cfHasMore}
                    loadMoreCf={loadMoreCf}
                    loadAllCf={loadAllCf}
                    onAdd={() => openExpenseModal()}
                />
            </PullToRefresh>

            <CashflowOverlays
                T={T}
                formatEur={formatEur}
                deleteCfTarget={deleteCfTarget}
                setDeleteCfTarget={setDeleteCfTarget}
                deleteCfExpense={
                    deleteCfExpense as (sourceId?: EntityId) => Promise<unknown>
                }
                deleteCfTx={deleteCfTx}
                deleteCfSplitSettlement={deleteCfSplitSettlement}
                showExpModal={showExpModal}
                closeExpenseModal={closeExpenseModal}
                expModalTitle={expModalTitle}
                modalDir={modalDir}
                setModalDir={setModalDir as (dir: string) => void}
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
                setCfItemVerified={
                    setCfItemVerified as unknown as (
                        item: CfItem,
                        verified: boolean,
                    ) => void
                }
                periodSheetOpen={periodSheetOpen}
                setPeriodSheetOpen={setPeriodSheetOpen}
                cfFilters={cfFilters}
                setCfFilters={setCfFilters}
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
