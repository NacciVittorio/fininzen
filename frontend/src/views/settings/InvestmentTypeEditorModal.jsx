import Modal from "../../components/Modal";

export function InvestmentTypeEditorModal({
  T,
  showInvTypeModal,
  editingInvTypeId,
  invTypeContext,
  closeInvTypeModal,
  invTypeForm,
  setInvTypeForm,
  invTypeError,
  setInvTypeError,
  addInvestmentType,
}) {
  return (
    <>
      {showInvTypeModal && (
        <Modal
          title={
            editingInvTypeId
              ? invTypeContext === "account_types"
                ? T("modal_edit_account_type")
                : T("modal_edit_inv_type")
              : invTypeContext === "account_types"
                ? T("modal_add_account_type")
                : T("modal_add_inv_type")
          }
          onClose={closeInvTypeModal}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            <input
              className="inp"
              placeholder={T("placeholder_inv_type_name")}
              value={invTypeForm.name}
              onChange={(e) => {
                setInvTypeForm((p) => ({
                  ...p,
                  name: e.target.value,
                }));
                setInvTypeError("");
              }}
              style={{
                borderColor: invTypeError ? "var(--danger)" : undefined,
              }}
              autoFocus
            />
            {invTypeError && (
              <div
                style={{
                  fontSize: 12,
                  color: "var(--danger)",
                  marginTop: -6,
                }}
              >
                {invTypeError}
              </div>
            )}
            <div className="row">
              <input
                className="inp"
                placeholder={T("placeholder_icon")}
                value={invTypeForm.icon}
                onChange={(e) =>
                  setInvTypeForm((p) => ({
                    ...p,
                    icon: e.target.value,
                  }))
                }
              />
              <input
                type="color"
                value={invTypeForm.color}
                onChange={(e) =>
                  setInvTypeForm((p) => ({
                    ...p,
                    color: e.target.value,
                  }))
                }
                style={{
                  width: 48,
                  height: 42,
                  borderRadius: 10,
                  border: "1px solid var(--rule)",
                  background: "var(--card-inset)",
                  cursor: "pointer",
                  padding: 4,
                  flexShrink: 0,
                }}
              />
            </div>
            {invTypeContext === "investments" && (
              <>
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    cursor: "pointer",
                    fontSize: 13,
                    color: "var(--fg)",
                    background: "var(--card-inset)",
                    borderRadius: 10,
                    padding: "10px 14px",
                    border: "1px solid var(--rule)",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={invTypeForm.supports_ticker}
                    onChange={(e) =>
                      setInvTypeForm((p) => ({
                        ...p,
                        supports_ticker: e.target.checked,
                      }))
                    }
                  />
                  {T("supports_ticker")}
                </label>
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    cursor: "pointer",
                    fontSize: 13,
                    color: "var(--fg)",
                    background: "var(--card-inset)",
                    borderRadius: 10,
                    padding: "10px 14px",
                    border: "1px solid var(--rule)",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={!!invTypeForm.supports_contribution_source}
                    onChange={(e) =>
                      setInvTypeForm((p) => ({
                        ...p,
                        supports_contribution_source: e.target.checked,
                      }))
                    }
                  />
                  {T("supports_contribution_source")}
                </label>
              </>
            )}
            <div>
              <div
                style={{
                  fontSize: 12,
                  color: "var(--fg-soft)",
                  marginBottom: 5,
                }}
              >
                {T("label_tax_rate")} ({T("tax_rate_zero_none")})
              </div>
              <input
                className="inp"
                type="number"
                step="0.01"
                min="0"
                max="100"
                placeholder="0"
                value={invTypeForm.tax_rate}
                onChange={(e) =>
                  setInvTypeForm((p) => ({
                    ...p,
                    tax_rate: e.target.value,
                  }))
                }
              />
            </div>
            <div
              className="row"
              style={{
                justifyContent: "flex-end",
                gap: 8,
                marginTop: 4,
              }}
            >
              <button className="btn btn-g" onClick={closeInvTypeModal}>
                {T("btn_cancel")}
              </button>
              <button className="btn btn-p" onClick={addInvestmentType}>
                {editingInvTypeId ? T("btn_save") : T("btn_add")}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
