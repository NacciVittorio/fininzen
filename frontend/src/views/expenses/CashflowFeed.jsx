import CfSummaryCard from "../../components/cashflow/CfSummaryCard";
import CfTransactionRow from "../../components/cashflow/CfTransactionRow";
import { Icon, MonthPager, PageHeader } from "../../components/ui";
import {
  CashflowFeedControls,
  CashflowSelectionBanner,
  UnverifiedCashflowBanner,
} from "./CashflowFeedControls";

const ALL_CF_TYPES = ["income", "outcome", "transfer", "adjustment"];

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
}) {
  return (
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
              className="btn btn-g btn-sm"
            >
              {period.kind === "all" ? T("time_all") : String(periodYear)}
              <Icon name="chevronDown" size={12} />
            </button>
          )
        }
      />

      <CfSummaryCard
        monthLabel={periodLabel}
        net={totals.net}
        income={totals.income}
        outcome={totals.outcome}
        activeType={cfFilters.types.length === 1 ? cfFilters.types[0] : null}
        onToggleType={(type) =>
          setCfFilters((current) => ({
            ...current,
            types:
              current.types.length === 1 && current.types[0] === type
                ? ALL_CF_TYPES
                : [type],
          }))
        }
      />

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

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        {cfLoading && cfItems.length === 0 && <EmptyFeed>…</EmptyFeed>}
        {!cfLoading && cfItems.length === 0 && (
          <EmptyFeed>{T("cf_no_results")}</EmptyFeed>
        )}
        {decoratedItems.map((entry) => {
          const { item } = entry;
          return (
            <div key={item.id}>
              {entry.showMonthDivider && (
                <div className="tx-month-divider">{entry.monthLabel}</div>
              )}
              {entry.showDayDivider && (
                <div className="tx-day-divider">{entry.dayLabel}</div>
              )}
              <CfTransactionRow
                item={item}
                selectionMode={cfSelectionMode}
                selected={cfSelectionMode && isCfItemSelected(item.id)}
                swipeOpen={swipedRowId === item.id}
                onRequestSwipeOpen={setSwipedRowId}
                onToggleSelect={(row) => toggleCfItemSelected(row.id, row.type)}
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
                onDelete={(row) => setDeleteCfTarget({ item: row })}
                canVerify={item.source_type !== "adjustment"}
              />
            </div>
          );
        })}
      </div>
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
  );
}

function EmptyFeed({ children }) {
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
