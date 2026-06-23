import { BottomSheet, Icon, SheetTitle } from "../../components/ui";
import type { Translator } from "../../types";

export type PendingAssetTxBulkVerify = { value: boolean };

export default function AssetTxBulkActions({
    T,
    pendingAssetTxBulkVerify,
    setPendingAssetTxBulkVerify,
    assetTxSelectedCount,
    assetTxSelectAllFiltered,
    assetTxBulkError,
    assetTxBulkLoading,
    applyAssetTxBulkVerify,
    assetTxSelectionMode,
    triggerAssetTxBulkVerify,
    exitAssetTxSelectionMode,
}: {
    T: Translator;
    pendingAssetTxBulkVerify: PendingAssetTxBulkVerify | null;
    setPendingAssetTxBulkVerify: (
        pending: PendingAssetTxBulkVerify | null,
    ) => void;
    assetTxSelectedCount: number;
    assetTxSelectAllFiltered: boolean;
    assetTxBulkError?: string | null;
    assetTxBulkLoading: boolean;
    applyAssetTxBulkVerify: (value: boolean) => Promise<boolean>;
    assetTxSelectionMode: boolean;
    triggerAssetTxBulkVerify: (value: boolean) => void;
    exitAssetTxSelectionMode: () => void;
}) {
    return (
        <>
            <BottomSheet
                open={!!pendingAssetTxBulkVerify}
                onClose={() => setPendingAssetTxBulkVerify(null)}
                ariaLabel={T("cf_bulk_apply")}
            >
                {pendingAssetTxBulkVerify && (
                    <div
                        style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 16,
                            padding: "8px 18px 18px",
                        }}
                    >
                        <SheetTitle>
                            {T(
                                pendingAssetTxBulkVerify.value
                                    ? "cf_bulk_verify"
                                    : "cf_bulk_unverify",
                            )}
                        </SheetTitle>
                        <div style={{ fontSize: 14 }}>
                            {T("cf_bulk_confirm_verify_summary")
                                .replace(
                                    "{count}",
                                    String(assetTxSelectedCount),
                                )
                                .replace(
                                    "{verb}",
                                    T(
                                        pendingAssetTxBulkVerify.value
                                            ? "cf_bulk_verify"
                                            : "cf_bulk_unverify",
                                    ),
                                )}
                        </div>
                        {assetTxSelectAllFiltered && (
                            <div
                                style={{
                                    fontSize: 13,
                                    color: "var(--fg-soft)",
                                }}
                            >
                                {T("cf_bulk_confirm_verify_hint_filtered")}
                            </div>
                        )}
                        {assetTxBulkError && (
                            <div
                                style={{ color: "var(--danger)", fontSize: 12 }}
                            >
                                {assetTxBulkError}
                            </div>
                        )}
                        <div
                            className="row"
                            style={{ justifyContent: "flex-end", gap: 8 }}
                        >
                            <button
                                className="btn btn-g"
                                onClick={() =>
                                    setPendingAssetTxBulkVerify(null)
                                }
                            >
                                {T("btn_cancel")}
                            </button>
                            <button
                                className="btn btn-p"
                                disabled={assetTxBulkLoading}
                                data-testid="asset-tx-bulk-verify-confirm"
                                onClick={async () => {
                                    const ok = await applyAssetTxBulkVerify(
                                        pendingAssetTxBulkVerify.value,
                                    );
                                    if (ok) setPendingAssetTxBulkVerify(null);
                                }}
                            >
                                {T("cf_bulk_apply")}
                            </button>
                        </div>
                    </div>
                )}
            </BottomSheet>

            {assetTxSelectionMode && assetTxSelectedCount > 0 && (
                <div
                    data-testid="asset-tx-bulk-toolbar"
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
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        width: "min(560px, calc(100vw - 24px))",
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
                            String(assetTxSelectedCount),
                        )}
                    </span>
                    <button
                        data-testid="asset-tx-bulk-verify"
                        className="btn btn-g btn-sm"
                        disabled={assetTxBulkLoading}
                        onClick={() => triggerAssetTxBulkVerify(true)}
                    >
                        ✓ {T("cf_bulk_verify")}
                    </button>
                    <button
                        data-testid="asset-tx-bulk-unverify"
                        className="btn btn-g btn-sm"
                        disabled={assetTxBulkLoading}
                        onClick={() => triggerAssetTxBulkVerify(false)}
                    >
                        ○ {T("cf_bulk_unverify")}
                    </button>
                    <button
                        className="btn btn-g btn-sm"
                        onClick={exitAssetTxSelectionMode}
                        data-testid="asset-tx-bulk-cancel"
                        aria-label={T("btn_cancel")}
                        title={T("btn_cancel")}
                        style={{
                            marginLeft: "auto",
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            padding: "6px 8px",
                        }}
                    >
                        <Icon name="x" size={16} aria-hidden="true" />
                    </button>
                </div>
            )}
        </>
    );
}
