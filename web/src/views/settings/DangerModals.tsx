"use client";

import type { Dispatch, SetStateAction } from "react";
import Modal from "../../components/Modal";
import type { ResetTarget } from "../../context/useAppProviderState";
import type { Translator } from "../../types";

export function DangerModals({
    T,
    resetConfirm,
    setResetConfirm,
    resetUnderstood,
    setResetUnderstood,
    resetTransactions,
    resetPortfolio,
    demoConfirm,
    setDemoConfirm,
    demoUnderstood,
    setDemoUnderstood,
    demoError,
    setDemoError,
    demoLoading,
    setDemoLoading,
    loadDemoData,
}: {
    T: Translator;
    resetConfirm: ResetTarget | null;
    setResetConfirm: Dispatch<SetStateAction<ResetTarget | null>>;
    resetUnderstood: boolean;
    setResetUnderstood: Dispatch<SetStateAction<boolean>>;
    resetTransactions: () => void;
    resetPortfolio: () => void;
    demoConfirm: boolean;
    setDemoConfirm: Dispatch<SetStateAction<boolean>>;
    demoUnderstood: boolean;
    setDemoUnderstood: Dispatch<SetStateAction<boolean>>;
    demoError: string;
    setDemoError: Dispatch<SetStateAction<string>>;
    demoLoading: boolean;
    setDemoLoading: Dispatch<SetStateAction<boolean>>;
    loadDemoData: () => void;
}) {
    return (
        <>
            {resetConfirm && (
                <Modal
                    title={T("modal_are_you_sure")}
                    onClose={() => {
                        setResetConfirm(null);
                        setResetUnderstood(false);
                    }}
                >
                    <div
                        style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 16,
                        }}
                    >
                        <div style={{ fontSize: 13, color: "var(--fg-soft)" }}>
                            {resetConfirm === "transactions"
                                ? `${T("reset_transactions_desc")} ${T("action_cannot_be_undone")}`
                                : `${T("reset_portfolio_desc")} ${T("action_cannot_be_undone")}`}
                        </div>
                        <label
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 10,
                                cursor: "pointer",
                                background: "var(--card-inset)",
                                borderRadius: 10,
                                padding: "12px 14px",
                                border: "1px solid var(--rule)",
                                fontSize: 13,
                                color: "var(--fg)",
                            }}
                        >
                            <input
                                type="checkbox"
                                checked={resetUnderstood}
                                onChange={(e) =>
                                    setResetUnderstood(e.target.checked)
                                }
                            />
                            {T("understand_checkbox")}
                        </label>
                        <div
                            className="row"
                            style={{ justifyContent: "flex-end", gap: 8 }}
                        >
                            <button
                                className="btn btn-g"
                                onClick={() => {
                                    setResetConfirm(null);
                                    setResetUnderstood(false);
                                }}
                            >
                                {T("btn_cancel")}
                            </button>
                            <button
                                className="btn"
                                disabled={!resetUnderstood}
                                style={{
                                    background: resetUnderstood
                                        ? "var(--danger)"
                                        : "var(--danger)",
                                    color: resetUnderstood
                                        ? "var(--btn-primary-fg)"
                                        : "var(--fg-soft)",
                                    padding: "10px 18px",
                                    cursor: resetUnderstood
                                        ? "pointer"
                                        : "not-allowed",
                                    border: "none",
                                    borderRadius: 10,
                                    fontFamily: "inherit",
                                    fontSize: 14,
                                    fontWeight: 500,
                                }}
                                onClick={
                                    resetConfirm === "transactions"
                                        ? resetTransactions
                                        : resetPortfolio
                                }
                            >
                                {T("btn_confirm")}
                            </button>
                        </div>
                    </div>
                </Modal>
            )}

            {demoConfirm && (
                <Modal
                    title={T("load_demo")}
                    onClose={() => {
                        setDemoConfirm(false);
                        setDemoUnderstood(false);
                        setDemoError("");
                        setDemoLoading(false);
                    }}
                >
                    <div
                        style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 16,
                        }}
                    >
                        <div style={{ fontSize: 13, color: "var(--fg-soft)" }}>
                            {T("demo_warning")}
                        </div>
                        <label
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 10,
                                cursor: "pointer",
                                background: "var(--card-inset)",
                                borderRadius: 10,
                                padding: "12px 14px",
                                border: "1px solid var(--rule)",
                                fontSize: 13,
                                color: "var(--fg)",
                            }}
                        >
                            <input
                                type="checkbox"
                                checked={demoUnderstood}
                                onChange={(e) =>
                                    setDemoUnderstood(e.target.checked)
                                }
                            />
                            {T("demo_checkbox")}
                        </label>
                        {demoError && (
                            <div
                                style={{ fontSize: 12, color: "var(--danger)" }}
                            >
                                {demoError}
                            </div>
                        )}
                        <div
                            className="row"
                            style={{ justifyContent: "flex-end", gap: 8 }}
                        >
                            <button
                                className="btn btn-g"
                                onClick={() => {
                                    setDemoConfirm(false);
                                    setDemoUnderstood(false);
                                    setDemoError("");
                                }}
                            >
                                {T("btn_cancel")}
                            </button>
                            <button
                                className="btn"
                                disabled={!demoUnderstood || demoLoading}
                                style={{
                                    background: demoUnderstood
                                        ? "var(--accent)"
                                        : "var(--accent-ring)",
                                    color: demoUnderstood
                                        ? "var(--btn-primary-fg)"
                                        : "var(--fg-soft)",
                                    padding: "10px 18px",
                                    cursor:
                                        demoUnderstood && !demoLoading
                                            ? "pointer"
                                            : "not-allowed",
                                    border: "none",
                                    borderRadius: 10,
                                    fontFamily: "inherit",
                                    fontSize: 14,
                                    fontWeight: 500,
                                }}
                                onClick={loadDemoData}
                            >
                                {demoLoading ? "..." : T("load_demo")}
                            </button>
                        </div>
                    </div>
                </Modal>
            )}
        </>
    );
}
