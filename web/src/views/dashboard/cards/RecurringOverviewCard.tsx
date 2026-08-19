"use client";

import { CategoryDot, Card } from "../../../components/ui";
import { EmptyCardText, SectionLabel } from "./DashboardCardPrimitives";
import type { RecurringStatusResponse } from "../../../api/expenses";
import type { NumericValue, Translator } from "../../../types";

type RecurringOverviewCardProps = {
    recurringStatus: RecurringStatusResponse | null;
    T: Translator;
    formatEur: (value: NumericValue) => string;
};

export function RecurringOverviewCard({
    recurringStatus,
    T,
    formatEur,
}: RecurringOverviewCardProps) {
    const summary = recurringStatus?.summary || {
        generated: 0,
        pending: 0,
        total: 0,
    };
    const items = recurringStatus?.items || [];

    return (
        <Card>
            <div className="between" style={{ marginBottom: 12 }}>
                <SectionLabel>{T("dash_recurring_overview")}</SectionLabel>
                <span
                    className="num"
                    style={{ fontSize: 12, color: "var(--fg-soft)" }}
                >
                    {summary.generated}/{summary.total}
                </span>
            </div>
            {items.length === 0 ? (
                <EmptyCardText>{T("no_recurring")}</EmptyCardText>
            ) : (
                <div style={{ flex: "1 1 auto" }}>
                    {items.map((it, idx) => {
                        const isGenerated = it.status === "generated";
                        return (
                            <div
                                key={it.id}
                                className="between"
                                style={{
                                    padding: "9px 2px",
                                    borderBottom:
                                        idx < items.length - 1
                                            ? "1px solid var(--rule)"
                                            : "none",
                                }}
                            >
                                <div
                                    className="row"
                                    style={{
                                        gap: 8,
                                        alignItems: "center",
                                        minWidth: 0,
                                    }}
                                >
                                    <CategoryDot
                                        color={
                                            isGenerated
                                                ? "var(--success)"
                                                : "var(--warning)"
                                        }
                                    />
                                    <span
                                        style={{
                                            fontSize: 13,
                                            whiteSpace: "nowrap",
                                            overflow: "hidden",
                                            textOverflow: "ellipsis",
                                        }}
                                    >
                                        {it.description}
                                    </span>
                                    <span
                                        className="num"
                                        style={{
                                            fontSize: 11,
                                            color: "var(--fg-faint)",
                                            flexShrink: 0,
                                        }}
                                    >
                                        · {T("recurring_day")} {it.day_of_month}
                                    </span>
                                </div>
                                <span
                                    className="num"
                                    style={{
                                        fontSize: 13,
                                        fontWeight: 600,
                                        color: isGenerated
                                            ? "var(--fg-soft)"
                                            : "var(--fg)",
                                        flexShrink: 0,
                                    }}
                                >
                                    {formatEur(it.amount)}
                                </span>
                            </div>
                        );
                    })}
                </div>
            )}
        </Card>
    );
}
