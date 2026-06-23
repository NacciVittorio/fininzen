"use client";

import type { Translator } from "../../../types";
import type { AssetTransactionFeedItem } from "../../../context/useAssetTransactionFeed";

export default function AssetTransactionsFooter({
    T,
    assetTxHasMore,
    assetTxLoading,
    assetTxItems,
    assetTxTotalCount,
    loadMoreAssetTx,
    loadAllAssetTx,
}: {
    T: Translator;
    assetTxHasMore: boolean;
    assetTxLoading: boolean;
    assetTxItems: readonly AssetTransactionFeedItem[];
    assetTxTotalCount: number;
    loadMoreAssetTx: () => void;
    loadAllAssetTx: () => void;
}) {
    return (
        <div
            style={{
                display: "flex",
                justifyContent: "center",
                gap: 10,
                padding: "12px 14px",
                background: "var(--rule-soft)",
            }}
        >
            {assetTxHasMore && (
                <button
                    className="btn btn-g btn-sm"
                    style={{ fontSize: 12 }}
                    disabled={assetTxLoading}
                    onClick={loadMoreAssetTx}
                >
                    {T("cf_load_more")}
                </button>
            )}
            {assetTxHasMore && (
                <button
                    className="btn btn-g btn-sm"
                    style={{ fontSize: 12 }}
                    disabled={assetTxLoading}
                    onClick={loadAllAssetTx}
                >
                    {T("cf_load_all")}
                </button>
            )}
            <div
                style={{
                    alignSelf: "center",
                    fontSize: 11,
                    color: "var(--fg-soft)",
                }}
            >
                {assetTxItems.length}/{assetTxTotalCount}
            </div>
        </div>
    );
}
