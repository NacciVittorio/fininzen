"use client";

import type { Dispatch, SetStateAction } from "react";
import FieldLabel from "../../components/FieldLabel";
import { BottomSheet, VerifiedToggleButton } from "../../components/ui";
import { filterAmountInput } from "../../utils/formatters";
import type { DecimalSeparator } from "../../utils/formatters";
import type { Translator } from "../../types";
import type { CashflowFeedItem } from "../../context/feedTypes";
import type { TransferEditForm } from "../../context/useTransactionFeeds";

export default function CashflowEditTransferSheet({
    cfEditTransferItem,
    cfEditTransferForm,
    setCfEditTransferForm,
    cfEditTransferError,
    cfEditTransferLoading,
    closeCfEditTransfer,
    submitCfEditTransfer,
    T,
    decimalSeparator,
}: {
    cfEditTransferItem: CashflowFeedItem | null;
    cfEditTransferForm: TransferEditForm;
    setCfEditTransferForm: Dispatch<SetStateAction<TransferEditForm>>;
    cfEditTransferError?: string | null;
    cfEditTransferLoading: boolean;
    closeCfEditTransfer: () => void;
    submitCfEditTransfer: () => void;
    T: Translator;
    decimalSeparator: DecimalSeparator;
}) {
    if (!cfEditTransferItem) return null;

    return (
        <BottomSheet
            open
            onClose={closeCfEditTransfer}
            ariaLabel={T("cf_edit_transfer")}
        >
            <div style={{ padding: "0 18px" }}>
                <div
                    style={{
                        fontSize: 18,
                        fontWeight: 800,
                        color: "var(--fg)",
                        padding: "2px 2px 14px",
                    }}
                >
                    {T("cf_edit_transfer")}
                </div>
                <div
                    style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 14,
                    }}
                >
                    <div
                        style={{
                            fontSize: 12,
                            color: "var(--fg-soft)",
                            background: "var(--rule-soft)",
                            borderRadius: 8,
                            padding: "8px 12px",
                        }}
                    >
                        {cfEditTransferItem.from_account?.name} →{" "}
                        {cfEditTransferItem.to_account?.name}
                    </div>
                    <div>
                        <FieldLabel text={T("label_description_optional")} />
                        <input
                            className="inp"
                            placeholder={T("placeholder_description")}
                            value={cfEditTransferForm.notes}
                            onChange={(e) =>
                                setCfEditTransferForm((p) => ({
                                    ...p,
                                    notes: e.target.value,
                                }))
                            }
                        />
                    </div>
                    <div>
                        <FieldLabel text={T("label_amount")} />
                        <input
                            className="inp"
                            type="text"
                            inputMode="decimal"
                            placeholder={
                                decimalSeparator === "," ? "0,00" : "0.00"
                            }
                            value={cfEditTransferForm.amount}
                            onChange={(e) =>
                                setCfEditTransferForm((p) => ({
                                    ...p,
                                    amount: filterAmountInput(e.target.value),
                                }))
                            }
                        />
                    </div>
                    <div>
                        <FieldLabel text={T("cf_edit_date")} />
                        <input
                            className="inp"
                            type="date"
                            value={cfEditTransferForm.date}
                            onChange={(e) =>
                                setCfEditTransferForm((p) => ({
                                    ...p,
                                    date: e.target.value,
                                }))
                            }
                        />
                    </div>
                    <div>
                        <FieldLabel text={T("verified_filter_label")} />
                        <VerifiedToggleButton
                            checked={cfEditTransferForm.is_verified}
                            onToggle={() =>
                                setCfEditTransferForm((p) => ({
                                    ...p,
                                    is_verified: !p.is_verified,
                                }))
                            }
                            T={T}
                        />
                    </div>
                    {cfEditTransferError && (
                        <div style={{ color: "var(--danger)", fontSize: 12 }}>
                            {cfEditTransferError}
                        </div>
                    )}
                    <div
                        className="row"
                        style={{
                            justifyContent: "flex-end",
                            gap: 8,
                            marginTop: 4,
                        }}
                    >
                        <button
                            className="btn btn-g"
                            onClick={closeCfEditTransfer}
                        >
                            {T("btn_cancel")}
                        </button>
                        <button
                            className="btn btn-p"
                            onClick={submitCfEditTransfer}
                            disabled={cfEditTransferLoading}
                        >
                            {T("cf_save")}
                        </button>
                    </div>
                </div>
            </div>
        </BottomSheet>
    );
}
