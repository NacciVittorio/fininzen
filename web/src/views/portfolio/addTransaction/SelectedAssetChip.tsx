"use client";

import type { Asset } from "../../../api/types";
import type {
    SetAddTxAssetId,
    SetAddTxForm,
    SetTouched,
} from "./addTransactionTypes";

export default function SelectedAssetChip({
    asset,
    setAddTxAssetId,
    setAddTxForm,
    setAddTxPriceTouched,
}: {
    asset?: Asset;
    setAddTxAssetId: SetAddTxAssetId;
    setAddTxForm: SetAddTxForm;
    setAddTxPriceTouched: SetTouched;
}) {
    return (
        <div
            style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 14px",
                background: "var(--card-inset)",
                borderRadius: 10,
                border: "1px solid var(--rule)",
            }}
        >
            <div style={{ flex: 1, minWidth: 0 }}>
                <div
                    style={{
                        fontWeight: 700,
                        fontSize: 15,
                        lineHeight: 1.2,
                        color: "var(--fg)",
                    }}
                >
                    {asset?.name}
                </div>
                {asset?.ticker && (
                    <div
                        style={{
                            fontSize: 12,
                            color: "var(--fg-soft)",
                            fontFamily: "var(--font-mono)",
                            marginTop: 2,
                        }}
                    >
                        {asset.ticker}
                    </div>
                )}
            </div>
            <button
                type="button"
                onClick={() => {
                    setAddTxAssetId("");
                    setAddTxPriceTouched(false);
                    setAddTxForm((previous) => ({
                        ...previous,
                        price_per_share: "",
                        contribution_source: "",
                    }));
                }}
                style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: "var(--fg-soft)",
                    fontSize: 18,
                    lineHeight: 1,
                    padding: 2,
                    flexShrink: 0,
                }}
                aria-label="Change asset"
            >
                ×
            </button>
        </div>
    );
}
