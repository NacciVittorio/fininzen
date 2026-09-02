"use client";

import type { Asset } from "../../../api/types";
import type { Translator } from "../../../types";
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
    setAddTxCashTouched,
    T,
}: {
    asset?: Asset;
    setAddTxAssetId: SetAddTxAssetId;
    setAddTxForm: SetAddTxForm;
    setAddTxPriceTouched: SetTouched;
    setAddTxCashTouched: SetTouched;
    T: Translator;
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
                        fontWeight: 600,
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
                    setAddTxCashTouched(false);
                    setAddTxForm((previous) => ({
                        ...previous,
                        price_per_share: "",
                        cash_amount: "",
                        contribution_source: "",
                    }));
                }}
                data-testid="addtx-asset-clear"
                style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: "var(--fg-soft)",
                    fontSize: 18,
                    lineHeight: 1,
                    // Full touch target: it used to be a 2px-padded glyph.
                    width: 44,
                    height: 44,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    marginRight: -8,
                    flexShrink: 0,
                }}
                aria-label={T("pick_asset")}
            >
                ×
            </button>
        </div>
    );
}
