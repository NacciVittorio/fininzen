import { BottomSheet } from "../../components/ui";
import IncomeOutcomeMovementForm from "./movementSheet/IncomeOutcomeMovementForm";
import MovementTypeTabs from "./movementSheet/MovementTypeTabs";
import TransferMovementForm from "./movementSheet/TransferMovementForm";

export default function ExpenseMovementSheet({
  showExpModal,
  closeExpenseModal,
  expModalTitle,
  modalDir,
  setModalDir,
  expForm,
  setExpForm,
  expError,
  setExpError,
  transferForm,
  setTransferForm,
  transferError,
  setTransferError,
  transferWarning,
  transferLoading,
  submitTransferInCfModal,
  submitExpense,
  editingExpenseId,
  bankAccounts,
  assets,
  categories,
  handleExpenseCategoryChange,
  descSuggestions,
  showSuggestions,
  setShowSuggestions,
  setDescTouched,
  T,
  decimalSeparator,
}) {
  if (!showExpModal) return null;

  return (
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
          <MovementTypeTabs
            modalDir={modalDir}
            setModalDir={setModalDir}
            setExpForm={setExpForm}
            setTransferForm={setTransferForm}
            T={T}
          />
          {modalDir === "transfer" ? (
            <TransferMovementForm
              transferForm={transferForm}
              setTransferForm={setTransferForm}
              setTransferError={setTransferError}
              transferWarning={transferWarning}
              transferError={transferError}
              bankAccounts={bankAccounts}
              T={T}
              decimalSeparator={decimalSeparator}
            />
          ) : (
            <IncomeOutcomeMovementForm
              expForm={expForm}
              setExpForm={setExpForm}
              expError={expError}
              setExpError={setExpError}
              modalDir={modalDir}
              assets={assets}
              categories={categories}
              handleExpenseCategoryChange={handleExpenseCategoryChange}
              descSuggestions={descSuggestions}
              showSuggestions={showSuggestions}
              setShowSuggestions={setShowSuggestions}
              setDescTouched={setDescTouched}
              T={T}
              decimalSeparator={decimalSeparator}
            />
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
  );
}
