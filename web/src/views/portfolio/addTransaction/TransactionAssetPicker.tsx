"use client";

import FieldLabel from "../../../components/FieldLabel";
import Select from "../../../components/Select";
import type { Asset } from "../../../api/types";
import type { Translator } from "../../../types";
import type {
    SetAddTxAssetId,
    SetAddTxForm,
    SetTouched,
} from "./addTransactionTypes";

export default function TransactionAssetPicker({
    addTxAssetId,
    setAddTxAssetId,
    setAddTxForm,
    setAddTxPriceTouched,
    investments,
    T,
}: {
    addTxAssetId: string;
    setAddTxAssetId: SetAddTxAssetId;
    setAddTxForm: SetAddTxForm;
    setAddTxPriceTouched: SetTouched;
    investments: readonly Asset[];
    T: Translator;
}) {
    return (
        <div>
            <FieldLabel text={T("pick_asset")} htmlFor="addtx-asset" />
            {/* No autoFocus: it fought BottomSheet's own focusFirst(). */}
            <Select
                id="addtx-asset"
                usePortal
                data-testid="addtx-asset"
                value={addTxAssetId}
                placeholder={T("pick_asset")}
                onChange={(value) => {
                    setAddTxAssetId(value);
                    setAddTxPriceTouched(false);
                    setAddTxForm((previous) => ({
                        ...previous,
                        price_per_share: "",
                        contribution_source: "",
                    }));
                }}
                options={investments
                    .filter((asset) => asset.tracking_type === "AUTO")
                    .map((asset) => ({
                        value: String(asset.id),
                        label: asset.ticker
                            ? `${asset.name} (${asset.ticker})`
                            : asset.name,
                        keywords: asset.ticker || undefined,
                    }))}
            />
        </div>
    );
}
