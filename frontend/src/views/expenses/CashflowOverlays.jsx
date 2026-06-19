import CfDetailSheet from "../../components/cashflow/CfDetailSheet";
import CfFiltersSheet from "../../components/cashflow/CfFiltersSheet";
import { Fab } from "../../components/ui";
import CashflowBulkActions from "./CashflowBulkActions";
import CashflowDeleteConfirmModal from "./CashflowDeleteConfirmModal";
import CashflowEditTransferSheet from "./CashflowEditTransferSheet";
import CashflowPeriodSheet from "./CashflowPeriodSheet";
import ExpenseMovementSheet from "./ExpenseMovementSheet";

export default function CashflowOverlays(props) {
  const {
    T,
    formatEur,
    deleteCfTarget,
    setDeleteCfTarget,
    deleteCfExpense,
    deleteCfTx,
    detailItem,
    setDetailItem,
    handleEditCfItem,
    setCfItemVerified,
    filtersSheetOpen,
    setFiltersSheetOpen,
    periodSheetOpen,
    setPeriodSheetOpen,
    periodMonth,
    periodYear,
    cfPeriodMode,
    setCfPeriodMode,
    setAccountingMonth,
    accountingMonthDateRange,
    cfFilters,
    setCfFilters,
    hasActiveOverlay,
    openExpenseModal,
  } = props;

  return (
    <>
      <CashflowDeleteConfirmModal
        deleteCfTarget={deleteCfTarget}
        setDeleteCfTarget={setDeleteCfTarget}
        deleteCfExpense={deleteCfExpense}
        deleteCfTx={deleteCfTx}
        T={T}
        formatEur={formatEur}
      />
      <ExpenseMovementSheet {...props} />
      <CashflowEditTransferSheet {...props} />
      <CfFiltersSheet
        open={filtersSheetOpen}
        onClose={() => setFiltersSheetOpen(false)}
      />
      <CfDetailSheet
        item={detailItem}
        open={!!detailItem}
        onClose={() => setDetailItem(null)}
        onEdit={handleEditCfItem}
        onDelete={(item) => {
          setDetailItem(null);
          setDeleteCfTarget({ item });
        }}
        onVerifyToggle={(item) => {
          setCfItemVerified(item, !item.is_verified);
          setDetailItem((current) =>
            current?.id === item.id
              ? { ...current, is_verified: !item.is_verified }
              : current,
          );
        }}
      />
      <CashflowPeriodSheet
        periodSheetOpen={periodSheetOpen}
        setPeriodSheetOpen={setPeriodSheetOpen}
        T={T}
        cfFilters={cfFilters}
        setCfFilters={setCfFilters}
        periodMonth={periodMonth}
        periodYear={periodYear}
        cfPeriodMode={cfPeriodMode}
        setCfPeriodMode={setCfPeriodMode}
        setAccountingMonth={setAccountingMonth}
        accountingMonthDateRange={accountingMonthDateRange}
      />
      <Fab
        testId="expenses-add-fab"
        label={T("fab_add_transaction")}
        onClick={() => openExpenseModal()}
        hidden={hasActiveOverlay}
      />
      <CashflowBulkActions {...props} />
    </>
  );
}
