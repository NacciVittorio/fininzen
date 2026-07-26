"use client";

import { BottomSheet, SheetTitle } from "../../components/ui";
import type { DecimalSeparator } from "../../utils/formatters";
import type { Asset } from "../../api/types";
import type { Translator } from "../../types";
import type { AddTransactionForm as AddTransactionFormState } from "./portfolioViewModel";
import type { estimateSellTax } from "./portfolioCalculations";
import type {
    AccountOption,
    AddTxPriceStatus,
    GetAvailableContributionSources,
    SetAddTxAssetId,
    SetAddTxForm,
    SetTouched,
} from "./addTransaction/addTransactionTypes";
import AddTransactionForm from "./addTransaction/AddTransactionForm";
import TransactionAssetPicker from "./addTransaction/TransactionAssetPicker";

export default function AddTransactionSheet({
    addModalOpen,
    closeAddModal,
    editingAddTxId,
    addTxAssetId,
    setAddTxAssetId,
    addTxForm,
    setAddTxForm,
    addTxError,
    addTxLoading,
    setAddTxPriceTouched,
    setAddTxTaxTouched,
    addTxPriceStatus,
    editingAddTxItem,
    investments,
    bankAccounts,
    getAvailableContributionSources,
    handleAddTxSubmit,
    T,
    decimalSeparator,
    formatEur,
}: {
    addModalOpen: boolean;
    closeAddModal: () => void;
    editingAddTxId?: Parameters<typeof estimateSellTax>[2];
    addTxAssetId: string;
    setAddTxAssetId: SetAddTxAssetId;
    addTxForm: AddTransactionFormState;
    setAddTxForm: SetAddTxForm;
    addTxError?: string | null;
    addTxLoading: boolean;
    setAddTxPriceTouched: SetTouched;
    setAddTxTaxTouched: SetTouched;
    addTxPriceStatus?: AddTxPriceStatus;
    editingAddTxItem?: Parameters<typeof estimateSellTax>[3];
    investments: readonly Asset[];
    bankAccounts: readonly AccountOption[];
    getAvailableContributionSources: GetAvailableContributionSources;
    handleAddTxSubmit: () => void;
    T: Translator;
    decimalSeparator: DecimalSeparator;
    formatEur: (value: number) => string;
}) {
    const title = editingAddTxId
        ? T("modal_edit_tx")
        : T("add_modal_mode_transaction");

    return (
        <BottomSheet
            open={addModalOpen}
            onClose={closeAddModal}
            ariaLabel={title}
            panelClassName="bottom-sheet__panel--wide"
            header={
                addModalOpen ? (
                    <SheetTitle style={{ margin: 0, padding: "2px" }}>
                        {title}
                    </SheetTitle>
                ) : null
            }
            footer={
                // Pinned so the error and the actions stay reachable without
                // scrolling the whole form — the error only ever appears on
                // submit, which is exactly when it must be visible.
                addModalOpen && addTxAssetId ? (
                    <div
                        style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 10,
                        }}
                    >
                        {addTxError && (
                            <div
                                data-testid="addtx-error"
                                style={{
                                    fontSize: 12,
                                    color: "var(--danger)",
                                    background: "var(--danger-soft)",
                                    border: "1px solid var(--danger-ring)",
                                    borderRadius: 8,
                                    padding: "8px 10px",
                                }}
                            >
                                {addTxError}
                            </div>
                        )}
                        <div
                            className="row"
                            style={{ justifyContent: "flex-end", gap: 8 }}
                        >
                            <button
                                type="button"
                                className="btn btn-g"
                                onClick={closeAddModal}
                            >
                                {T("btn_cancel")}
                            </button>
                            {/* Only gated on the in-flight request: a missing
                                field must produce a message, not an inert
                                button the user can't diagnose. */}
                            <button
                                type="button"
                                className="btn btn-p"
                                data-testid="addtx-submit"
                                disabled={addTxLoading}
                                onClick={handleAddTxSubmit}
                            >
                                {addTxLoading
                                    ? "..."
                                    : editingAddTxId
                                      ? T("btn_update")
                                      : T("btn_save")}
                            </button>
                        </div>
                    </div>
                ) : null
            }
        >
            {addModalOpen && (
                <div style={{ padding: "12px 18px 8px" }}>
                    {!addTxAssetId ? (
                        <TransactionAssetPicker
                            addTxAssetId={addTxAssetId}
                            setAddTxAssetId={setAddTxAssetId}
                            setAddTxForm={setAddTxForm}
                            setAddTxPriceTouched={setAddTxPriceTouched}
                            investments={investments}
                            T={T}
                        />
                    ) : (
                        <AddTransactionForm
                            addTxAssetId={addTxAssetId}
                            setAddTxAssetId={setAddTxAssetId}
                            addTxForm={addTxForm}
                            setAddTxForm={setAddTxForm}
                            setAddTxPriceTouched={setAddTxPriceTouched}
                            setAddTxTaxTouched={setAddTxTaxTouched}
                            addTxPriceStatus={addTxPriceStatus}
                            editingAddTxId={editingAddTxId}
                            editingAddTxItem={editingAddTxItem}
                            investments={investments}
                            bankAccounts={bankAccounts}
                            getAvailableContributionSources={
                                getAvailableContributionSources
                            }
                            T={T}
                            decimalSeparator={decimalSeparator}
                            formatEur={formatEur}
                        />
                    )}
                </div>
            )}
        </BottomSheet>
    );
}
