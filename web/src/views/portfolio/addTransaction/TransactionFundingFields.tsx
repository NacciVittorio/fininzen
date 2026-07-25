"use client";

import FieldLabel from "../../../components/FieldLabel";
import Select from "../../../components/Select";
import type { Asset } from "../../../api/types";
import type { Translator } from "../../../types";
import type { AddTransactionForm } from "../portfolioViewModel";
import type {
    AccountOption,
    GetAvailableContributionSources,
    SetAddTxForm,
} from "./addTransactionTypes";

export default function TransactionFundingFields({
    addTxForm,
    setAddTxForm,
    asset,
    bankAccounts,
    getAvailableContributionSources,
    T,
}: {
    addTxForm: AddTransactionForm;
    setAddTxForm: SetAddTxForm;
    asset?: Asset;
    bankAccounts: readonly AccountOption[];
    getAvailableContributionSources: GetAvailableContributionSources;
    T: Translator;
}) {
    return (
        <>
            {bankAccounts.length > 0 && (
                <div>
                    <FieldLabel
                        htmlFor="addtx-account"
                        text={
                            addTxForm.transaction_type === "buy"
                                ? T("tx_source_account")
                                : T("tx_dest_account")
                        }
                    />
                    <Select
                        id="addtx-account"
                        usePortal
                        data-testid="addtx-account"
                        value={String(addTxForm.linked_account_id ?? "")}
                        placeholder={T("no_linked_account")}
                        onChange={(value) =>
                            setAddTxForm((previous) => ({
                                ...previous,
                                linked_account_id: value,
                                contribution_source: value
                                    ? ""
                                    : previous.contribution_source,
                            }))
                        }
                        options={bankAccounts.map((account) => ({
                            value: String(account.id),
                            label: account.name,
                        }))}
                    />
                </div>
            )}

            {asset?.supports_contribution_source &&
                addTxForm.transaction_type === "buy" &&
                !addTxForm.linked_account_id && (
                    <div>
                        <FieldLabel
                            text={T("label_contribution_source")}
                            htmlFor="addtx-contribution-source"
                        />
                        <Select
                            id="addtx-contribution-source"
                            usePortal
                            data-testid="addtx-contribution-source"
                            value={String(addTxForm.contribution_source ?? "")}
                            placeholder={T("contribution_source_none")}
                            onChange={(value) =>
                                setAddTxForm((previous) => ({
                                    ...previous,
                                    contribution_source: value,
                                    linked_account_id: value
                                        ? ""
                                        : previous.linked_account_id,
                                }))
                            }
                            options={getAvailableContributionSources(asset).map(
                                (source) => ({
                                    value: String(source.id),
                                    label: source.name,
                                }),
                            )}
                        />
                    </div>
                )}
        </>
    );
}
