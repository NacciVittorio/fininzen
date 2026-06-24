"use client";

import { Icon } from "../../../components/ui";
import { useMediaQuery } from "../../../utils/useMediaQuery";
import type { Translator } from "../../../types";
import type { BulkActionsAllowed } from "./cashflowBulkTypes";
import CashflowBulkOverflowMenu from "./CashflowBulkOverflowMenu";

export default function CashflowBulkToolbar({
    T,
    cfSelectedCount,
    cfBulkLoading,
    cfSelectionKind,
    bulkActionsAllowed,
    setCfBulkEditOpen,
    triggerBulkVerify,
    clearCfSelection,
    setBulkDeleteConfirm,
    exitCfSelectionMode,
}: {
    T: Translator;
    cfSelectedCount: number;
    cfBulkLoading: boolean;
    cfSelectionKind?: string | null;
    bulkActionsAllowed: BulkActionsAllowed;
    setCfBulkEditOpen: (value: boolean) => void;
    triggerBulkVerify: (value: boolean) => void;
    clearCfSelection: () => void;
    setBulkDeleteConfirm: (value: boolean) => void;
    exitCfSelectionMode: () => void;
}) {
    const isBulkCompact = useMediaQuery("(max-width: 720px)");

    return (
        <div
            data-testid="cf-bulk-toolbar"
            role="toolbar"
            aria-label={T("cf_bulk_edit_title")}
            style={{
                position: "fixed",
                left: "50%",
                transform: "translateX(-50%)",
                bottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)",
                zIndex: 1080,
                background: "var(--card)",
                border: "1px solid var(--rule)",
                borderRadius: 16,
                boxShadow: "var(--shadow-modal)",
                padding: "8px 10px",
                paddingLeft: "max(10px, env(safe-area-inset-left, 0px))",
                paddingRight: "max(10px, env(safe-area-inset-right, 0px))",
                display: "flex",
                alignItems: "center",
                gap: 8,
                width: isBulkCompact
                    ? "calc(100vw - 16px)"
                    : "min(760px, calc(100vw - 24px))",
                maxWidth: "100vw",
            }}
        >
            <span
                aria-live="polite"
                style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: "var(--accent-deep)",
                    padding: "0 8px",
                    whiteSpace: "nowrap",
                }}
            >
                {T("cf_bulk_selected_count").replace(
                    "{count}",
                    String(cfSelectedCount),
                )}
            </span>

            {!isBulkCompact && bulkActionsAllowed.verify && (
                <>
                    <button
                        data-testid="cf-bulk-verify"
                        className="btn btn-g btn-sm"
                        disabled={cfBulkLoading}
                        onClick={() => triggerBulkVerify(true)}
                    >
                        ✓ {T("cf_bulk_verify")}
                    </button>
                    <button
                        data-testid="cf-bulk-unverify"
                        className="btn btn-g btn-sm"
                        disabled={cfBulkLoading}
                        onClick={() => triggerBulkVerify(false)}
                    >
                        ○ {T("cf_bulk_unverify")}
                    </button>
                </>
            )}

            {bulkActionsAllowed.edit && (
                <button
                    data-testid="cf-bulk-edit"
                    className="btn btn-p btn-sm"
                    disabled={cfBulkLoading}
                    onClick={() => setCfBulkEditOpen(true)}
                    style={{ marginLeft: isBulkCompact ? "auto" : 0 }}
                >
                    {T("cf_bulk_edit")}
                </button>
            )}

            {cfSelectionKind === "adjustment" && (
                <span
                    data-testid="cf-bulk-adjustment-hint"
                    style={{
                        marginLeft: "auto",
                        fontSize: 11,
                        color: "var(--fg-soft)",
                        fontStyle: "italic",
                        maxWidth: 220,
                        lineHeight: 1.2,
                    }}
                >
                    {T("cf_bulk_adjustment_locked")}
                </span>
            )}

            <button
                data-testid="cf-bulk-delete-open"
                className="btn btn-sm"
                disabled={cfBulkLoading}
                onClick={() => setBulkDeleteConfirm(true)}
                aria-label={T("cf_bulk_delete")}
                title={T("cf_bulk_delete")}
                style={{
                    background: "transparent",
                    color: "var(--danger)",
                    border: "1px solid var(--danger)",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: isBulkCompact ? "6px 10px" : "6px 12px",
                    gap: 6,
                }}
            >
                <Icon name="trash" size={16} aria-hidden="true" />
                {!isBulkCompact && <span>{T("cf_bulk_delete")}</span>}
            </button>

            {isBulkCompact && bulkActionsAllowed.verify && (
                <CashflowBulkOverflowMenu
                    T={T}
                    disabled={cfBulkLoading}
                    triggerBulkVerify={triggerBulkVerify}
                    clearCfSelection={clearCfSelection}
                />
            )}

            <button
                className="btn btn-g btn-sm"
                onClick={exitCfSelectionMode}
                data-testid="cf-bulk-cancel"
                aria-label={T("btn_cancel")}
                title={T("btn_cancel")}
                style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: isBulkCompact ? "6px 8px" : "6px 12px",
                }}
            >
                <Icon name="x" size={16} aria-hidden="true" />
                {!isBulkCompact && (
                    <span style={{ marginLeft: 4 }}>{T("btn_cancel")}</span>
                )}
            </button>
        </div>
    );
}
