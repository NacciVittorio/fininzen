"use client";

import { useEffect, useState } from "react";
import { useApp } from "../../context/useApp";
import { useSplit } from "../../context/split/useSplit";
import { Card, GroupedList, ModalError } from "../../components/ui";
import Modal from "../../components/Modal";
import { useFormatters } from "../../utils/useFormatters";
import { deleteSplitExpense } from "../../api/split";
import type { SplitExpense } from "../../api/split";
import SplitExpenseFormModal from "./SplitExpenseFormModal";

// Standalone ("quick") expenses — group=null (piano Batch 2.2/QA finding:
// creating one from SplitView's "+ Nuova spesa veloce" CTA left it
// permanently invisible afterwards, no list/edit/delete anywhere). Mirrors
// SplitGroupDetailView's expense list — same row layout, same edit/delete
// flow via SplitExpenseFormModal/deleteSplitExpense — scoped to
// `standaloneExpenses` (useSplitOverview) instead of a group's own list.
export default function SplitStandaloneExpensesSection() {
    const { T, apiFetch, guardDemo, categories } = useApp();
    const { formatEur } = useFormatters();
    const {
        standaloneExpenses,
        standaloneExpensesLoading,
        standaloneExpensesError,
        loadStandaloneExpenses,
    } = useSplit();

    const [showExpenseModal, setShowExpenseModal] = useState(false);
    const [editingExpense, setEditingExpense] = useState<SplitExpense | null>(
        null,
    );
    const [deleteTarget, setDeleteTarget] = useState<SplitExpense | null>(null);
    const [deletingExpense, setDeletingExpense] = useState(false);

    useEffect(() => {
        loadStandaloneExpenses();
    }, [loadStandaloneExpenses]);

    const handleDeleteExpense = async () => {
        if (!deleteTarget) return;
        if (guardDemo()) {
            setDeleteTarget(null);
            return;
        }
        setDeletingExpense(true);
        await deleteSplitExpense(apiFetch, deleteTarget.id);
        setDeletingExpense(false);
        setDeleteTarget(null);
        loadStandaloneExpenses();
    };

    return (
        <div style={{ marginBottom: 16 }}>
            {standaloneExpensesError && (
                <div style={{ marginBottom: 16 }}>
                    <ModalError>{standaloneExpensesError}</ModalError>
                </div>
            )}

            {standaloneExpenses.length === 0 ? (
                <>
                    <div className="grouped-list__title">
                        {T("split_standalone_expenses_title")}
                    </div>
                    <Card
                        style={{
                            padding: 20,
                            textAlign: "center",
                            color: "var(--fg-soft)",
                        }}
                        data-testid="split-standalone-expenses-empty"
                    >
                        {standaloneExpensesLoading
                            ? T("loading")
                            : T("split_standalone_expenses_empty")}
                    </Card>
                </>
            ) : (
                <GroupedList title={T("split_standalone_expenses_title")}>
                    {standaloneExpenses.map((expense) => {
                        const category = categories.find(
                            (c) => c.id === expense.category,
                        );
                        return (
                            <GroupedList.Item
                                key={expense.id}
                                testId={`split-standalone-expense-row-${expense.id}`}
                                icon={category?.icon ?? "🧾"}
                                label={expense.description}
                                subtitle={expense.date}
                                value={formatEur(expense.amount)}
                                action={
                                    <div style={{ display: "flex", gap: 8 }}>
                                        <button
                                            type="button"
                                            className="btn btn-g btn-sm"
                                            onClick={() => {
                                                setEditingExpense(expense);
                                                setShowExpenseModal(true);
                                            }}
                                        >
                                            {T("btn_edit")}
                                        </button>
                                        <button
                                            type="button"
                                            className="btn btn-r btn-sm"
                                            data-testid={`split-standalone-expense-delete-${expense.id}`}
                                            onClick={() =>
                                                setDeleteTarget(expense)
                                            }
                                        >
                                            {T("btn_delete")}
                                        </button>
                                    </div>
                                }
                            />
                        );
                    })}
                </GroupedList>
            )}

            <SplitExpenseFormModal
                open={showExpenseModal}
                group={null}
                expense={editingExpense}
                onClose={() => setShowExpenseModal(false)}
                onSaved={() => loadStandaloneExpenses()}
            />

            {deleteTarget && (
                <Modal
                    title={T("modal_delete_expense")}
                    onClose={() => setDeleteTarget(null)}
                >
                    <div
                        style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 16,
                        }}
                    >
                        <div style={{ fontSize: 14 }}>
                            {deleteTarget.description} —{" "}
                            {formatEur(deleteTarget.amount)}
                        </div>
                        <div style={{ fontSize: 13, color: "var(--fg-soft)" }}>
                            {T("action_cannot_be_undone")}
                        </div>
                        <div
                            className="row"
                            style={{ justifyContent: "flex-end", gap: 8 }}
                        >
                            <button
                                className="btn btn-g"
                                onClick={() => setDeleteTarget(null)}
                            >
                                {T("btn_cancel")}
                            </button>
                            <button
                                className="btn"
                                style={{
                                    background: "var(--danger)",
                                    color: "var(--btn-primary-fg)",
                                    padding: "10px 18px",
                                }}
                                data-testid="split-standalone-expense-delete-confirm"
                                disabled={deletingExpense}
                                onClick={handleDeleteExpense}
                            >
                                {T("btn_delete")}
                            </button>
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    );
}
