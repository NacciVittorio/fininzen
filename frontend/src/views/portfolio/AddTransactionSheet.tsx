import { BottomSheet, SheetTitle } from "../../components/ui";
import type { DecimalSeparator } from "../../utils/formatters";
import type { Asset } from "../../api/types";
import type { Translator } from "../../types";
import type { AddTransactionForm as AddTransactionFormState } from "./portfolioViewModel";
import type { estimateSellTax } from "./portfolioCalculations";
import type {
    AccountOption,
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
    editingAddTxItem?: Parameters<typeof estimateSellTax>[3];
    investments: readonly Asset[];
    bankAccounts: readonly AccountOption[];
    getAvailableContributionSources: GetAvailableContributionSources;
    handleAddTxSubmit: () => void;
    T: Translator;
    decimalSeparator: DecimalSeparator;
    formatEur: (value: number) => string;
}) {
    return (
        <BottomSheet
            open={addModalOpen}
            onClose={closeAddModal}
            ariaLabel={
                editingAddTxId
                    ? T("modal_edit_tx")
                    : T("add_modal_mode_transaction")
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
                            {addTxLoading ? "..." : T("btn_save")}
                        </button>
                    )}
                </div>
            )}
        </BottomSheet>
    );
}
