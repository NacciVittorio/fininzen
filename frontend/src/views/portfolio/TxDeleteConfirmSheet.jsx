import { BottomSheet, SheetTitle } from "../../components/ui";
import { formatDate } from "../../utils/formatters";

export default function TxDeleteConfirmSheet({
  txDeleteConfirm,
  setTxDeleteConfirm,
  deleteTx,
  T,
  formatEur,
}) {
  return (
    <BottomSheet
      open={!!txDeleteConfirm}
      onClose={() => setTxDeleteConfirm(null)}
      ariaLabel={T("tx_delete_confirm")}
    >
      {txDeleteConfirm && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 16,
            padding: "8px 18px 18px",
          }}
        >
          <SheetTitle>{T("tx_delete_confirm")}</SheetTitle>
          <div
            style={{
              background: "var(--card-inset)",
              borderRadius: 10,
              padding: "12px 14px",
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>
              {T(`tx_type_${txDeleteConfirm.transaction_type}`) ||
                txDeleteConfirm.transaction_type}
              {" · "}
              {formatDate(txDeleteConfirm.date)}
              {txDeleteConfirm.asset?.name
                ? ` · ${txDeleteConfirm.asset.name}`
                : ""}
            </div>
            <div
              style={{
                fontSize: 16,
                fontWeight: 600,
                fontFamily: "var(--font-mono)",
                color: "var(--danger)",
              }}
            >
              {["buy", "cash_out"].includes(txDeleteConfirm.transaction_type)
                ? "-"
                : "+"}
              {formatEur(txDeleteConfirm.total_value)}
            </div>
          </div>
          <div style={{ fontSize: 13, color: "var(--fg-soft)" }}>
            {T("action_cannot_be_undone")}
          </div>
          <div className="row" style={{ justifyContent: "flex-end", gap: 8 }}>
            <button
              className="btn btn-g"
              onClick={() => setTxDeleteConfirm(null)}
            >
              {T("btn_cancel")}
            </button>
            <button
              className="btn"
              style={{
                background: "var(--danger)",
                color: "var(--btn-primary-fg)",
                padding: "10px 18px",
              }}
              onClick={() =>
                deleteTx(txDeleteConfirm.id, txDeleteConfirm.asset?.id)
              }
            >
              {T("btn_delete")}
            </button>
          </div>
        </div>
      )}
    </BottomSheet>
  );
}
