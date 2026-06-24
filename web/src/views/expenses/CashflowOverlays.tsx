"use client";

import type { ComponentProps, Dispatch, SetStateAction } from "react";
import CfDetailSheet from "../../components/cashflow/CfDetailSheet";
import CfFiltersSheet from "../../components/cashflow/CfFiltersSheet";
import type { CfItem } from "../../components/cashflow/CfTransactionRow";
import type { CashflowFeedItem } from "../../context/feedTypes";
import { Fab } from "../../components/ui";
import CashflowBulkActions from "./CashflowBulkActions";
import CashflowDeleteConfirmModal from "./CashflowDeleteConfirmModal";
import CashflowEditTransferSheet from "./CashflowEditTransferSheet";
import CashflowPeriodSheet from "./CashflowPeriodSheet";
import ExpenseMovementSheet from "./ExpenseMovementSheet";

// Pass-through composite: forwards one props bag to the cashflow sheets. Typed
// as the intersection of the children it spreads into plus the fields it reads
// directly for the explicitly-wired sheets (detail/filters/period/delete).
type CashflowOverlaysProps = ComponentProps<typeof ExpenseMovementSheet> &
    ComponentProps<typeof CashflowEditTransferSheet> &
    ComponentProps<typeof CashflowBulkActions> &
    ComponentProps<typeof CashflowDeleteConfirmModal> &
    ComponentProps<typeof CashflowPeriodSheet> & {
        detailItem: CfItem | null;
        setDetailItem: Dispatch<SetStateAction<CfItem | null>>;
        handleEditCfItem: (item: CfItem) => void;
        setCfItemVerified: (item: CfItem, verified: boolean) => void;
        filtersSheetOpen: boolean;
        setFiltersSheetOpen: (value: boolean) => void;
        hasActiveOverlay: boolean;
        openExpenseModal: () => void;
    };

export default function CashflowOverlays(props: CashflowOverlaysProps) {
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
                onDelete={(item: CfItem) => {
                    setDetailItem(null);
                    setDeleteCfTarget({ item: item as CashflowFeedItem });
                }}
                onVerifyToggle={(item: CfItem) => {
                    setCfItemVerified(item, !item.is_verified);
                    setDetailItem((current) =>
                        current && current.id === item.id
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
