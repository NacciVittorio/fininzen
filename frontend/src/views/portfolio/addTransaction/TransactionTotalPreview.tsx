import type { Asset } from "../../../api/types";
import type { Translator } from "../../../types";
import type { AddTransactionForm } from "../portfolioViewModel";

export default function TransactionTotalPreview({
    addTxForm,
    asset,
    total,
    parsedFee,
    parsedTaxAmount,
    estimatedTax,
    T,
    formatEur,
}: {
    addTxForm: AddTransactionForm;
    asset?: Asset;
    total: string | null;
    parsedFee: number;
    parsedTaxAmount: number;
    estimatedTax: number;
    T: Translator;
    formatEur: (value: number) => string;
}) {
    if (!total) return null;

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
                    fontWeight: 700,
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
        </div>
    );
}
