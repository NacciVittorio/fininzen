import Modal from "../../../components/Modal";
import type { Translator } from "../../../types";
import type { ApplyCfBulk, PendingBulkVerify } from "./cashflowBulkTypes";

export default function CashflowBulkVerifyModal({
    T,
    pendingBulkVerify,
    setPendingBulkVerify,
    cfSelectedCount,
    cfSelectAllFiltered,
    cfBulkError,
    cfBulkLoading,
    applyCfBulk,
}: {
    T: Translator;
    pendingBulkVerify: PendingBulkVerify;
    setPendingBulkVerify: (pending: PendingBulkVerify | null) => void;
    cfSelectedCount: number;
    cfSelectAllFiltered: boolean;
    cfBulkError?: string | null;
    cfBulkLoading: boolean;
    applyCfBulk: ApplyCfBulk;
}) {
    return (
        <Modal
            title={T(
                pendingBulkVerify.value ? "cf_bulk_verify" : "cf_bulk_unverify",
            )}
            onClose={() => setPendingBulkVerify(null)}
        >
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div style={{ fontSize: 14 }}>
                    {T("cf_bulk_confirm_verify_summary")
                        .replace("{count}", String(cfSelectedCount))
                        .replace(
                            "{verb}",
                            T(
                                pendingBulkVerify.value
                                    ? "cf_bulk_verify"
                                    : "cf_bulk_unverify",
                            ),
                        )}
                </div>
                {cfSelectAllFiltered && (
                    <div style={{ fontSize: 13, color: "var(--fg-soft)" }}>
                        {T("cf_bulk_confirm_verify_hint_filtered")}
                    </div>
                )}
                {cfBulkError && (
                    <div style={{ color: "var(--danger)", fontSize: 12 }}>
                        {cfBulkError}
                    </div>
                )}
                <div
                    className="row"
                    style={{ justifyContent: "flex-end", gap: 8 }}
                >
                    <button
                        className="btn btn-g"
                        onClick={() => setPendingBulkVerify(null)}
                    >
                        {T("btn_cancel")}
                    </button>
                    <button
                        className="btn btn-p"
                        disabled={cfBulkLoading}
                        data-testid="cf-bulk-verify-confirm"
                        onClick={async () => {
                            const ok = await applyCfBulk({
                                action: "edit",
                                patch: { is_verified: pendingBulkVerify.value },
                            });
                            if (ok) setPendingBulkVerify(null);
                        }}
                    >
                        {T("cf_bulk_apply")}
                    </button>
                </div>
            </div>
        </Modal>
    );
}
