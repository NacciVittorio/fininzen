"use client";

import type { Dispatch, SetStateAction } from "react";
import FieldLabel from "../../../components/FieldLabel";
import Select from "../../../components/Select";
import { VerifiedToggleButton } from "../../../components/ui";
import AmountCalculator from "../../../components/AmountCalculator";
import type { DecimalSeparator } from "../../../utils/formatters";
import type { Translator } from "../../../types";
import type { TransferForm } from "../../../context/formBuilders";
import type { AccountOption } from "../../portfolio/addTransaction/addTransactionTypes";

export default function TransferMovementForm({
    transferForm,
    setTransferForm,
    setTransferError,
    transferWarning,
    transferError,
    bankAccounts,
    T,
    decimalSeparator,
}: {
    transferForm: TransferForm;
    setTransferForm: Dispatch<SetStateAction<TransferForm>>;
    setTransferError: (value: string | null) => void;
    transferWarning?: string | null;
    transferError?: string | null;
    bankAccounts: readonly AccountOption[];
    T: Translator;
    decimalSeparator: DecimalSeparator;
}) {
    return (
        <>
            <div>
                <FieldLabel text={T("transfer_from")} htmlFor="transfer-from" />
                <Select
                    id="transfer-from"
                    usePortal
                    data-testid="transfer-from-account"
                    value={transferForm.from_account_id}
                    onChange={(value) =>
                        setTransferForm((previous) => ({
                            ...previous,
                            from_account_id: value,
                        }))
                    }
                    placeholder={T("no_linked_account")}
                    options={bankAccounts.map((account) => ({
                        value: String(account.id),
                        label: account.name,
                    }))}
                />
            </div>
            <div>
                <FieldLabel text={T("transfer_to")} htmlFor="transfer-to" />
                <Select
                    id="transfer-to"
                    usePortal
                    data-testid="transfer-to-account"
                    value={transferForm.to_account_id}
                    onChange={(value) =>
                        setTransferForm((previous) => ({
                            ...previous,
                            to_account_id: value,
                        }))
                    }
                    placeholder={T("no_linked_account")}
                    options={bankAccounts
                        .filter(
                            (account) =>
                                String(account.id) !==
                                String(transferForm.from_account_id),
                        )
                        .map((account) => ({
                            value: String(account.id),
                            label: account.name,
                        }))}
                />
            </div>
            <div>
                <FieldLabel
                    text={T("label_description_optional")}
                    htmlFor="transfer-notes"
                />
                <input
                    id="transfer-notes"
                    className="inp"
                    placeholder={T("placeholder_description")}
                    value={transferForm.notes}
                    onChange={(event) =>
                        setTransferForm((previous) => ({
                            ...previous,
                            notes: event.target.value,
                        }))
                    }
                />
            </div>
            <div>
                <FieldLabel
                    text={T("transfer_amount")}
                    htmlFor="transfer-amount"
                />
                <AmountCalculator
                    id="transfer-amount"
                    data-testid="transfer-amount"
                    value={transferForm.amount}
                    onChange={(amount) =>
                        setTransferForm((previous) => ({ ...previous, amount }))
                    }
                    onFocusClearError={() => setTransferError(null)}
                    decimalSeparator={decimalSeparator}
                    placeholder={decimalSeparator === "," ? "0,00" : "0.00"}
                    T={T}
                />
            </div>
            <div>
                <FieldLabel text={T("label_date")} htmlFor="transfer-date" />
                <div style={{ overflow: "hidden", borderRadius: 10 }}>
                    <input
                        id="transfer-date"
                        className="inp"
                        type="date"
                        value={transferForm.date}
                        onChange={(event) =>
                            setTransferForm((previous) => ({
                                ...previous,
                                date: event.target.value,
                            }))
                        }
                    />
                </div>
            </div>
            <div>
                <FieldLabel text={T("verified_filter_label")} />
                <VerifiedToggleButton
                    checked={transferForm.is_verified}
                    onToggle={() =>
                        setTransferForm((previous) => ({
                            ...previous,
                            is_verified: !previous.is_verified,
                        }))
                    }
                    T={T}
                />
            </div>
            {transferWarning && (
                <div
                    style={{
                        background: "var(--warning-soft)",
                        border: "1px solid var(--warning-ring)",
                        borderRadius: 8,
                        padding: "8px 12px",
                        fontSize: 13,
                        color: "var(--warning)",
                    }}
                >
                    ⚠ {transferWarning}
                </div>
            )}
            {transferError && (
                <div
                    style={{
                        fontSize: 12,
                        color: "var(--danger)",
                        background: "#ff6b6b11",
                        border: "1px solid #ff6b6b33",
                        borderRadius: 8,
                        padding: "8px 10px",
                    }}
                >
                    {transferError}
                </div>
            )}
        </>
    );
}
