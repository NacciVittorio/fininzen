import FieldLabel from "../../../components/FieldLabel";

export default function TransactionFundingFields({
  addTxForm,
  setAddTxForm,
  asset,
  bankAccounts,
  getAvailableContributionSources,
  T,
}) {
  return (
    <>
      {bankAccounts.length > 0 && (
        <div>
          <FieldLabel
            text={
              addTxForm.transaction_type === "buy"
                ? T("tx_source_account")
                : T("tx_dest_account")
            }
          />
          <select
            className="inp"
            value={addTxForm.linked_account_id}
            onChange={(event) =>
              setAddTxForm((previous) => ({
                ...previous,
                linked_account_id: event.target.value,
                contribution_source: event.target.value
                  ? ""
                  : previous.contribution_source,
              }))
            }
          >
            <option value="">{T("no_linked_account")}</option>
            {bankAccounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {asset?.supports_contribution_source &&
        addTxForm.transaction_type === "buy" &&
        !addTxForm.linked_account_id && (
          <div>
            <FieldLabel text={T("label_contribution_source")} />
            <select
              className="inp"
              value={addTxForm.contribution_source}
              onChange={(event) =>
                setAddTxForm((previous) => ({
                  ...previous,
                  contribution_source: event.target.value,
                  linked_account_id: event.target.value
                    ? ""
                    : previous.linked_account_id,
                }))
              }
            >
              <option value="">{T("contribution_source_none")}</option>
              {getAvailableContributionSources(asset).map((source) => (
                <option key={source.id} value={source.id}>
                  {source.name}
                </option>
              ))}
            </select>
          </div>
        )}
    </>
  );
}
