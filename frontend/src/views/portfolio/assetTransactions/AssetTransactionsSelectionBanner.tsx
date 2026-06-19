import type { Translator } from "../../../types";
import type { AssetTransactionFeedItem } from "../../../context/useAssetTransactionFeed";

export default function AssetTransactionsSelectionBanner({
    T,
    assetTxItems,
    assetTxTotalCount,
    assetTxSelectedCount,
    assetTxSelectAllFiltered,
    selectAllFilteredAssetTx,
    selectVisibleAssetTx,
    clearAssetTxSelection,
}: {
    T: Translator;
    assetTxItems: readonly AssetTransactionFeedItem[];
    assetTxTotalCount: number;
    assetTxSelectedCount: number;
    assetTxSelectAllFiltered: boolean;
    selectAllFilteredAssetTx: () => void;
    selectVisibleAssetTx: () => void;
    clearAssetTxSelection: () => void;
}) {
    return (
        <div
            data-testid="asset-tx-bulk-banner"
            style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "10px 12px",
                background: "var(--accent-soft)",
                borderRadius: 10,
                marginBottom: 8,
                fontSize: 12,
                flexWrap: "wrap",
            }}
        >
            <span
                style={{
                    color: "var(--accent-deep)",
                    fontWeight: 700,
                    whiteSpace: "nowrap",
                }}
                aria-live="polite"
            >
                {T("cf_bulk_selected_count").replace(
                    "{count}",
                    String(assetTxSelectedCount),
                )}
            </span>
            {assetTxTotalCount > assetTxItems.length && (
                <div style={{ marginLeft: "auto", minWidth: 0 }}>
                    <button
                        data-testid="asset-tx-bulk-select-filtered"
                        className="btn btn-g btn-sm"
                        onClick={selectAllFilteredAssetTx}
                        disabled={assetTxSelectAllFiltered}
                        style={{ fontSize: 11 }}
                    >
                        {T("cf_bulk_select_all_filtered").replace(
                            "{count}",
                            String(assetTxTotalCount),
                        )}
                    </button>
                </div>
            )}
            <div
                style={{
                    display: "flex",
                    gap: 6,
                    marginLeft:
                        assetTxTotalCount > assetTxItems.length ? 0 : "auto",
                    flexWrap: "wrap",
                }}
            >
                <button
                    data-testid="asset-tx-bulk-select-visible"
                    onClick={selectVisibleAssetTx}
                    className="btn btn-g btn-sm"
                    disabled={
                        !assetTxSelectAllFiltered &&
                        assetTxSelectedCount === assetTxItems.length
                    }
                    style={{ padding: "4px 10px", fontSize: 11 }}
                >
                    {T("cf_bulk_select_all")}
                </button>
                <button
                    data-testid="asset-tx-bulk-deselect"
                    onClick={clearAssetTxSelection}
                    className="btn btn-g btn-sm"
                    disabled={assetTxSelectedCount === 0}
                    style={{ padding: "4px 10px", fontSize: 11 }}
                >
                    {T("cf_bulk_deselect_all")}
                </button>
            </div>
        </div>
    );
}
