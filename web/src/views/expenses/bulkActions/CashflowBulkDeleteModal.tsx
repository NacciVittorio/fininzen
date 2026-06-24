"use client";

import Modal from "../../../components/Modal";
import type { Translator } from "../../../types";
import type { ApplyCfBulk } from "./cashflowBulkTypes";

export default function CashflowBulkDeleteModal({
    T,
    setBulkDeleteConfirm,
    cfSelectedCount,
    cfBulkError,
    cfBulkLoading,
    applyCfBulk,
}: {
    T: Translator;
    setBulkDeleteConfirm: (value: boolean) => void;
    cfSelectedCount: number;
    cfBulkError?: string | null;
    cfBulkLoading: boolean;
    applyCfBulk: ApplyCfBulk;
}) {
    return (
        <Modal
            title={T("cf_bulk_delete_title")}
            onClose={() => setBulkDeleteConfirm(false)}
        >
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div style={{ fontSize: 14 }}>
                    {T("cf_bulk_delete_summary")
                        .replace("{count}", String(cfSelectedCount))
                        .replace("{amount}", "")}
                </div>
                <div style={{ fontSize: 13, color: "var(--fg-soft)" }}>
                    {T("action_cannot_be_undone")}
                </div>
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
                        onClick={() => setBulkDeleteConfirm(false)}
                    >
                        {T("btn_cancel")}
                    </button>
                    <button
                        className="btn"
                        disabled={cfBulkLoading}
                        style={{
                            background: "var(--danger)",
                            color: "var(--btn-primary-fg)",
                            padding: "10px 18px",
                        }}
                        onClick={async () => {
                            const ok = await applyCfBulk({ action: "delete" });
                            if (ok) setBulkDeleteConfirm(false);
                        }}
                        data-testid="cf-bulk-delete-confirm"
                    >
                        {T("cf_bulk_confirm_delete")}
                    </button>
                </div>
            </div>
        </Modal>
    );
}
