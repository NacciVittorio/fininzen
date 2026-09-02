"use client";

import type { Asset } from "../../../api/types";
import type { Translator } from "../../../types";
import AmountCalculator from "../../../components/AmountCalculator";
import FieldLabel from "../../../components/FieldLabel";
import {
    localeFromSeparator,
    parseFlexibleDecimal,
} from "../../../utils/formatters";
import type { DecimalSeparator } from "../../../utils/formatters";
import type { AddTransactionForm } from "../portfolioViewModel";
import type { SetAddTxForm, SetTouched } from "./addTransactionTypes";

export default function TransactionTotalPreview({
    addTxForm,
    asset,
    total,
    expectedCashAmount,
    parsedFee,
    parsedTaxAmount,
    estimatedTax,
    T,
    formatEur,
    decimalSeparator,
    setAddTxForm,
    setAddTxCashTouched,
}: {
    addTxForm: AddTransactionForm;
    asset?: Asset;
    total: string | null;
    expectedCashAmount: number | null;
    parsedFee: number;
    parsedTaxAmount: number;
    estimatedTax: number;
    T: Translator;
    formatEur: (value: number) => string;
    decimalSeparator: DecimalSeparator;
    setAddTxForm: SetAddTxForm;
    setAddTxCashTouched: SetTouched;
}) {
    if (!total) return null;
    const parsedCashAmount = parseFlexibleDecimal(addTxForm.cash_amount);
    const variance =
        expectedCashAmount !== null && Number.isFinite(parsedCashAmount)
            ? parsedCashAmount - expectedCashAmount
            : null;
    const hasVariance = variance !== null && Math.abs(variance) >= 0.005;

    return (
        <div
            style={{
                textAlign: "center",
                padding: "10px 14px",
                background: "var(--card-inset)",
                borderRadius: 8,
                border: "1px solid var(--rule)",
                marginTop: -6,
            }}
        >
            <span style={{ fontSize: 12, color: "var(--fg-soft)" }}>
                {T("tx_total")}:{" "}
            </span>
            <span
                style={{
                    fontSize: 17,
                    fontWeight: 600,
                    fontFamily: "var(--font-mono)",
                    color: "var(--fg)",
                }}
            >
                {total}
            </span>
            <span
                style={{
                    fontSize: 12,
                    color: "var(--fg-soft)",
                    marginLeft: 4,
                }}
            >
                {asset?.currency || "EUR"}
            </span>
            {Number.isFinite(parsedFee) && parsedFee > 0 && (
                <div
                    style={{
                        marginTop: 6,
                        fontSize: 12,
                        color: "var(--fg-soft)",
                    }}
                >
                    {T("tx_fee")}: {formatEur(parsedFee)}
                </div>
            )}
            {estimatedTax > 0 && (
                <div
                    style={{
                        marginTop: 4,
                        fontSize: 12,
                        color: "var(--fg-soft)",
                    }}
                >
                    {T("tx_estimated_tax")}: {formatEur(estimatedTax)}
                </div>
            )}
            {addTxForm.transaction_type === "sell" &&
                addTxForm.tax_amount &&
                Number.isFinite(parsedTaxAmount) && (
                    <div
                        style={{
                            marginTop: 4,
                            fontSize: 12,
                            color: "var(--fg-soft)",
                        }}
                    >
                        {T("tx_tax_paid")}: {formatEur(parsedTaxAmount)}
                    </div>
                )}
            <div style={{ marginTop: 12, textAlign: "left" }}>
                <FieldLabel
                    text={T("tx_cash_amount")}
                    htmlFor="addtx-cash-amount"
                />
                <AmountCalculator
                    id="addtx-cash-amount"
                    data-testid="addtx-cash-amount"
                    value={addTxForm.cash_amount}
                    onChange={(value) => {
                        setAddTxCashTouched(true);
                        setAddTxForm((previous) => ({
                            ...previous,
                            cash_amount: value,
                        }));
                    }}
                    decimalSeparator={decimalSeparator}
                    placeholder="0"
                    suffix={asset?.currency || "EUR"}
                    maxDecimals={2}
                    T={T}
                />
                {hasVariance && variance !== null && (
                    <div
                        data-testid="addtx-cash-variance"
                        style={{
                            marginTop: 5,
                            color: "var(--warning)",
                            fontSize: 11,
                            lineHeight: 1.35,
                        }}
                    >
                        {T("tx_cash_amount_variance")
                            .replace(
                                "{difference}",
                                Math.abs(variance).toLocaleString(
                                    localeFromSeparator(decimalSeparator),
                                    {
                                        minimumFractionDigits: 2,
                                        maximumFractionDigits: 2,
                                    },
                                ),
                            )
                            .replace("{currency}", asset?.currency || "EUR")}
                    </div>
                )}
            </div>
        </div>
    );
}
