import FieldLabel from "../../../components/FieldLabel";
import CurrencyInputShell from "./CurrencyInputShell";
import type { Asset } from "../../../api/types";
import type { Translator } from "../../../types";
import type { AddTransactionForm } from "../portfolioViewModel";
import type { SetAddTxForm, SetTouched } from "./addTransactionTypes";

export default function TransactionTradeFields({
    addTxForm,
    setAddTxForm,
    setAddTxPriceTouched,
    setAddTxTaxTouched,
    asset,
    T,
}: {
    addTxForm: AddTransactionForm;
    setAddTxForm: SetAddTxForm;
    setAddTxPriceTouched: SetTouched;
    setAddTxTaxTouched: SetTouched;
    asset?: Asset;
    T: Translator;
}) {
    return (
        <>
            <div>
                <FieldLabel text={T("tx_date")} />
                <div style={{ overflow: "hidden", borderRadius: 10 }}>
                    <input
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

            <div
                style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 10,
                }}
            >
                <div>
                    <FieldLabel text={T("tx_shares")} />
                    <input
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
                    <FieldLabel text={T("tx_price")} />
                    <CurrencyInputShell asset={asset}>
                        <input
                            type="text"
                            inputMode="decimal"
                            className="inp"
                            placeholder="0.00"
                            style={{ paddingRight: 46 }}
                            value={addTxForm.price_per_share}
                            onChange={(event) => {
                                setAddTxPriceTouched(true);
                                setAddTxForm((previous) => ({
                                    ...previous,
                                    price_per_share: event.target.value,
                                }));
                            }}
                        />
                    </CurrencyInputShell>
                </div>
            </div>

            <div>
                <FieldLabel text={T("tx_fee")} />
                <CurrencyInputShell asset={asset}>
                    <input
                        type="text"
                        inputMode="decimal"
                        className="inp"
                        placeholder="0.00"
                        style={{ paddingRight: 46 }}
                        value={addTxForm.fee}
                        onChange={(event) =>
                            setAddTxForm((previous) => ({
                                ...previous,
                                fee: event.target.value,
                            }))
                        }
                    />
                </CurrencyInputShell>
            </div>

            {addTxForm.transaction_type === "sell" && (
                <div>
                    <FieldLabel text={T("tx_tax_paid")} />
                    <CurrencyInputShell asset={asset}>
                        <input
                            type="text"
                            inputMode="decimal"
                            className="inp"
                            placeholder="0.00"
                            style={{ paddingRight: 46 }}
                            value={addTxForm.tax_amount}
                            onChange={(event) => {
                                setAddTxTaxTouched(true);
                                setAddTxForm((previous) => ({
                                    ...previous,
                                    tax_amount: event.target.value,
                                }));
                            }}
                        />
                    </CurrencyInputShell>
                </div>
            )}
        </>
    );
}
