"use client";

import type { Dispatch, SetStateAction } from "react";
import { Card } from "../../components/ui";
import { useAuth } from "../../context/useAuth";
import type {
    ResetResult,
    ResetTarget,
} from "../../context/useAppProviderState";

export function ExtraSettingsSection({
    resetMsg,
    setResetConfirm,
    setResetUnderstood,
    setDemoConfirm,
    setDemoUnderstood,
}: {
    resetMsg: ResetResult | null;
    setResetConfirm: Dispatch<SetStateAction<ResetTarget | null>>;
    setResetUnderstood: Dispatch<SetStateAction<boolean>>;
    setDemoConfirm: Dispatch<SetStateAction<boolean>>;
    setDemoUnderstood: Dispatch<SetStateAction<boolean>>;
}) {
    const { T, isFeatureEnabled } = useAuth();

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {isFeatureEnabled("cashflow") && (
                <Card
                    variant="settings"
                    tone="danger"
                    title={T("reset_transactions")}
                    description={T("reset_transactions_desc")}
                >
                    <button
                        className="btn btn-r"
                        style={{ width: "100%" }}
                        onClick={() => {
                            setResetConfirm("transactions");
                            setResetUnderstood(false);
                        }}
                    >
                        {T("reset_transactions")}
                    </button>
                </Card>
            )}

            {(isFeatureEnabled("accounts") ||
                isFeatureEnabled("investments")) && (
                <Card
                    variant="settings"
                    tone="danger"
                    title={T("reset_portfolio")}
                    description={T("reset_portfolio_desc")}
                >
                    <button
                        className="btn btn-r"
                        style={{ width: "100%" }}
                        onClick={() => {
                            setResetConfirm("portfolio");
                            setResetUnderstood(false);
                        }}
                    >
                        {T("reset_portfolio")}
                    </button>
                </Card>
            )}

            {resetMsg && (
                <div
                    style={{
                        padding: "12px 14px",
                        borderRadius: 10,
                        fontSize: 13,
                        background:
                            resetMsg.deleted > 0
                                ? "var(--success-soft)"
                                : "var(--rule)",
                        color:
                            resetMsg.deleted > 0
                                ? "var(--success)"
                                : "var(--fg-soft)",
                        border: `1px solid ${
                            resetMsg.deleted > 0
                                ? "var(--success-soft)"
                                : "var(--rule)"
                        }`,
                    }}
                >
                    {resetMsg.deleted > 0
                        ? `${T("reset_success")} (${resetMsg.deleted})`
                        : T("reset_empty")}
                </div>
            )}

            <Card
                variant="settings"
                title={T("load_demo")}
                description={T("load_demo_desc")}
            >
                <button
                    className="btn"
                    style={{
                        width: "100%",
                        background: "var(--accent-ring)",
                        color: "var(--accent)",
                        border: "1px solid var(--accent-ring)",
                    }}
                    onClick={() => {
                        setDemoConfirm(true);
                        setDemoUnderstood(false);
                    }}
                >
                    {T("load_demo")}
                </button>
            </Card>
        </div>
    );
}
