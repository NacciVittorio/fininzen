"use client";

import type { Dispatch, ReactNode, SetStateAction } from "react";
import CfSummaryCard from "../../components/cashflow/CfSummaryCard";
import CfTransactionRow from "../../components/cashflow/CfTransactionRow";
import type { CfItem } from "../../components/cashflow/CfTransactionRow";
import { Icon, MonthPager, PageHeader } from "../../components/ui";
import { useFormatters } from "../../utils/useFormatters";
import type { Translator } from "../../types";
import type { CashflowFilters } from "../../context/feedDefaults";
import type {
    CashflowFeedItem,
    CashflowItemType,
    EntityId,
} from "../../context/feedTypes";
import type {
    CashflowPeriod,
    DecoratedDatedItem,
} from "../transactionFeedModel";
import {
    CashflowFeedControls,
    CashflowSelectionBanner,
    UnverifiedCashflowBanner,
} from "./CashflowFeedControls";

const ALL_CF_TYPES: CashflowItemType[] = [
    "income",
    "outcome",
    "transfer",
    "adjustment",
];

export default function CashflowFeed({
    T,
    period,
    periodMonth,
    periodYear,
    periodLabel,
    disableForward,
    setAccountingMonth,
    setPeriodSheetOpen,
    totals,
    cfFilters,
    setCfFilters,
    activeFilterCount,
    setFiltersSheetOpen,
    viewToggle,
    cfSelectionMode,
    enterCfSelectionMode,
    unverifiedCount,
    cfItems,
    cfTotalCount,
    cfSelectedCount,
    cfSelectAllFiltered,
    exitCfSelectionMode,
    selectAllFilteredCf,
    selectVisibleCf,
    clearCfSelection,
    cfLoading,
    decoratedItems,
    isCfItemSelected,
    swipedRowId,
    setSwipedRowId,
    toggleCfItemSelected,
    setDetailItem,
    handleEditCfItem,
    setCfItemVerified,
    setDeleteCfTarget,
    cfHasMore,
    loadMoreCf,
    loadAllCf,
    onAdd,
}: {
    T: Translator;
    period: CashflowPeriod;
    periodMonth: number;
    periodYear: number;
    periodLabel: string;
    disableForward: boolean;
    setAccountingMonth: (value: { month: number; year: number }) => void;
    setPeriodSheetOpen: (value: boolean) => void;
    totals: { net: number; income: number; outcome: number };
    cfFilters: CashflowFilters;
    setCfFilters: Dispatch<SetStateAction<CashflowFilters>>;
    activeFilterCount: number;
    setFiltersSheetOpen: (value: boolean) => void;
    // Built by the caller (ExpensesView) — the "Personale | Condivise |
    // Tutte" preset toggle (piano B6 Fase 1), rendered here next to the
    // existing filter controls since it drives the same cfFilters.types.
    viewToggle?: ReactNode;
    cfSelectionMode: boolean;
    enterCfSelectionMode: () => void;
    unverifiedCount: number;
    cfItems: readonly CashflowFeedItem[];
    cfTotalCount: number;
    cfSelectedCount: number;
    cfSelectAllFiltered: boolean;
    exitCfSelectionMode: () => void;
    selectAllFilteredCf: () => void;
    selectVisibleCf: () => void;
    clearCfSelection: () => void;
    cfLoading: boolean;
    decoratedItems: readonly DecoratedDatedItem<CashflowFeedItem>[];
    isCfItemSelected: (id: EntityId) => boolean;
    swipedRowId: EntityId | null;
    setSwipedRowId: (id: EntityId | null) => void;
    toggleCfItemSelected: (id: EntityId, type?: string) => void;
    setDetailItem: (item: CfItem) => void;
    handleEditCfItem: (item: CfItem) => void;
    setCfItemVerified: (item: CfItem, verified: boolean) => void;
    setDeleteCfTarget: (target: { item: CfItem }) => void;
    cfHasMore: boolean;
    loadMoreCf: () => void;
    loadAllCf: () => void;
    onAdd: () => void;
}) {
    const { formatEur } = useFormatters();

    // The period control now sits at the top of the summary card, above the
    // numbers it governs. The month-vs-year branch stays here so the card can
    // remain presentational.
    const pager =
        period.kind === "month" ? (
            <MonthPager
                month={periodMonth}
                year={periodYear}
                onChange={setAccountingMonth}
                onLabelClick={() => setPeriodSheetOpen(true)}
                disableForward={disableForward}
                size="hero"
                align="between"
                labelMode="accounting"
            />
        ) : (
            <button
                type="button"
                data-testid="cf-period-button"
                onClick={() => setPeriodSheetOpen(true)}
                className="btn btn-g btn-sm"
            >
                {period.kind === "all" ? T("time_all") : String(periodYear)}
                <Icon name="chevronDown" size={12} />
            </button>
        );

    return (
        <div className="cf-layout">
            <div className="cf-layout__header">
                <PageHeader title={T("tab_cashflow")} />
            </div>

            <aside className="cf-layout__rail">
                <CfSummaryCard
                    pager={pager}
                    monthLabel={periodLabel}
                    net={totals.net}
                    income={totals.income}
                    outcome={totals.outcome}
                    activeType={
                        cfFilters.types.length === 1 ? cfFilters.types[0] : null
                    }
                    onToggleType={(type) =>
                        setCfFilters((current) => ({
                            ...current,
                            types:
                                current.types.length === 1 &&
                                current.types[0] === type
                                    ? ALL_CF_TYPES
                                    : [type as CashflowItemType],
                        }))
                    }
                />

                <button
                    type="button"
                    className="desktop-only"
                    onClick={onAdd}
                    style={{
                        width: "100%",
                        boxSizing: "border-box",
                        background: "var(--btn-primary-bg)",
                        color: "var(--btn-primary-fg)",
                        border: 0,
                        borderRadius: 12,
                        fontSize: 15,
                        fontWeight: 600,
                        minHeight: 46,
                        padding: "12px 20px",
                        cursor: "pointer",
                        fontFamily: "inherit",
                        marginBottom: 14,
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 8,
                    }}
                >
                    + {T("fab_add_transaction")}
                </button>

                {!cfSelectionMode &&
                    unverifiedCount > 0 &&
                    cfFilters.verified !== false && (
                        <UnverifiedCashflowBanner
                            T={T}
                            unverifiedCount={unverifiedCount}
                            setCfFilters={setCfFilters}
                        />
                    )}
                {cfSelectionMode && cfItems.length > 0 && (
                    <CashflowSelectionBanner
                        T={T}
                        cfItems={cfItems}
                        cfTotalCount={cfTotalCount}
                        cfFilters={cfFilters}
                        cfSelectedCount={cfSelectedCount}
                        cfSelectAllFiltered={cfSelectAllFiltered}
                        exitCfSelectionMode={exitCfSelectionMode}
                        selectAllFilteredCf={selectAllFilteredCf}
                        selectVisibleCf={selectVisibleCf}
                        clearCfSelection={clearCfSelection}
                    />
                )}
            </aside>

            <div className="cf-layout__main">
                {!cfSelectionMode && viewToggle}
                {!cfSelectionMode && (
                    <CashflowFeedControls
                        T={T}
                        cfFilters={cfFilters}
                        setCfFilters={setCfFilters}
                        activeFilterCount={activeFilterCount}
                        setFiltersSheetOpen={setFiltersSheetOpen}
                        enterCfSelectionMode={enterCfSelectionMode}
                    />
                )}
                <div
                    className="card"
                    style={{ padding: 0, overflow: "hidden" }}
                >
                    {cfLoading && cfItems.length === 0 && (
                        <EmptyFeed>…</EmptyFeed>
                    )}
                    {!cfLoading && cfItems.length === 0 && (
                        <EmptyFeed>{T("cf_no_results")}</EmptyFeed>
                    )}
                    {decoratedItems.map((entry) => {
                        const { item } = entry;
                        return (
                            <div key={item.id}>
                                {/* Dividers are indented to the row gutter,
                                    which the taller rows widened to 18px. The
                                    shared class keeps the Portfolio feed's own
                                    spacing. */}
                                {entry.showMonthDivider && (
                                    <div
                                        className="tx-month-divider"
                                        style={{ padding: "18px 18px 0" }}
                                    >
                                        {entry.monthLabel}
                                    </div>
                                )}
                                {entry.showDayDivider && (
                                    <div
                                        className="tx-day-divider"
                                        style={{
                                            display: "flex",
                                            alignItems: "baseline",
                                            justifyContent: "space-between",
                                            gap: 8,
                                            padding: "16px 18px 6px",
                                        }}
                                    >
                                        <span>{entry.dayLabel}</span>
                                        {entry.dayNet !== undefined && (
                                            <span
                                                style={{
                                                    fontVariantNumeric:
                                                        "tabular-nums",
                                                }}
                                            >
                                                {entry.dayNet >= 0 ? "+" : "-"}
                                                {formatEur(
                                                    Math.abs(entry.dayNet),
                                                )}
                                            </span>
                                        )}
                                    </div>
                                )}
                                <CfTransactionRow
                                    item={item}
                                    selectionMode={cfSelectionMode}
                                    selected={
                                        cfSelectionMode &&
                                        isCfItemSelected(item.id)
                                    }
                                    swipeOpen={swipedRowId === item.id}
                                    onRequestSwipeOpen={setSwipedRowId}
                                    onToggleSelect={(row) =>
                                        toggleCfItemSelected(row.id, row.type)
                                    }
                                    onOpenDetail={(row) => {
                                        setSwipedRowId(null);
                                        setDetailItem(row);
                                    }}
                                    onEdit={(row) => {
                                        setSwipedRowId(null);
                                        handleEditCfItem(row);
                                    }}
                                    onVerifyToggle={(row) =>
                                        setCfItemVerified(row, !row.is_verified)
                                    }
                                    onDelete={(row) =>
                                        setDeleteCfTarget({ item: row })
                                    }
                                    // Split rows are always is_verified=True from
                                    // creation (no "pending" concept in the Split
                                    // domain, see splitting/signals.py) and the
                                    // bulk endpoint's _parse_feed_id doesn't
                                    // recognize split_*/split_reimbursement_* ids
                                    // anyway (expenses/bulk.py) — hide the toggle
                                    // rather than wire it to a dead endpoint.
                                    canVerify={
                                        item.source_type !== "adjustment" &&
                                        item.source_type !== "split_expense" &&
                                        item.source_type !== "split_settlement"
                                    }
                                />
                            </div>
                        );
                    })}
                </div>
                {(cfHasMore || cfLoading) && (
                    <div
                        className="row"
                        style={{
                            gap: 8,
                            marginTop: 10,
                            justifyContent: "center",
                        }}
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
        </div>
    );
}

function EmptyFeed({ children }: { children?: ReactNode }) {
    return (
        <div
            style={{
                textAlign: "center",
                color: "var(--fg-soft)",
                padding: "32px 0",
                fontSize: 13,
            }}
        >
            {children}
        </div>
    );
}
