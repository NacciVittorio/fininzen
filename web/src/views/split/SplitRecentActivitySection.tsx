"use client";

import type { SplitExpense, SplitSettlement } from "../../api/split";
import { Card, GroupedList, ModalError } from "../../components/ui";
import { useApp } from "../../context/useApp";
import { useSplit } from "../../context/split/useSplit";
import { useFormatters } from "../../utils/useFormatters";

type SplitRecentActivitySectionProps = {
    onOpenExpense: (expense: SplitExpense) => void;
    onOpenSettlement: (settlement: SplitSettlement) => void;
};

export default function SplitRecentActivitySection({
    onOpenExpense,
    onOpenSettlement,
}: SplitRecentActivitySectionProps) {
    const { T, categories } = useApp();
    const { formatEur } = useFormatters();
    const { groups, splitActivity, splitActivityLoading, splitActivityError } =
        useSplit();
    const recent = splitActivity.slice(0, 5);

    const groupName = (groupId: number | null) =>
        groupId == null
            ? T("split_standalone_label")
            : (groups.find((group) => group.id === groupId)?.name ??
              T("split_groups_title"));

    if (splitActivityError) {
        return (
            <section style={{ marginBottom: 20 }}>
                <div className="grouped-list__title">
                    {T("split_recent_activity_title")}
                </div>
                <ModalError>{splitActivityError}</ModalError>
            </section>
        );
    }

    if (recent.length === 0) {
        return (
            <section style={{ marginBottom: 20 }}>
                <div className="grouped-list__title">
                    {T("split_recent_activity_title")}
                </div>
                <Card
                    style={{
                        padding: 20,
                        textAlign: "center",
                        color: "var(--fg-soft)",
                    }}
                    data-testid="split-recent-activity-empty"
                >
                    {splitActivityLoading
                        ? T("loading")
                        : T("split_recent_activity_empty")}
                </Card>
            </section>
        );
    }

    return (
        <GroupedList title={T("split_recent_activity_title")}>
            {recent.map((item) => {
                if (item.kind === "expense") {
                    const category = categories.find(
                        (candidate) => candidate.id === item.expense.category,
                    );
                    return (
                        <GroupedList.Item
                            key={`expense-${item.id}`}
                            testId={`split-activity-expense-${item.id}`}
                            icon={category?.icon ?? "🧾"}
                            label={item.expense.description}
                            subtitle={`${groupName(item.groupId)} · ${item.date}`}
                            value={formatEur(item.expense.amount)}
                            chevron
                            onClick={() => onOpenExpense(item.expense)}
                        />
                    );
                }

                return (
                    <GroupedList.Item
                        key={`settlement-${item.id}`}
                        testId={`split-activity-settlement-${item.id}`}
                        icon="💸"
                        label={T("split_activity_settlement")}
                        subtitle={`${groupName(item.groupId)} · ${item.date}`}
                        value={formatEur(item.settlement.amount)}
                        chevron={item.groupId != null}
                        onClick={() => onOpenSettlement(item.settlement)}
                    />
                );
            })}
        </GroupedList>
    );
}
