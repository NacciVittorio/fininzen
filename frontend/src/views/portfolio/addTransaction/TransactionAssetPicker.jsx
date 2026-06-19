import FieldLabel from "../../../components/FieldLabel";

export default function TransactionAssetPicker({
  addTxAssetId,
  setAddTxAssetId,
  setAddTxForm,
  setAddTxPriceTouched,
  investments,
  T,
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
              {asset.name} {asset.ticker ? `(${asset.ticker})` : ""}
            </option>
          ))}
      </select>
    </div>
  );
}
