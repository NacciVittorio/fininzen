import type { ComponentType, ReactNode } from "react";
import { useApp } from "../../context/useApp";
import { useFormatters } from "../../utils/useFormatters";
import PrivacyValueRaw from "../PrivacyValue";

// PrivacyValue is still .jsx; consume it loosely until it migrates.
const PrivacyValue = PrivacyValueRaw as unknown as ComponentType<
    Record<string, unknown>
>;

// One summary card replacing the old 3-KpiCard strip: big net balance for the
// month (red only when negative), an income/expense split bar, and two tappable
// totals that toggle the type filter. Net / income / outcome are computed by the
// caller from cfSummary (verified-only, backend formula) — this card only renders.
type LegendButtonProps = {
    dotColor: string;
    label: ReactNode;
    children?: ReactNode;
    active: boolean;
    activeBg: string;
    activeRing: string;
    onClick: () => void;
    testId?: string;
};

function LegendButton({
    dotColor,
    label,
    children,
    active,
    activeBg,
    activeRing,
    onClick,
    testId,
}: LegendButtonProps) {
    return (
        <button
            type="button"
            data-testid={testId}
            onClick={onClick}
            aria-pressed={active}
            style={{
                flex: 1,
                textAlign: "left",
                border: 0,
                cursor: "pointer",
                borderRadius: 12,
                padding: "8px 10px",
                background: active ? activeBg : "transparent",
                outline: active ? `1.5px solid ${activeRing}` : "none",
                fontFamily: "inherit",
                minWidth: 0,
            }}
        >
            <span
                style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: 12.5,
                    color: "var(--fg-soft)",
                    fontWeight: 600,
                }}
            >
                <span
                    aria-hidden="true"
                    style={{
                        width: 8,
                        height: 8,
                        borderRadius: 99,
                        background: dotColor,
                        flexShrink: 0,
                    }}
                />
                {label}
            </span>
            <span
                style={{
                    display: "block",
                    fontSize: 17,
                    fontWeight: 700,
                    color: "var(--fg)",
                    marginTop: 2,
                    fontVariantNumeric: "tabular-nums",
                }}
            >
                {children}
            </span>
        </button>
    );
}

type CfSummaryCardProps = {
    monthLabel: string;
    net: number;
    income: number;
    outcome: number;
    activeType?: string | null;
    onToggleType: (type: string) => void;
};

export default function CfSummaryCard({
    monthLabel,
    net,
    income,
    outcome,
    activeType,
    onToggleType,
}: CfSummaryCardProps) {
    const { T } = useApp();
    const { formatEur } = useFormatters();
    const total = income + outcome;
    const expPct = total > 0 ? Math.round((outcome / total) * 100) : 50;
    const incPct = 100 - expPct;
    const netNegative = net < 0;

    return (
        <div
            style={{
                background: "var(--card)",
                border: "1px solid var(--rule)",
                borderRadius: "var(--r-card)",
                boxShadow: "var(--shadow-soft)",
                padding: "16px 18px 15px",
                marginBottom: 14,
            }}
        >
            <div
                style={{
                    fontSize: 13,
                    color: "var(--fg-soft)",
                    fontWeight: 600,
                }}
            >
                {T("cf_balance_of").replace("{month}", monthLabel)}
            </div>
            <div style={{ marginTop: 2 }}>
                <span
                    style={{
                        fontSize: 32,
                        fontWeight: 800,
                        letterSpacing: "-0.01em",
                        color: netNegative ? "var(--danger)" : "var(--fg)",
                        fontVariantNumeric: "tabular-nums",
                    }}
                >
                    <PrivacyValue
                        scope="cashflow"
                        field="deficit"
                        revealControl
                    >
                        {`${net >= 0 ? "+" : ""}${formatEur(net)}`}
                    </PrivacyValue>
                </span>
            </div>

            {/* income / expense split bar */}
            <div
                style={{
                    display: "flex",
                    height: 9,
                    borderRadius: 99,
                    overflow: "hidden",
                    marginTop: 13,
                    background: "var(--card-inset)",
                }}
            >
                <div
                    style={{
                        width: `${incPct}%`,
                        background: "var(--success)",
                    }}
                />
                <div style={{ width: 4 }} />
                <div
                    style={{
                        width: `${expPct}%`,
                        background: "var(--danger)",
                        marginLeft: -4,
                    }}
                />
            </div>

            {/* tappable totals — toggle the type filter */}
            <div style={{ display: "flex", gap: 10, marginTop: 11 }}>
                <LegendButton
                    testId="cf-kpi-income"
                    dotColor="var(--success)"
                    label={T("direction_income")}
                    active={activeType === "income"}
                    activeBg="var(--success-soft)"
                    activeRing="var(--success)"
                    onClick={() => onToggleType("income")}
                >
                    <PrivacyValue scope="cashflow" field="income">
                        {formatEur(income)}
                    </PrivacyValue>
                </LegendButton>
                <LegendButton
                    testId="cf-kpi-outcome"
                    dotColor="var(--danger)"
                    label={T("direction_expense")}
                    active={activeType === "outcome"}
                    activeBg="var(--danger-soft)"
                    activeRing="var(--danger)"
                    onClick={() => onToggleType("outcome")}
                >
                    <PrivacyValue scope="cashflow" field="outcome">
                        {formatEur(outcome)}
                    </PrivacyValue>
                </LegendButton>
            </div>
        </div>
    );
}
