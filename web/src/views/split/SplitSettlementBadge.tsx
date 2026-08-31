"use client";

import type { Translator } from "../../types";

type SplitSettlementBadgeProps = {
    percentage: number;
    T: Translator;
    testId?: string;
};

// Shared by SplitGroupDetailView and SplitStandaloneExpensesSection so both
// expense lists render the same discreet pill. Renders nothing at 100% —
// a fully-settled expense needs no callout, only partial ones do (piano:
// "nascosto del tutto quando percentage === 100").
export default function SplitSettlementBadge({
    percentage,
    T,
    testId,
}: SplitSettlementBadgeProps) {
    if (percentage >= 100) return null;
    return (
        <span
            data-testid={testId}
            style={{
                fontSize: 10,
                fontWeight: 600,
                padding: "2px 6px",
                borderRadius: 999,
                background: "var(--card-inset)",
                color: "var(--fg-soft)",
                whiteSpace: "nowrap",
            }}
        >
            {T("split_expense_settlement_badge").replace(
                "{percentage}",
                String(percentage),
            )}
        </span>
    );
}
