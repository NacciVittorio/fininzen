export function DeleteCategoryTransactionsStep({
  T,
  deleteCatFlow,
  setDeleteCatFlow,
  categories,
  confirmDeleteCategory,
}) {
  return (
    <>
      {/* Step: expenses */}
      {deleteCatFlow.step === "expenses" &&
        (() => {
          const allCatsOfType = categories.filter(
            (c) =>
              c.category_type === deleteCatFlow.cat.category_type &&
              c.id !== deleteCatFlow.cat.id,
          );
          return (
            <div>
              <div
                style={{
                  fontSize: 13,
                  color: "var(--fg-soft)",
                  marginBottom: 12,
                }}
              >
                {T("cat_has_tx")}{" "}
                <strong style={{ color: "var(--fg)" }}>
                  {deleteCatFlow.cat.expense_count || 0} {T("transactions")}
                </strong>
                . {T("what_to_do_tx")}
              </div>
              {[
                ["delete", T("delete_tx")],
                ["reassign", T("move_tx_to")],
                ["null", T("keep_uncategorized")],
              ].map(([val, label]) => (
                <div
                  key={val}
                  onClick={() =>
                    setDeleteCatFlow((p) => ({
                      ...p,
                      expChoice: val,
                      expTarget: null,
                    }))
                  }
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 10,
                    padding: "10px 12px",
                    borderRadius: 10,
                    cursor: "pointer",
                    border: "1px solid",
                    borderColor:
                      deleteCatFlow.expChoice === val
                        ? "var(--accent-ring)"
                        : "var(--rule)",
                    background:
                      deleteCatFlow.expChoice === val
                        ? "var(--accent-ring)"
                        : "var(--card-inset)",
                    marginBottom: 8,
                  }}
                >
                  <input
                    type="radio"
                    readOnly
                    checked={deleteCatFlow.expChoice === val}
                    style={{
                      marginTop: 2,
                      flexShrink: 0,
                    }}
                  />
                  <div>
                    <div
                      style={{
                        fontSize: 13,
                        color: "var(--fg)",
                      }}
                    >
                      {label}
                    </div>
                    {val === "reassign" &&
                      deleteCatFlow.expChoice === "reassign" && (
                        <select
                          className="inp"
                          style={{
                            marginTop: 8,
                            fontSize: 12,
                          }}
                          value={deleteCatFlow.expTarget || ""}
                          onChange={(e) =>
                            setDeleteCatFlow((p) => ({
                              ...p,
                              expTarget: e.target.value,
                            }))
                          }
                          onClick={(e) => e.stopPropagation()}
                        >
                          <option value="">{T("select_category")}</option>
                          {allCatsOfType.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.icon} {c.name}
                            </option>
                          ))}
                        </select>
                      )}
                  </div>
                </div>
              ))}
              {!deleteCatFlow.expChoice && (
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--fg-soft)",
                    marginTop: 4,
                  }}
                >
                  {T("select_option_to_continue")}
                </div>
              )}
              <div
                className="row"
                style={{
                  justifyContent: "flex-end",
                  gap: 8,
                  marginTop: 8,
                }}
              >
                <button
                  className="btn btn-g"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleteCatFlow(null);
                  }}
                >
                  {T("btn_cancel")}
                </button>
                <button
                  className="btn"
                  disabled={
                    !deleteCatFlow.expChoice ||
                    (deleteCatFlow.expChoice === "reassign" &&
                      !deleteCatFlow.expTarget)
                  }
                  style={{
                    background:
                      !deleteCatFlow.expChoice ||
                      (deleteCatFlow.expChoice === "reassign" &&
                        !deleteCatFlow.expTarget)
                        ? "var(--danger)"
                        : "var(--danger)",
                    color:
                      !deleteCatFlow.expChoice ||
                      (deleteCatFlow.expChoice === "reassign" &&
                        !deleteCatFlow.expTarget)
                        ? "var(--fg-soft)"
                        : "var(--btn-primary-fg)",
                    padding: "10px 18px",
                    border: "none",
                    borderRadius: 10,
                    fontFamily: "inherit",
                    fontSize: 14,
                    fontWeight: 500,
                    cursor:
                      !deleteCatFlow.expChoice ||
                      (deleteCatFlow.expChoice === "reassign" &&
                        !deleteCatFlow.expTarget)
                        ? "not-allowed"
                        : "pointer",
                  }}
                  onClick={confirmDeleteCategory}
                >
                  {T("btn_confirm")}
                </button>
              </div>
            </div>
          );
        })()}
    </>
  );
}
