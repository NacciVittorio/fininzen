import Modal from "../../components/Modal";
import type { NumericValue, Translator } from "../../types";
import type { CashflowFeedItem, EntityId } from "../../context/feedTypes";

export type DeleteCfTarget = { item: CashflowFeedItem };

export default function CashflowDeleteConfirmModal({
    deleteCfTarget,
    setDeleteCfTarget,
    deleteCfExpense,
    deleteCfTx,
    T,
    formatEur,
}: {
    deleteCfTarget: DeleteCfTarget | null;
    setDeleteCfTarget: (value: DeleteCfTarget | null) => void;
    deleteCfExpense: (sourceId?: EntityId) => void | Promise<unknown>;
    deleteCfTx: (item: CashflowFeedItem) => void | Promise<unknown>;
    T: Translator;
    formatEur: (value: NumericValue) => string;
}) {
    if (!deleteCfTarget) return null;

    return (
        <Modal
            title={T("modal_delete_expense")}
            onClose={() => setDeleteCfTarget(null)}
        >
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div
                    style={{
                        background: "var(--card-inset)",
                        borderRadius: 10,
                        padding: "12px 14px",
                    }}
                >
                    <div
                        style={{
                            fontSize: 14,
                            fontWeight: 500,
                            marginBottom: 4,
                        }}
                    >
                        {deleteCfTarget.item.description}
                    </div>
                    <div
                        style={{
                            fontSize: 16,
                            fontWeight: 600,
                            fontFamily: "var(--font-mono)",
                            color: "var(--danger)",
                        }}
                    >
                        {formatEur(deleteCfTarget.item.amount)}
                    </div>
                </div>
                <div style={{ fontSize: 13, color: "var(--fg-soft)" }}>
                    {T("action_cannot_be_undone")}
                </div>
                <div
                    className="row"
                    style={{ justifyContent: "flex-end", gap: 8 }}
                >
                    <button
                        className="btn btn-g"
                        onClick={() => setDeleteCfTarget(null)}
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
                        onClick={async () => {
                            const { item } = deleteCfTarget;
                            setDeleteCfTarget(null);
                            if (item.source_type === "expense") {
                                await deleteCfExpense(item.source_id);
                            } else {
                                await deleteCfTx(item);
                            }
                        }}
                    >
                        {T("btn_delete")}
                    </button>
                </div>
            </div>
        </Modal>
    );
}
