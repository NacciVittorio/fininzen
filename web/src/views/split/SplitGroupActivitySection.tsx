"use client";

import type { SplitExpense, SplitSettlement } from "../../api/split";
import { Card } from "../../components/ui";
import { useApp } from "../../context/useApp";
import { useFormatters } from "../../utils/useFormatters";
import SplitActionRow from "./SplitActionRow";
import SplitSettlementBadge from "./SplitSettlementBadge";

type ActivityItem =
    | { kind: "expense"; expense: SplitExpense }
    | { kind: "settlement"; settlement: SplitSettlement };

export default function SplitGroupActivitySection({
    expenses,
    settlements,
    canEditExpense,
    canDeleteSettlement,
    settlementPartyLabel,
    settlementAmountColor,
    onEditExpense,
    onDeleteExpense,
    onDeleteSettlement,
}: {
    expenses: SplitExpense[];
    settlements: SplitSettlement[];
    canEditExpense: (expense: SplitExpense) => boolean;
    canDeleteSettlement: (settlement: SplitSettlement) => boolean;
    settlementPartyLabel: (
        settlement: SplitSettlement,
        side: "payer" | "payee",
    ) => string;
    settlementAmountColor: (settlement: SplitSettlement) => string;
    onEditExpense: (expense: SplitExpense) => void;
    onDeleteExpense: (expense: SplitExpense) => void;
    onDeleteSettlement: (settlement: SplitSettlement) => void;
}) {
    const { T, categories } = useApp();
    const { formatEur } = useFormatters();
    const activity: ActivityItem[] = [
        ...expenses.map((expense): ActivityItem => ({
            kind: "expense",
            expense,
        })),
        ...settlements.map((settlement): ActivityItem => ({
            kind: "settlement",
            settlement,
        })),
    ].sort((a, b) => {
        const aItem = a.kind === "expense" ? a.expense : a.settlement;
        const bItem = b.kind === "expense" ? b.expense : b.settlement;
        return (
            bItem.date.localeCompare(aItem.date) ||
            bItem.created_at.localeCompare(aItem.created_at)
        );
    });

    return (
        <section className="split-group-activity">
            <div className="grouped-list__title">
                {T("split_group_activity_title")}
            </div>
            {activity.length === 0 ? (
                <Card
                    className="split-empty-state"
                    data-testid="split-group-activity-empty"
                >
                    {T("split_group_activity_empty")}
                </Card>
            ) : (
                <div className="grouped-list">
                    {activity.map((item) => {
                        if (item.kind === "expense") {
                            const expense = item.expense;
                            const category = categories.find(
                                (candidate) =>
                                    candidate.id === expense.category,
                            );
                            const editable = canEditExpense(expense);
                            return (
                                <SplitActionRow
                                    key={`expense-${expense.id}`}
                                    rowId={`expense-${expense.id}`}
                                    testId={`split-expense-row-${expense.id}`}
                                    icon={category?.icon ?? "🧾"}
                                    label={expense.description}
                                    subtitle={expense.date}
                                    value={
                                        <span className="split-activity-value">
                                            <strong>
                                                {formatEur(expense.amount)}
                                            </strong>
                                            <SplitSettlementBadge
                                                percentage={
                                                    expense.settlement_progress
                                                        .percentage
                                                }
                                                T={T}
                                                testId={`split-expense-settlement-badge-${expense.id}`}
                                            />
                                        </span>
                                    }
                                    onOpen={
                                        editable
                                            ? () => onEditExpense(expense)
                                            : undefined
                                    }
                                    onEdit={
                                        editable
                                            ? () => onEditExpense(expense)
                                            : undefined
                                    }
                                    onDelete={
                                        editable
                                            ? () => onDeleteExpense(expense)
                                            : undefined
                                    }
                                    editTestId={`split-expense-edit-${expense.id}`}
                                    deleteTestId={`split-expense-delete-${expense.id}`}
                                />
                            );
                        }

                        const settlement = item.settlement;
                        const deletable = canDeleteSettlement(settlement);
                        return (
                            <SplitActionRow
                                key={`settlement-${settlement.id}`}
                                rowId={`settlement-${settlement.id}`}
                                testId={`split-settlement-row-${settlement.id}`}
                                icon="💸"
                                label={`${settlementPartyLabel(settlement, "payer")} → ${settlementPartyLabel(settlement, "payee")}`}
                                subtitle={settlement.date}
                                value={
                                    <strong
                                        style={{
                                            color: settlementAmountColor(
                                                settlement,
                                            ),
                                        }}
                                    >
                                        {formatEur(settlement.amount)}
                                    </strong>
                                }
                                onDelete={
                                    deletable
                                        ? () => onDeleteSettlement(settlement)
                                        : undefined
                                }
                                deleteTestId={`split-settlement-delete-${settlement.id}`}
                            />
                        );
                    })}
                </div>
            )}

            {expenses.length === 0 && (
                <div
                    className="split-activity-empty-note"
                    data-testid="split-group-expenses-empty"
                >
                    {T("split_group_expenses_empty")}
                </div>
            )}
            {settlements.length === 0 && (
                <div
                    className="split-activity-empty-note"
                    data-testid="split-group-settlements-empty"
                >
                    {T("split_group_settlements_empty")}
                </div>
            )}
        </section>
    );
}
