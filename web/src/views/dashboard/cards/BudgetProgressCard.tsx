"use client";

import { Card, CategoryDot, ProgressBar } from "../../../components/ui";
import { SectionLabel } from "./DashboardCardPrimitives";
import type { Budget, Category } from "../../../api/types";
import type { ExpenseSummaryResponse } from "../../../api/expenses";
import type { NumericValue, Translator } from "../../../types";

type BudgetProgressCardProps = {
    budgets: Budget[];
    categories: Category[];
    expSummaryCurrentMonth: ExpenseSummaryResponse;
    T: Translator;
    formatEur: (value: NumericValue) => string;
};

export function BudgetProgressCard({
    budgets,
    categories,
    expSummaryCurrentMonth,
    T,
    formatEur,
}: BudgetProgressCardProps) {
    const activeBudgets = (budgets || []).filter((b) => Number(b.amount) > 0);
    if (activeBudgets.length === 0) return null;

    const catMap: Record<number, Category> = {};
    for (const c of categories || []) {
        catMap[c.id] = c;
    }

    const spentMap: Record<number, number> = {};
    for (const c of expSummaryCurrentMonth?.by_category || []) {
        const amount = Number(c.total || 0);
        if (c.category__id == null) continue;
        spentMap[c.category__id] = (spentMap[c.category__id] || 0) + amount;
        const cat = catMap[c.category__id];
        if (cat?.parent)
            spentMap[cat.parent] = (spentMap[cat.parent] || 0) + amount;
    }

    return (
        <Card>
            <SectionLabel>{T("dash_budget_progress")}</SectionLabel>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {activeBudgets.map((b) => {
                    const cat = catMap[b.category];
                    const spent = spentMap[b.category] || 0;
                    const limit = Number(b.amount);
                    const pct = limit > 0 ? (spent / limit) * 100 : 0;
                    const over = spent > limit;
                    return (
                        <div key={b.id} style={{ marginBottom: 8 }}>
                            <div
                                style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    alignItems: "center",
                                    marginBottom: 4,
                                    gap: 8,
                                }}
                            >
                                <span
                                    className="row"
                                    style={{
                                        fontSize: 13,
                                        color: "var(--fg)",
                                        alignItems: "center",
                                        gap: 8,
                                        minWidth: 0,
                                    }}
                                >
                                    <CategoryDot
                                        color={cat?.color || "var(--fg-faint)"}
                                    />
                                    <span
                                        style={{
                                            whiteSpace: "nowrap",
                                            overflow: "hidden",
                                            textOverflow: "ellipsis",
                                        }}
                                    >
                                        {cat?.name || "—"}
                                    </span>
                                </span>
                                <span
                                    className="num"
                                    style={{
                                        fontSize: 12,
                                        color: over
                                            ? "var(--danger)"
                                            : "var(--fg-soft)",
                                        flexShrink: 0,
                                    }}
                                >
                                    {formatEur(spent)} / {formatEur(limit)}
                                </span>
                            </div>
                            <ProgressBar
                                value={spent}
                                max={limit}
                                tone={
                                    over
                                        ? "danger"
                                        : pct > 80
                                          ? "warning"
                                          : "success"
                                }
                            />
                        </div>
                    );
                })}
            </div>
        </Card>
    );
}
