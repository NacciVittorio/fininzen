"use client";

import type { ComponentType, ReactNode } from "react";
import { useApp } from "../../context/useApp";
import { useFormatters } from "../../utils/useFormatters";
import type { Translator } from "../../types";
import PrivacyValueRaw from "../PrivacyValue";

// PrivacyValue is still .jsx; consume it loosely until it migrates.
const PrivacyValue = PrivacyValueRaw as unknown as ComponentType<
    Record<string, unknown>
>;

// One summary card leading with the month's BALANCE (income − outcome, signed
// and coloured), a "spent as a share of income" gauge that explains that
// balance, and two tappable totals that toggle the type filter. Income vs
// expense is signalled by an arrow glyph (↑/↓) in addition to colour, so the
// distinction survives without colour perception. Net / income / outcome are
// computed by the caller from cfSummary (verified-only, backend formula) — this
// card only renders.
type LegendButtonProps = {
    dotColor: string;
    arrow: string;
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
    arrow,
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
                minHeight: 44,
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
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: 16,
                        height: 16,
                        borderRadius: 99,
                        background: dotColor,
                        color: "#fff",
                        fontSize: 11,
                        fontWeight: 600,
                        lineHeight: 1,
                        flexShrink: 0,
                    }}
                >
                    {arrow}
                </span>
                {label}
            </span>
            <span
                style={{
                    display: "block",
                    fontSize: 18,
                    fontWeight: 600,
                    color: "var(--fg)",
                    marginTop: 3,
                    fontVariantNumeric: "tabular-nums",
                }}
            >
                {children}
            </span>
        </button>
    );
}

// "Spent as a share of income" gauge. The track represents the month's income
// (100% = break-even); the red fill is what was spent against it, so the empty
// tail reads as what was saved. When spending exceeds income the track instead
// spans the spend, a break-even notch marks where income ran out, and the
// overspill past it is drawn in a stronger red. The caption below carries the
// meaning (the bar itself is aria-hidden).
function SpendGauge({
    income,
    outcome,
    T,
}: {
    income: number;
    outcome: number;
    T: Translator;
}) {
    const caption = (text: string) => (
        <div
            style={{
                marginTop: 7,
                fontSize: 13,
                fontWeight: 600,
                color: "var(--fg-soft)",
            }}
        >
            {text}
        </div>
    );
    const track = (children?: ReactNode, background = "var(--card-inset)") => (
        <div
            aria-hidden="true"
            style={{
                position: "relative",
                display: "flex",
                height: 9,
                borderRadius: 99,
                overflow: "hidden",
                background,
            }}
        >
            {children}
        </div>
    );

    // No income to measure spend against.
    if (income <= 0) {
        if (outcome <= 0) return null;
        return (
            <div style={{ marginTop: 13 }}>
                {track(
                    <div style={{ width: "100%", background: "var(--danger)" }} />,
                )}
                {caption(T("no_income_period"))}
            </div>
        );
    }

    const spentPct = Math.round((outcome / income) * 100);

    if (outcome > income) {
        // Overspend: the bar spans the spend; break-even sits at income/outcome.
        const breakEvenPct = (income / outcome) * 100;
        const deficitPct = spentPct - 100;
        return (
            <div style={{ marginTop: 13 }}>
                {track(
                    <>
                        <div
                            style={{
                                width: `${breakEvenPct}%`,
                                background: "var(--danger)",
                            }}
                        />
                        <div
                            style={{
                                flex: 1,
                                background:
                                    "color-mix(in oklab, var(--danger) 70%, var(--fg))",
                            }}
                        />
                        {/* break-even notch */}
                        <div
                            style={{
                                position: "absolute",
                                top: -1,
                                bottom: -1,
                                left: `${breakEvenPct}%`,
                                width: 2,
                                marginLeft: -1,
                                background: "var(--card)",
                            }}
                        />
                    </>,
                )}
                {caption(
                    `${T("cf_spent_of_income").replace("{pct}", String(spentPct))} · ${T(
                        "cf_deficit_pct",
                    ).replace("{pct}", String(deficitPct))}`,
                )}
            </div>
        );
    }

    // Normal: red fill is the spend, empty tail is what was saved.
    const savedPct = Math.max(0, 100 - spentPct);
    return (
        <div style={{ marginTop: 13 }}>
            {track(
                <div
                    style={{
                        width: `${spentPct}%`,
                        background: "var(--danger)",
                    }}
                />,
                "var(--success-soft)",
            )}
            {caption(
                `${T("cf_spent_of_income").replace("{pct}", String(spentPct))} · ${T(
                    "cf_saved_pct",
                ).replace("{pct}", String(savedPct))}`,
            )}
        </div>
    );
}

type CfSummaryCardProps = {
    monthLabel: string;
    net: number;
    income: number;
    outcome: number;
    activeType?: string | null;
    onToggleType: (type: string) => void;
    // Full-width period control pinned above the numbers it governs. A slot
    // rather than month/year props: the caller already owns the month-vs-year
    // branch, and this card stays presentational.
    pager?: ReactNode;
};

export default function CfSummaryCard({
    monthLabel,
    net,
    income,
    outcome,
    activeType,
    onToggleType,
    pager,
}: CfSummaryCardProps) {
    const { T } = useApp();
    const { formatEur } = useFormatters();
    const netNegative = net < 0;

    return (
        <div
            style={{
                background: "var(--card)",
                border: "1px solid var(--rule)",
                borderRadius: "var(--r-card)",
                boxShadow: "var(--shadow-soft)",
                padding: "14px 20px 16px",
                marginBottom: 14,
            }}
        >
            {pager && (
                <div
                    style={{
                        paddingBottom: 14,
                        marginBottom: 14,
                        borderBottom: "1px solid var(--rule-soft)",
                    }}
                >
                    {pager}
                </div>
            )}

            {/* headline: the month's balance (income − outcome), signed and
                coloured by sign */}
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
                        fontSize: 38,
                        fontWeight: 600,
                        letterSpacing: "-0.5px",
                        color: netNegative ? "var(--danger)" : "var(--success)",
                        fontVariantNumeric: "tabular-nums",
                    }}
                >
                    <PrivacyValue scope="cashflow" field="deficit" revealControl>
                        {`${net >= 0 ? "+" : ""}${formatEur(net)}`}
                    </PrivacyValue>
                </span>
            </div>

            {/* spent-as-a-share-of-income gauge (explains the balance above) */}
            <SpendGauge income={income} outcome={outcome} T={T} />

            {/* tappable totals — toggle the type filter */}
            <div style={{ display: "flex", gap: 10, marginTop: 11 }}>
                <LegendButton
                    testId="cf-kpi-income"
                    dotColor="var(--success)"
                    arrow="↑"
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
                    arrow="↓"
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
