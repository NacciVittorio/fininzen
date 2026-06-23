import type { Dispatch, SetStateAction } from "react";
import FieldLabel from "../../../components/FieldLabel";
import type { Translator } from "../../../types";
import type { ExpenseForm, TransferForm } from "../../../context/formBuilders";

export default function MovementTypeTabs({
    modalDir,
    setModalDir,
    setExpForm,
    setTransferForm,
    T,
}: {
    modalDir: string;
    setModalDir: (dir: string) => void;
    setExpForm: Dispatch<SetStateAction<ExpenseForm>>;
    setTransferForm: Dispatch<SetStateAction<TransferForm>>;
    T: Translator;
}) {
    return (
        <div>
            <FieldLabel text={T("label_type")} />
            <div
                style={{
                    display: "flex",
                    background: "rgba(0,0,0,0.22)",
                    border: "1px solid var(--rule)",
                    borderRadius: 8,
                    padding: 3,
                }}
            >
                {[
                    {
                        key: "expense",
                        label: T("direction_expense"),
                        color: "var(--danger)",
                    },
                    {
                        key: "income",
                        label: T("direction_income"),
                        color: "var(--success)",
                    },
                    {
                        key: "transfer",
                        label: T("direction_transfer"),
                        color: "var(--chart-4)",
                    },
                ].map((type) => (
                    <button
                        key={type.key}
                        onClick={() => {
                            setModalDir(type.key);
                            setExpForm((previous) => ({
                                ...previous,
                                category: "",
                            }));
                            if (type.key === "transfer") {
                                setTransferForm({
                                    from_account_id: "",
                                    to_account_id: "",
                                    amount: "",
                                    date: new Date().toISOString().slice(0, 10),
                                    notes: "",
                                    is_verified: false,
                                });
                            }
                        }}
                        style={{
                            flex: 1,
                            padding: "6px 10px",
                            borderRadius: 6,
                            border: "none",
                            cursor: "pointer",
                            fontFamily: "inherit",
                            fontSize: 12,
                            fontWeight: 600,
                            background:
                                modalDir === type.key
                                    ? type.color + "22"
                                    : "transparent",
                            color:
                                modalDir === type.key
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
