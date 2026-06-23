import FieldLabel from "../../../components/FieldLabel";
import type { Translator } from "../../../types";
import type { AddTransactionForm } from "../portfolioViewModel";
import type { SetAddTxForm } from "./addTransactionTypes";

export default function TransactionTypeToggle({
    addTxForm,
    setAddTxForm,
    T,
}: {
    addTxForm: AddTransactionForm;
    setAddTxForm: SetAddTxForm;
    T: Translator;
}) {
    const transactionTypes = [
        { key: "buy", label: T("tx_buy"), color: "var(--success)" },
        { key: "sell", label: T("tx_sell"), color: "var(--danger)" },
    ];

    return (
        <div>
            <FieldLabel text={T("tx_type")} />
            <div
                style={{
                    display: "flex",
                    background: "var(--card-inset)",
                    border: "1px solid var(--rule)",
                    borderRadius: 8,
                    padding: 3,
                }}
            >
                {transactionTypes.map((type) => (
                    <button
                        key={type.key}
                        type="button"
                        onClick={() =>
                            setAddTxForm((previous) => ({
                                ...previous,
                                transaction_type: type.key,
                                contribution_source:
                                    type.key === "buy"
                                        ? previous.contribution_source
                                        : "",
                            }))
                        }
                        style={{
                            flex: 1,
                            padding: "8px 10px",
                            borderRadius: 6,
                            border: "none",
                            cursor: "pointer",
                            fontFamily: "inherit",
                            fontSize: 13,
                            fontWeight: 700,
                            background:
                                addTxForm.transaction_type === type.key
                                    ? type.color + "22"
                                    : "transparent",
                            color:
                                addTxForm.transaction_type === type.key
                                    ? type.color
                                    : "var(--fg-soft)",
                            transition: "all 0.15s",
                        }}
                    >
                        {type.label}
                    </button>
                ))}
            </div>
        </div>
    );
}
