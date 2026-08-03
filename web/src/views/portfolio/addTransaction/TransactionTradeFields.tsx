"use client";

import AmountCalculator from "../../../components/AmountCalculator";
import FieldLabel from "../../../components/FieldLabel";
import type { DecimalSeparator } from "../../../utils/formatters";
import type { Asset } from "../../../api/types";
import type { Translator } from "../../../types";
import type { AddTransactionForm } from "../portfolioViewModel";
import type {
    AddTxPriceStatus,
    SetAddTxForm,
    SetTouched,
} from "./addTransactionTypes";

export default function TransactionTradeFields({
    addTxForm,
    setAddTxForm,
    setAddTxPriceTouched,
    setAddTxTaxTouched,
    addTxPriceStatus = "idle",
    asset,
    T,
    decimalSeparator,
}: {
    addTxForm: AddTransactionForm;
    setAddTxForm: SetAddTxForm;
    setAddTxPriceTouched: SetTouched;
    setAddTxTaxTouched: SetTouched;
    addTxPriceStatus?: AddTxPriceStatus;
    asset?: Asset;
    T: Translator;
    decimalSeparator: DecimalSeparator;
}) {
    // Money fields use the same calculator as the CashFlow movement forms, so
    // the currency suffix and the operator bar come for free.
    const currency = asset?.currency || "EUR";
    const amountPlaceholder = decimalSeparator === "," ? "0,00" : "0.00";

    return (
        <>
            <div>
                <FieldLabel text={T("tx_date")} htmlFor="addtx-date" />
                <div style={{ overflow: "hidden", borderRadius: 10 }}>
                    <input
                        id="addtx-date"
                        data-testid="addtx-date"
                        type="date"
                        className="inp"
                        value={addTxForm.date}
                        onChange={(event) => {
                            setAddTxPriceTouched(false);
                            setAddTxForm((previous) => ({
                                ...previous,
                                date: event.target.value,
                                price_per_share: "",
                            }));
                        }}
                    />
                </div>
            </div>

            {/* auto-fit rather than a hard 1fr 1fr: below ~320px the two fields
                would otherwise be too narrow to read. On desktop the wrapper
                becomes `display: contents` so the two fields join the sheet's
                own two-column grid instead of splitting a single column. */}
            <div className="sheet-form-pair">
                <div>
                    <FieldLabel text={T("tx_shares")} htmlFor="addtx-shares" />
                    <input
                        id="addtx-shares"
                        data-testid="addtx-shares"
                        type="text"
                        inputMode="decimal"
                        className="inp"
                        placeholder="0"
                        value={addTxForm.shares}
                        onChange={(event) =>
                            setAddTxForm((previous) => ({
                                ...previous,
                                shares: event.target.value,
                            }))
                        }
                    />
                </div>
                <div>
                    <FieldLabel text={T("tx_price")} htmlFor="addtx-price" />
                    <AmountCalculator
                        id="addtx-price"
                        data-testid="addtx-price"
                        value={addTxForm.price_per_share}
                        onChange={(value) => {
                            setAddTxPriceTouched(true);
                            setAddTxForm((previous) => ({
                                ...previous,
                                price_per_share: value,
                            }));
                        }}
                        decimalSeparator={decimalSeparator}
                        placeholder={amountPlaceholder}
                        suffix={currency}
                        maxDecimals={4}
                        T={T}
                    />
                    {/* Why the field is (still) empty: the historical-price
                        lookup is running, or the backend has no quote for the
                        chosen date and the user has to type it. */}
                    {addTxPriceStatus !== "idle" && (
                        <div
                            data-testid="addtx-price-status"
                            style={{
                                marginTop: 4,
                                fontSize: 11,
                                lineHeight: 1.35,
                                color:
                                    addTxPriceStatus === "unavailable"
                                        ? "var(--warning)"
                                        : "var(--fg-soft)",
                            }}
                        >
                            {addTxPriceStatus === "unavailable"
                                ? T("tx_price_unavailable")
                                : T("tx_autofill_hint")}
                        </div>
                    )}
                </div>
            </div>

            <div>
                <FieldLabel text={T("tx_fee")} htmlFor="addtx-fee" />
                <AmountCalculator
                    id="addtx-fee"
                    data-testid="addtx-fee"
                    value={addTxForm.fee}
                    onChange={(value) =>
                        setAddTxForm((previous) => ({
                            ...previous,
                            fee: value,
                        }))
                    }
                    decimalSeparator={decimalSeparator}
                    placeholder={amountPlaceholder}
                    suffix={currency}
                    T={T}
                />
            </div>

            {addTxForm.transaction_type === "sell" && (
                <div>
                    <FieldLabel text={T("tx_tax_paid")} htmlFor="addtx-tax" />
                    <AmountCalculator
                        id="addtx-tax"
                        data-testid="addtx-tax"
                        value={addTxForm.tax_amount}
                        onChange={(value) => {
                            setAddTxTaxTouched(true);
                            setAddTxForm((previous) => ({
                                ...previous,
                                tax_amount: value,
                            }));
                        }}
                        decimalSeparator={decimalSeparator}
                        placeholder={amountPlaceholder}
                        suffix={currency}
                        T={T}
                    />
                </div>
            )}
        </>
    );
}
