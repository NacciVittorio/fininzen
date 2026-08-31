"use client";

import type { ReactNode } from "react";
import Modal from "../../components/Modal";
import { useApp } from "../../context/useApp";

export default function SplitDeleteConfirmation({
    title,
    summary,
    warning,
    confirmTestId,
    busy,
    onClose,
    onConfirm,
}: {
    title: string;
    summary: ReactNode;
    warning?: ReactNode;
    confirmTestId: string;
    busy: boolean;
    onClose: () => void;
    onConfirm: () => void;
}) {
    const { T } = useApp();
    return (
        <Modal title={title} onClose={onClose}>
            <div className="split-confirm-content">
                <div>{summary}</div>
                {warning && (
                    <div className="split-confirm-warning">{warning}</div>
                )}
                <div className="split-confirm-hint">
                    {T("action_cannot_be_undone")}
                </div>
                <div className="split-confirm-actions">
                    <button
                        type="button"
                        className="btn btn-g"
                        onClick={onClose}
                    >
                        {T("btn_cancel")}
                    </button>
                    <button
                        type="button"
                        className="btn btn-r"
                        data-testid={confirmTestId}
                        disabled={busy}
                        onClick={onConfirm}
                    >
                        {busy ? "…" : T("btn_delete")}
                    </button>
                </div>
            </div>
        </Modal>
    );
}
