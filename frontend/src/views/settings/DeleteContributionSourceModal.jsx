import Modal from "../../components/Modal";

export function DeleteContributionSourceModal({
  T,
  deleteContributionSourceFlow,
  setDeleteContributionSourceFlow,
  contributionSources,
  confirmDeleteContributionSource,
}) {
  return (
    <>
      {deleteContributionSourceFlow && (
        <Modal
          title={T("modal_delete_contribution_source")}
          onClose={() => setDeleteContributionSourceFlow(null)}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 14,
            }}
          >
            <div
              style={{
                background: "var(--card-inset)",
                borderRadius: 10,
                padding: "10px 14px",
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 600 }}>
                {deleteContributionSourceFlow.source.name}
              </div>
              <div style={{ fontSize: 11, color: "var(--fg-soft)" }}>
                {deleteContributionSourceFlow.source.transaction_count || 0}{" "}
                {T("transactions")}
              </div>
            </div>

            <div style={{ fontSize: 13, color: "var(--fg-soft)" }}>
              {T("contribution_source_has_tx")}{" "}
              <strong style={{ color: "var(--fg)" }}>
                {deleteContributionSourceFlow.source.transaction_count || 0}{" "}
                {T("transactions")}
              </strong>
              . {T("what_to_do_tx")}
            </div>

            {[
              ["delete", T("delete_tx")],
              ["reassign", T("move_tx_to_source")],
              ["null", T("keep_uncategorized")],
            ].map(([val, label]) => {
              const targets = contributionSources.filter(
                (source) =>
                  source.id !== deleteContributionSourceFlow.source.id &&
                  source.is_active !== false,
              );
              return (
                <div
                  key={val}
                  onClick={() =>
                    setDeleteContributionSourceFlow((p) => ({
                      ...p,
                      txChoice: val,
                      txTarget: null,
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
                      deleteContributionSourceFlow.txChoice === val
                        ? "var(--accent-ring)"
                        : "var(--rule)",
                    background:
                      deleteContributionSourceFlow.txChoice === val
                        ? "var(--accent-ring)"
                        : "var(--card-inset)",
                  }}
                >
                  <input
                    type="radio"
                    readOnly
                    checked={deleteContributionSourceFlow.txChoice === val}
                    style={{ marginTop: 2, flexShrink: 0 }}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, color: "var(--fg)" }}>
                      {label}
                    </div>
                    {val === "reassign" &&
                      deleteContributionSourceFlow.txChoice === "reassign" && (
                        <select
                          className="inp"
                          style={{ marginTop: 8, fontSize: 12 }}
                          value={deleteContributionSourceFlow.txTarget || ""}
                          onChange={(e) =>
                            setDeleteContributionSourceFlow((p) => ({
                              ...p,
                              txTarget: e.target.value,
                            }))
                          }
                          onClick={(e) => e.stopPropagation()}
                        >
                          <option value="">
                            {T("select_contribution_source")}
                          </option>
                          {targets.map((source) => (
                            <option key={source.id} value={source.id}>
                              {source.name}
                            </option>
                          ))}
                        </select>
                      )}
                  </div>
                </div>
              );
            })}

            <div
              className="row"
              style={{
                justifyContent: "flex-end",
                gap: 8,
                marginTop: 4,
              }}
            >
              <button
                className="btn btn-g"
                onClick={() => setDeleteContributionSourceFlow(null)}
              >
                {T("btn_cancel")}
              </button>
              <button
                className="btn"
                disabled={
                  !deleteContributionSourceFlow.txChoice ||
                  (deleteContributionSourceFlow.txChoice === "reassign" &&
                    !deleteContributionSourceFlow.txTarget)
                }
                style={{
                  background: "var(--danger)",
                  color:
                    !deleteContributionSourceFlow.txChoice ||
                    (deleteContributionSourceFlow.txChoice === "reassign" &&
                      !deleteContributionSourceFlow.txTarget)
                      ? "var(--fg-soft)"
                      : "var(--btn-primary-fg)",
                  padding: "10px 18px",
                  border: "none",
                  borderRadius: 10,
                  fontFamily: "inherit",
                  fontSize: 14,
                  fontWeight: 500,
                  cursor:
                    !deleteContributionSourceFlow.txChoice ||
                    (deleteContributionSourceFlow.txChoice === "reassign" &&
                      !deleteContributionSourceFlow.txTarget)
                      ? "not-allowed"
                      : "pointer",
                }}
                onClick={confirmDeleteContributionSource}
              >
                {T("btn_confirm")}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
