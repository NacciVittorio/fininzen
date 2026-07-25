"use client";

import FieldLabel from "../../../components/FieldLabel";
import type { Translator } from "../../../types";
import type { AddTransactionForm } from "../portfolioViewModel";
import type { SetAddTxForm } from "./addTransactionTypes";

// Same shape as the CashFlow movement tabs (MovementTypeTabs): pill track,
// 44px targets, and a color-mix tint. The tint used to be `type.color + "22"`,
// which concatenated onto a var() reference and produced invalid CSS — the
// active tab silently had no background at all.
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
        { key: "buy", label: T("tx_buy"), glyph: "↓", color: "var(--success)" },
        {
            key: "sell",
            label: T("tx_sell"),
            glyph: "↑",
            color: "var(--danger)",
        },
    ];

    return (
        <div>
            <FieldLabel text={T("tx_type")} />
            <div
                style={{
                    display: "flex",
                    background: "var(--card-inset)",
                    border: "1px solid var(--rule)",
                    borderRadius: 999,
                    padding: 3,
                }}
            >
                {transactionTypes.map((type) => {
                    const active = addTxForm.transaction_type === type.key;
                    return (
                        <button
                            key={type.key}
                            type="button"
                            data-testid={`addtx-type-${type.key}`}
                            aria-pressed={active}
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
                                minHeight: 44,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                gap: 6,
                                padding: "6px 10px",
                                borderRadius: 999,
                                border: "none",
                                cursor: "pointer",
                                fontFamily: "inherit",
                                fontSize: 13,
                                fontWeight: 600,
                                background: active
                                    ? `color-mix(in srgb, ${type.color} 13%, transparent)`
                                    : "transparent",
                                color: active ? type.color : "var(--fg-soft)",
                                transition: "all 0.15s",
                            }}
                        >
                            <span
                                aria-hidden="true"
                                style={{ fontWeight: 600 }}
                            >
                                {type.glyph}
                            </span>
                            {type.label}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
