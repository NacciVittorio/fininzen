import FieldLabel from "../../components/FieldLabel";
import { BottomSheet, SheetTitle } from "../../components/ui";
import ContributionSourceScope from "./assetForm/ContributionSourceScope";
import InvestmentTypeModeHint from "./assetForm/InvestmentTypeModeHint";
import TickerField from "./assetForm/TickerField";

export default function AssetFormSheet({
  showAssetModal,
  closeAssetModal,
  editingAssetId,
  assetForm,
  setAssetForm,
  assetError,
  selectedInvType,
  investmentTypes,
  assetFormSupportsContributionSource,
  activeContributionSources,
  bankAccounts,
  tickerQuery,
  tickerResults,
  tickerLoading,
  showTickerDrop,
  tickerSearchOrigin,
  setShowTickerDrop,
  handlePriceSourceChange,
  handleTickerInput,
  handleIsinInput,
  selectTicker,
  saveAsset,
  T,
}) {
  return (
    <BottomSheet
      open={showAssetModal}
      onClose={closeAssetModal}
      ariaLabel={editingAssetId ? T("modal_edit_asset") : T("modal_new_asset")}
    >
      {showAssetModal && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 11,
            padding: "8px 18px 18px",
          }}
        >
          <SheetTitle>
            {editingAssetId ? T("modal_edit_asset") : T("modal_new_asset")}
          </SheetTitle>
          <div>
            <FieldLabel text={T("label_name")} />
            <input
              className="inp"
              placeholder={T("placeholder_name")}
              value={assetForm.name}
              onChange={(event) =>
                setAssetForm((previous) => ({
                  ...previous,
                  name: event.target.value,
                }))
              }
            />
          </div>

          <div>
            <FieldLabel text={T("label_investment_type")} />
            <select
              className="inp"
              value={assetForm.investment_type}
              onChange={(event) =>
                setAssetForm((previous) => ({
                  ...previous,
                  investment_type: event.target.value,
                }))
              }
            >
              <option value="">{T("select_type")}</option>
              {investmentTypes
                .filter((type) => !type.is_bank_account)
                .map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.icon} {type.name}
                  </option>
                ))}
            </select>
            {selectedInvType && (
              <InvestmentTypeModeHint selectedInvType={selectedInvType} />
            )}
          </div>

          {selectedInvType && !selectedInvType.is_bank_account && (
            <div>
              <FieldLabel text={T("label_contribution_source_mode")} />
              <select
                className="inp"
                value={assetForm.contribution_source_mode || "inherit"}
                onChange={(event) =>
                  setAssetForm((previous) => ({
                    ...previous,
                    contribution_source_mode: event.target.value,
                  }))
                }
              >
                <option value="inherit">
                  {T("contribution_source_mode_inherit")}
                </option>
                <option value="enabled">
                  {T("contribution_source_mode_enabled")}
                </option>
                <option value="disabled">
                  {T("contribution_source_mode_disabled")}
                </option>
              </select>
            </div>
          )}

          {assetFormSupportsContributionSource &&
            activeContributionSources.length > 0 && (
              <ContributionSourceScope
                assetForm={assetForm}
                setAssetForm={setAssetForm}
                activeContributionSources={activeContributionSources}
                T={T}
              />
            )}

          {selectedInvType &&
            !selectedInvType.supports_ticker &&
            !editingAssetId && (
              <div>
                <FieldLabel text={T("label_purchase_cost")} />
                <input
                  type="text"
                  inputMode="decimal"
                  className="inp"
                  placeholder="0.00"
                  value={assetForm.initial_balance}
                  onChange={(event) =>
                    setAssetForm((previous) => ({
                      ...previous,
                      initial_balance: event.target.value,
                    }))
                  }
                />
              </div>
            )}

          {selectedInvType && !selectedInvType.is_bank_account && (
            <div>
              <FieldLabel text={T("label_asset_tax_rate_override")} />
              <input
                type="text"
                inputMode="decimal"
                className="inp"
                placeholder={T("tax_rate_zero_none")}
                value={assetForm.tax_rate_override}
                onChange={(event) =>
                  setAssetForm((previous) => ({
                    ...previous,
                    tax_rate_override: event.target.value,
                  }))
                }
              />
            </div>
          )}

          {selectedInvType?.supports_ticker && (
            <div>
              <FieldLabel text={T("label_price_source")} />
              <select
                className="inp"
                value={assetForm.price_source || "AUTO"}
                onChange={(event) =>
                  handlePriceSourceChange(event.target.value)
                }
              >
                <option value="AUTO">{T("price_source_auto")}</option>
                <option value="YAHOO">{T("price_source_yahoo")}</option>
                <option value="BORSA_ITALIANA">
                  {T("price_source_borsa")}
                </option>
              </select>
            </div>
          )}

          {selectedInvType?.supports_ticker && (
            <TickerField
              assetForm={assetForm}
              tickerQuery={tickerQuery}
              tickerResults={tickerResults}
              tickerLoading={tickerLoading}
              showTickerDrop={showTickerDrop}
              tickerSearchOrigin={tickerSearchOrigin}
              setShowTickerDrop={setShowTickerDrop}
              handleTickerInput={handleTickerInput}
              handleIsinInput={handleIsinInput}
              selectTicker={selectTicker}
              T={T}
            />
          )}

          {bankAccounts.length > 0 && (
            <div>
              <FieldLabel text={T("label_source_account")} />
              <select
                className="inp"
                value={assetForm.source_account ?? ""}
                onChange={(event) =>
                  setAssetForm((previous) => ({
                    ...previous,
                    source_account: event.target.value,
                  }))
                }
              >
                <option value="">{T("no_source_account")}</option>
                {bankAccounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <FieldLabel text={T("label_notes")} />
            <textarea
              className="inp"
              placeholder={T("placeholder_notes")}
              rows={2}
              value={assetForm.notes}
              onChange={(event) =>
                setAssetForm((previous) => ({
                  ...previous,
                  notes: event.target.value,
                }))
              }
            />
          </div>
          {assetError && (
            <div
              style={{
                background: "var(--danger-soft)",
                border: "1px solid var(--danger-soft)",
                borderRadius: 8,
                padding: "8px 12px",
                fontSize: 13,
                color: "var(--danger)",
              }}
            >
              {assetError}
            </div>
          )}
          <div
            className="row"
            style={{
              justifyContent: "flex-end",
              gap: 8,
              marginTop: 6,
            }}
          >
            <button className="btn btn-g" onClick={closeAssetModal}>
              {T("btn_cancel")}
            </button>
            <button className="btn btn-p" onClick={saveAsset}>
              {editingAssetId ? T("btn_save") : T("btn_add")}
            </button>
          </div>
        </div>
      )}
    </BottomSheet>
  );
}
