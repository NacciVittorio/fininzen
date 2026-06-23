import FieldLabel from "../../../components/FieldLabel";
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
            <FieldLabel text={T("pick_asset")} />
            <select
                className="inp"
                value={addTxAssetId}
                autoFocus
                onChange={(event) => {
                    setAddTxAssetId(event.target.value);
                    setAddTxPriceTouched(false);
                    setAddTxForm((previous) => ({
                        ...previous,
                        price_per_share: "",
                        contribution_source: "",
                    }));
                }}
            >
                <option value="">{T("pick_asset")}</option>
                {investments
                    .filter((asset) => asset.tracking_type === "AUTO")
                    .map((asset) => (
                        <option key={asset.id} value={asset.id}>
                            {asset.name}{" "}
                            {asset.ticker ? `(${asset.ticker})` : ""}
                        </option>
                    ))}
            </select>
        </div>
    );
}
