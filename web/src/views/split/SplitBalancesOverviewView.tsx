"use client";

import { useEffect } from "react";
import { useApp } from "../../context/useApp";
import { useSplit } from "../../context/split/useSplit";
import { Card } from "../../components/ui";
import { useFormatters } from "../../utils/useFormatters";
import { splitIdentityKey, splitIdentityLabel } from "./splitIdentity";
import type { SplitBalanceEntry } from "../../api/split";

// Cross-group per-person balance (piano sez. 6/7.5: GET /balances/overview/)
// — the number SplitView headlines, plus one "Salda" per person.
export default function SplitBalancesOverviewView({
    onSettle,
    showNet = true,
}: {
    onSettle: (entry: SplitBalanceEntry) => void;
    showNet?: boolean;
}) {
    const { T, user } = useApp();
    const { formatEur } = useFormatters();
    const { overview, overviewLoading, overviewError, loadSplitOverview } =
        useSplit();

    useEffect(() => {
        loadSplitOverview();
    }, [loadSplitOverview]);

    const net = overview.reduce((sum, entry) => sum + Number(entry.balance), 0);

    return (
        <Card
            style={{ padding: 20, marginBottom: 16 }}
            data-testid="split-balances-overview"
        >
            <div
                style={{
                    fontSize: 13,
                    color: "var(--fg-soft)",
                    marginBottom: 4,
                }}
            >
                {T("split_balance_overview_title")}
            </div>
            {showNet && (
                <div
                    data-testid="split-balances-overview-net"
                    style={{
                        fontSize: 28,
                        fontWeight: 700,
                        fontFamily: "var(--font-mono)",
                        color:
                            net === 0
                                ? "var(--fg)"
                                : net > 0
                                  ? "var(--success)"
                                  : "var(--danger)",
                        marginBottom: 14,
                    }}
                >
                    {net >= 0 ? "+" : "-"}
                    {formatEur(Math.abs(net))}
                </div>
            )}

            {overviewError && (
                <div
                    style={{
                        color: "var(--danger)",
                        fontSize: 13,
                        marginBottom: 10,
                    }}
                >
                    {overviewError}
                </div>
            )}

            {overviewLoading && overview.length === 0 ? (
                <div style={{ color: "var(--fg-soft)", fontSize: 13 }}>
                    {T("loading")}
                </div>
            ) : overview.length === 0 ? (
                <div
                    style={{ color: "var(--fg-soft)", fontSize: 13 }}
                    data-testid="split-balances-overview-empty"
                >
                    {T("split_balance_settled")}
                </div>
            ) : (
                <div
                    style={{ display: "flex", flexDirection: "column", gap: 8 }}
                >
                    {overview.map((entry) => {
                        const amount = Number(entry.balance);
                        const key = splitIdentityKey(entry);
                        return (
                            <div
                                key={key}
                                data-testid={`split-balance-row-${key}`}
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "space-between",
                                    gap: 10,
                                    padding: "8px 0",
                                    borderBottom: "1px solid var(--card-inset)",
                                }}
                            >
                                <div
                                    style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 8,
                                        minWidth: 0,
                                    }}
                                >
                                    <span
                                        aria-hidden="true"
                                        style={{
                                            width: 10,
                                            height: 10,
                                            borderRadius: "50%",
                                            background:
                                                entry.color || "var(--fg-soft)",
                                            flexShrink: 0,
                                        }}
                                    />
                                    <span
                                        style={{
                                            fontSize: 14,
                                            overflow: "hidden",
                                            textOverflow: "ellipsis",
                                            whiteSpace: "nowrap",
                                        }}
                                    >
                                        {splitIdentityLabel(entry, {
                                            myEmail: user,
                                            T,
                                        })}
                                    </span>
                                </div>
                                <div
                                    style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 10,
                                        flexShrink: 0,
                                    }}
                                >
                                    <span
                                        style={{
                                            fontSize: 13,
                                            color:
                                                amount >= 0
                                                    ? "var(--success)"
                                                    : "var(--danger)",
                                            fontWeight: 600,
                                            whiteSpace: "nowrap",
                                        }}
                                    >
                                        {amount >= 0
                                            ? T("split_balance_owes_you")
                                            : T("split_balance_you_owe")}{" "}
                                        {formatEur(Math.abs(amount))}
                                    </span>
                                    <button
                                        type="button"
                                        className="btn btn-g btn-sm"
                                        data-testid={`split-settle-btn-${key}`}
                                        onClick={() => onSettle(entry)}
                                    >
                                        {T("split_settle_up")}
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </Card>
    );
}
