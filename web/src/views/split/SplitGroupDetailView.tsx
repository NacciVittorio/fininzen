"use client";

import { useState } from "react";
import { useApp } from "../../context/useApp";
import { useSplit } from "../../context/split/useSplit";
import { Card, PageHeader } from "../../components/ui";
import Modal from "../../components/Modal";
import Select from "../../components/Select";
import { useFormatters } from "../../utils/useFormatters";
import { deleteSplitExpense } from "../../api/split";
import type { SplitBalanceEntry, SplitExpense } from "../../api/split";
import {
    resolveMySplitUserId,
    simplifiedTransactionToSettleEntry,
    splitIdentityKey,
    splitIdentityLabel,
    splitMemberLabel,
} from "./splitIdentity";
import SplitExpenseFormModal from "./SplitExpenseFormModal";
import SplitSettleUpModal from "./SplitSettleUpModal";
import SplitRecurringSection from "./SplitRecurringSection";

// One group's full picture (piano sez. 7.5): expense history, per-member net
// balance, "Semplifica debiti" suggestions with a "Salda" CTA on the ones
// I'm a party of, roster management, and the group's recurring expenses.
// Rendered by SplitView whenever `selectedGroupId` is set — the caller
// (SplitGroupListView/SplitGroupCard) is what triggers
// `loadSplitGroupDetail`, so this view only ever reads already-loading /
// already-loaded context state, it never kicks off the fetch itself.
export default function SplitGroupDetailView() {
    const { T, apiFetch, guardDemo, user, categories } = useApp();
    const { formatEur } = useFormatters();
    const {
        contacts,
        groups,
        partnerLinksSent,
        partnerLinksReceived,
        selectedGroupId,
        groupDetail,
        groupMembers,
        groupBalances,
        groupExpenses,
        groupSimplified,
        groupDetailLoading,
        groupSimplifyLoading,
        groupDetailError,
        loadSplitGroupDetail,
        clearSplitGroupDetail,
        addMemberToSplitGroup,
        removeMemberFromSplitGroup,
        loadSplitGroupSimplify,
    } = useSplit();

    const [showExpenseModal, setShowExpenseModal] = useState(false);
    const [editingExpense, setEditingExpense] = useState<SplitExpense | null>(
        null,
    );
    const [settleEntry, setSettleEntry] = useState<SplitBalanceEntry | null>(
        null,
    );
    const [deleteTarget, setDeleteTarget] = useState<SplitExpense | null>(null);
    const [deletingExpense, setDeletingExpense] = useState(false);
    const [showRecurring, setShowRecurring] = useState(false);
    const [addMemberValue, setAddMemberValue] = useState("");

    if (!selectedGroupId) return null;

    if (!groupDetail) {
        return (
            <Card style={{ padding: 20, textAlign: "center" }}>
                {groupDetailLoading
                    ? T("loading")
                    : (groupDetailError ?? T("loading"))}
            </Card>
        );
    }

    const mySplitUserId = resolveMySplitUserId({
        myEmail: user,
        groups,
        groupMembers,
        partnerLinksSent,
        partnerLinksReceived,
    });

    const refresh = () => loadSplitGroupDetail(selectedGroupId);

    const memberCandidates = contacts.filter((contact) => {
        if (contact.is_archived) return false;
        return !groupMembers.some((member) =>
            contact.linked_user != null
                ? member.user === contact.linked_user
                : member.contact === contact.id,
        );
    });

    const handleAddMember = (value: string) => {
        const contact = memberCandidates.find(
            (candidate) => String(candidate.id) === value,
        );
        if (!contact) return;
        if (contact.linked_user != null) {
            addMemberToSplitGroup(selectedGroupId, {
                user_id: contact.linked_user,
            });
        } else {
            addMemberToSplitGroup(selectedGroupId, { contact_id: contact.id });
        }
        setAddMemberValue("");
    };

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
        refresh();
    };

    return (
        <div>
            <button
                type="button"
                className="pressable"
                data-testid="split-group-back"
                onClick={clearSplitGroupDetail}
                style={{
                    background: "none",
                    border: 0,
                    color: "var(--accent)",
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    padding: "8px 8px 8px 0",
                    fontSize: 15,
                    fontWeight: 600,
                    fontFamily: "inherit",
                    minHeight: 44,
                }}
            >
                ‹ {T("split_groups_title")}
            </button>

            <PageHeader
                title={`${groupDetail.icon} ${groupDetail.name}`}
                actions={
                    <button
                        type="button"
                        className="btn btn-p btn-sm"
                        data-testid="split-group-new-expense"
                        onClick={() => {
                            setEditingExpense(null);
                            setShowExpenseModal(true);
                        }}
                    >
                        + {T("split_expense_new")}
                    </button>
                }
            />

            {groupDetailError && (
                <Card
                    tone="danger"
                    style={{
                        padding: 16,
                        marginBottom: 16,
                        color: "var(--danger)",
                    }}
                >
                    {groupDetailError}
                </Card>
            )}

            <Card
                style={{ padding: 20, marginBottom: 16 }}
                data-testid="split-group-balances"
            >
                <div
                    style={{
                        fontSize: 13,
                        color: "var(--fg-soft)",
                        marginBottom: 10,
                    }}
                >
                    {T("split_group_balances_title")}
                </div>
                {groupBalances.length === 0 ? (
                    <div style={{ color: "var(--fg-soft)", fontSize: 13 }}>
                        {T("split_balance_settled")}
                    </div>
                ) : (
                    <div
                        style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 8,
                            marginBottom: 14,
                        }}
                    >
                        {groupBalances.map((entry) => {
                            const amount = Number(entry.balance);
                            return (
                                <div
                                    key={splitIdentityKey(entry)}
                                    data-testid={`split-group-balance-row-${splitIdentityKey(entry)}`}
                                    style={{
                                        display: "flex",
                                        justifyContent: "space-between",
                                        fontSize: 13,
                                    }}
                                >
                                    <span>
                                        {splitIdentityLabel(entry, {
                                            myEmail: user,
                                            T,
                                        })}
                                    </span>
                                    <span
                                        style={{
                                            fontWeight: 600,
                                            color:
                                                amount >= 0
                                                    ? "var(--success)"
                                                    : "var(--danger)",
                                        }}
                                    >
                                        {amount >= 0 ? "+" : "-"}
                                        {formatEur(Math.abs(amount))}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                )}
                <button
                    type="button"
                    className="btn btn-g btn-sm"
                    data-testid="split-simplify-btn"
                    disabled={groupSimplifyLoading}
                    onClick={() => loadSplitGroupSimplify(selectedGroupId)}
                >
                    {groupSimplifyLoading ? "…" : T("split_simplify_debts")}
                </button>
                {groupSimplified && (
                    <div
                        style={{
                            marginTop: 12,
                            display: "flex",
                            flexDirection: "column",
                            gap: 8,
                        }}
                    >
                        {groupSimplified.length === 0 ? (
                            <div
                                style={{
                                    color: "var(--fg-soft)",
                                    fontSize: 13,
                                }}
                            >
                                {T("split_simplify_empty")}
                            </div>
                        ) : (
                            groupSimplified.map((tx, index) => {
                                const entryForMe =
                                    simplifiedTransactionToSettleEntry(tx, {
                                        mySplitUserId,
                                        myEmail: user,
                                    });
                                return (
                                    <div
                                        key={index}
                                        data-testid={`split-simplify-tx-${index}`}
                                        style={{
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "space-between",
                                            gap: 8,
                                            fontSize: 13,
                                        }}
                                    >
                                        <span>
                                            {splitIdentityLabel(tx.from, {
                                                myEmail: user,
                                                T,
                                            })}{" "}
                                            →{" "}
                                            {splitIdentityLabel(tx.to, {
                                                myEmail: user,
                                                T,
                                            })}
                                        </span>
                                        <span
                                            className="row"
                                            style={{
                                                gap: 8,
                                                alignItems: "center",
                                            }}
                                        >
                                            <strong>
                                                {formatEur(tx.amount)}
                                            </strong>
                                            {entryForMe && (
                                                <button
                                                    type="button"
                                                    className="btn btn-g btn-sm"
                                                    data-testid={`split-simplify-settle-${index}`}
                                                    onClick={() =>
                                                        setSettleEntry(
                                                            entryForMe,
                                                        )
                                                    }
                                                >
                                                    {T("split_settle_up")}
                                                </button>
                                            )}
                                        </span>
                                    </div>
                                );
                            })
                        )}
                    </div>
                )}
            </Card>

            <Card style={{ padding: 20, marginBottom: 16 }}>
                <div
                    style={{
                        fontSize: 13,
                        color: "var(--fg-soft)",
                        marginBottom: 10,
                    }}
                >
                    {T("split_group_members_title")}
                </div>
                <div
                    style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 6,
                        marginBottom: 10,
                    }}
                >
                    {groupMembers.map((member) => (
                        <div
                            key={member.id}
                            data-testid={`split-member-row-${member.id}`}
                            style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                fontSize: 13,
                            }}
                        >
                            <span>
                                {splitMemberLabel(member, {
                                    myEmail: user,
                                    contacts,
                                    T,
                                })}
                            </span>
                            {member.user_email !== user && (
                                <button
                                    type="button"
                                    className="btn btn-r btn-sm"
                                    data-testid={`split-member-remove-${member.id}`}
                                    onClick={() =>
                                        removeMemberFromSplitGroup(
                                            selectedGroupId,
                                            member.id,
                                        )
                                    }
                                >
                                    {T("btn_delete")}
                                </button>
                            )}
                        </div>
                    ))}
                </div>
                {memberCandidates.length > 0 && (
                    <Select
                        value={addMemberValue}
                        data-testid="split-add-member-select"
                        onChange={handleAddMember}
                        options={memberCandidates.map((candidate) => ({
                            value: String(candidate.id),
                            label: candidate.display_name,
                        }))}
                        placeholder={T("split_add_member_placeholder")}
                    />
                )}
            </Card>

            <div style={{ marginBottom: 16 }}>
                <div className="grouped-list__title">
                    {T("split_group_expenses_title")}
                </div>
                {groupExpenses.length === 0 ? (
                    <Card
                        style={{
                            padding: 20,
                            textAlign: "center",
                            color: "var(--fg-soft)",
                        }}
                        data-testid="split-group-expenses-empty"
                    >
                        {T("split_group_expenses_empty")}
                    </Card>
                ) : (
                    <div className="grouped-list">
                        {groupExpenses.map((expense) => {
                            const category = categories.find(
                                (c) => c.id === expense.category,
                            );
                            return (
                                <div
                                    key={expense.id}
                                    className="grouped-list__item"
                                    data-testid={`split-expense-row-${expense.id}`}
                                    style={{ alignItems: "center", gap: 10 }}
                                >
                                    <div
                                        style={{
                                            display: "flex",
                                            alignItems: "center",
                                            gap: 10,
                                            flex: 1,
                                            minWidth: 0,
                                        }}
                                    >
                                        <span style={{ fontSize: 18 }}>
                                            {category?.icon ?? "🧾"}
                                        </span>
                                        <div style={{ minWidth: 0 }}>
                                            <div
                                                style={{
                                                    fontSize: 14,
                                                    fontWeight: 500,
                                                    overflow: "hidden",
                                                    textOverflow: "ellipsis",
                                                    whiteSpace: "nowrap",
                                                }}
                                            >
                                                {expense.description}
                                            </div>
                                            <div
                                                style={{
                                                    fontSize: 11,
                                                    color: "var(--fg-soft)",
                                                }}
                                            >
                                                {expense.date}
                                            </div>
                                        </div>
                                    </div>
                                    <span
                                        style={{
                                            fontSize: 14,
                                            fontWeight: 600,
                                            fontFamily: "var(--font-mono)",
                                        }}
                                    >
                                        {formatEur(expense.amount)}
                                    </span>
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
                                        data-testid={`split-expense-delete-${expense.id}`}
                                        onClick={() => setDeleteTarget(expense)}
                                    >
                                        {T("btn_delete")}
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            <button
                type="button"
                className="btn btn-g btn-sm"
                data-testid="split-recurring-toggle"
                onClick={() => setShowRecurring((current) => !current)}
                style={{ marginBottom: 16 }}
            >
                {T("split_recurring_title")}
            </button>
            {showRecurring && <SplitRecurringSection group={groupDetail} />}

            <SplitExpenseFormModal
                open={showExpenseModal}
                group={groupDetail}
                expense={editingExpense}
                onClose={() => setShowExpenseModal(false)}
                onSaved={refresh}
            />
            <SplitSettleUpModal
                open={settleEntry != null}
                entry={settleEntry}
                group={groupDetail}
                onClose={() => setSettleEntry(null)}
                onSettled={refresh}
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
                                data-testid="split-expense-delete-confirm"
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
