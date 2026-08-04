"use client";

import { useEffect, useState } from "react";
import { useApp } from "../../context/useApp";
import { useSplit } from "../../context/split/useSplit";
import { Card, GroupedList, ModalError, PageHeader } from "../../components/ui";
import Modal from "../../components/Modal";
import Select from "../../components/Select";
import { useFormatters } from "../../utils/useFormatters";
import { deleteSplitExpense } from "../../api/split";
import type {
    SplitBalanceEntry,
    SplitContact,
    SplitExpense,
    SplitParticipant,
    SplitSettlement,
} from "../../api/split";
import {
    canModifyExpense,
    canModifySettlement,
    resolveMySplitUserId,
    simplifiedTransactionToSettleEntry,
    splitIdentityIsMe,
    splitIdentityKey,
    splitIdentityLabel,
    splitMemberLabel,
} from "./splitIdentity";
import SplitExpenseFormModal from "./SplitExpenseFormModal";
import SplitSettleUpModal from "./SplitSettleUpModal";
import SplitRecurringSection from "./SplitRecurringSection";
import SplitSettlementBadge from "./SplitSettlementBadge";

// One group's full picture (piano sez. 7.5): expense history, per-member net
// balance, "Semplifica debiti" suggestions with a "Salda" CTA on the ones
// I'm a party of, roster management, and the group's recurring expenses.
// Rendered by SplitView whenever `selectedGroupId` is set — the caller
// (SplitGroupListView/SplitGroupCard) is what triggers
// `loadSplitGroupDetail`, so this view only ever reads already-loading /
// already-loaded context state, it never kicks off the fetch itself.
export default function SplitGroupDetailView({
    autoOpenExpense,
    onAutoOpenExpenseConsumed,
}: {
    // Set by SplitView when a CashFlow "Apri in Split" deep link
    // (?openExpense=, piano Batch 1) resolved to an expense in *this* group —
    // opens straight into edit mode instead of the empty create form.
    autoOpenExpense?: SplitExpense | null;
    onAutoOpenExpenseConsumed?: () => void;
}) {
    const { T, apiFetch, guardDemo, user, categories, bankAccounts } = useApp();
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
        groupSettlements,
        groupSimplified,
        groupDetailLoading,
        groupSimplifyLoading,
        groupDetailError,
        loadSplitGroupDetail,
        clearSplitGroupDetail,
        addMemberToSplitGroup,
        removeMemberFromSplitGroup,
        loadSplitGroupSimplify,
        removeSplitSettlement,
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
    const [deleteSettlementTarget, setDeleteSettlementTarget] =
        useState<SplitSettlement | null>(null);
    const [deletingSettlement, setDeletingSettlement] = useState(false);
    const [showRecurring, setShowRecurring] = useState(false);
    const [addMemberValue, setAddMemberValue] = useState("");
    const [pendingMember, setPendingMember] = useState<SplitContact | null>(
        null,
    );
    const [addingMember, setAddingMember] = useState(false);
    const [removeMemberTarget, setRemoveMemberTarget] =
        useState<SplitParticipant | null>(null);
    const [removingMember, setRemovingMember] = useState(false);

    // Consumes the deep-linked expense once this is really *its* group (not
    // just *a* group mid-transition while loadSplitGroupDetail is still
    // fetching a different one) — hooks must run before the early returns
    // below, so this sits ahead of them like the other useState calls.
    useEffect(() => {
        if (!autoOpenExpense) return;
        if (!groupDetail) return;
        if (String(groupDetail.id) !== String(autoOpenExpense.group)) return;
        setEditingExpense(autoOpenExpense);
        setShowExpenseModal(true);
        onAutoOpenExpenseConsumed?.();
    }, [autoOpenExpense, groupDetail, onAutoOpenExpenseConsumed]);

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
    // piano Batch 4.6: removal is creator-only server-side now (falling back
    // to "anyone" only if the group has no creator left, e.g. anonymized —
    // piano Batch 1.2) — mirror that here instead of showing a Delete button
    // that's guaranteed to 403 for anyone else.
    const canRemoveMembers =
        groupDetail.created_by == null ||
        groupDetail.created_by === mySplitUserId;

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
        setAddMemberValue(value);
        setPendingMember(contact);
    };

    const handleConfirmAddMember = async () => {
        if (!pendingMember) return;
        setAddingMember(true);
        if (pendingMember.linked_user != null) {
            await addMemberToSplitGroup(selectedGroupId, {
                user_id: pendingMember.linked_user,
            });
        } else {
            await addMemberToSplitGroup(selectedGroupId, {
                contact_id: pendingMember.id,
            });
        }
        setAddingMember(false);
        setPendingMember(null);
        setAddMemberValue("");
    };

    const handleConfirmRemoveMember = async () => {
        if (!removeMemberTarget) return;
        setRemovingMember(true);
        await removeMemberFromSplitGroup(
            selectedGroupId,
            removeMemberTarget.id,
        );
        setRemovingMember(false);
        setRemoveMemberTarget(null);
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

    const handleDeleteSettlement = async () => {
        if (!deleteSettlementTarget) return;
        if (guardDemo()) {
            setDeleteSettlementTarget(null);
            return;
        }
        setDeletingSettlement(true);
        await removeSplitSettlement(deleteSettlementTarget.id);
        setDeletingSettlement(false);
        setDeleteSettlementTarget(null);
        refresh();
    };

    const settlementPartyLabel = (
        settlement: SplitSettlement,
        side: "payer" | "payee",
    ) =>
        splitIdentityLabel(
            {
                display_name:
                    side === "payer"
                        ? settlement.payer_contact_name
                        : settlement.payee_contact_name,
                email:
                    side === "payer"
                        ? settlement.payer_user_email
                        : settlement.payee_user_email,
            },
            { myEmail: user, T },
        );

    // Group balances above color-codes owed-to-you (green) vs you-owe (red) —
    // the settlement history list mirrors that same signifier: red when I'm
    // the one who paid (money out), green when I'm the one who got paid
    // (money in), neutral when I'm not a direct party (a settlement between
    // two other group members, still shown here for group-history context).
    const settlementAmountColor = (settlement: SplitSettlement): string => {
        const iAmPayer = splitIdentityIsMe(
            {
                user_id: settlement.payer_user ?? null,
                email: settlement.payer_user_email ?? null,
            },
            { mySplitUserId, myEmail: user },
        );
        if (iAmPayer) return "var(--danger)";
        const iAmPayee = splitIdentityIsMe(
            {
                user_id: settlement.payee_user ?? null,
                email: settlement.payee_user_email ?? null,
            },
            { mySplitUserId, myEmail: user },
        );
        if (iAmPayee) return "var(--success)";
        return "var(--fg)";
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
                <div style={{ marginBottom: 16 }}>
                    <ModalError>{groupDetailError}</ModalError>
                </div>
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
                            {member.user_email !== user && canRemoveMembers && (
                                <button
                                    type="button"
                                    className="btn btn-r btn-sm"
                                    data-testid={`split-member-remove-${member.id}`}
                                    onClick={() =>
                                        setRemoveMemberTarget(member)
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
                {groupExpenses.length === 0 ? (
                    <>
                        <div className="grouped-list__title">
                            {T("split_group_expenses_title")}
                        </div>
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
                    </>
                ) : (
                    <GroupedList title={T("split_group_expenses_title")}>
                        {groupExpenses.map((expense) => {
                            const category = categories.find(
                                (c) => c.id === expense.category,
                            );
                            // Piano A4b: hides Modifica/Elimina instead of
                            // letting a non-payer/non-creator click through
                            // to the 403 the API now returns for a
                            // linked_asset expense (splitting/permissions.py
                            // ::user_can_modify_expense).
                            const editable = canModifyExpense(expense, {
                                mySplitUserId,
                            });
                            return (
                                <GroupedList.Item
                                    key={expense.id}
                                    testId={`split-expense-row-${expense.id}`}
                                    icon={category?.icon ?? "🧾"}
                                    label={expense.description}
                                    subtitle={expense.date}
                                    value={
                                        <div
                                            style={{
                                                display: "flex",
                                                flexDirection: "column",
                                                alignItems: "flex-end",
                                                gap: 4,
                                            }}
                                        >
                                            <span>
                                                {formatEur(expense.amount)}
                                            </span>
                                            <SplitSettlementBadge
                                                percentage={
                                                    expense.settlement_progress
                                                        .percentage
                                                }
                                                T={T}
                                                testId={`split-expense-settlement-badge-${expense.id}`}
                                            />
                                        </div>
                                    }
                                    action={
                                        editable ? (
                                            <div
                                                style={{
                                                    display: "flex",
                                                    gap: 8,
                                                }}
                                            >
                                                <button
                                                    type="button"
                                                    className="btn btn-g btn-sm"
                                                    onClick={() => {
                                                        setEditingExpense(
                                                            expense,
                                                        );
                                                        setShowExpenseModal(
                                                            true,
                                                        );
                                                    }}
                                                >
                                                    {T("btn_edit")}
                                                </button>
                                                <button
                                                    type="button"
                                                    className="btn btn-r btn-sm"
                                                    data-testid={`split-expense-delete-${expense.id}`}
                                                    onClick={() =>
                                                        setDeleteTarget(expense)
                                                    }
                                                >
                                                    {T("btn_delete")}
                                                </button>
                                            </div>
                                        ) : undefined
                                    }
                                />
                            );
                        })}
                    </GroupedList>
                )}
            </div>

            <div style={{ marginBottom: 16 }}>
                {groupSettlements.length === 0 ? (
                    <>
                        <div className="grouped-list__title">
                            {T("split_group_settlements_title")}
                        </div>
                        <Card
                            style={{
                                padding: 20,
                                textAlign: "center",
                                color: "var(--fg-soft)",
                            }}
                            data-testid="split-group-settlements-empty"
                        >
                            {T("split_group_settlements_empty")}
                        </Card>
                    </>
                ) : (
                    <GroupedList title={T("split_group_settlements_title")}>
                        {groupSettlements.map((settlement) => (
                            <GroupedList.Item
                                key={settlement.id}
                                testId={`split-settlement-row-${settlement.id}`}
                                icon="💸"
                                label={
                                    <>
                                        {settlementPartyLabel(
                                            settlement,
                                            "payer",
                                        )}{" "}
                                        →{" "}
                                        {settlementPartyLabel(
                                            settlement,
                                            "payee",
                                        )}
                                    </>
                                }
                                subtitle={settlement.date}
                                value={
                                    <span
                                        style={{
                                            fontSize: 14,
                                            fontWeight: 600,
                                            fontFamily: "var(--font-mono)",
                                            color: settlementAmountColor(
                                                settlement,
                                            ),
                                        }}
                                    >
                                        {formatEur(settlement.amount)}
                                    </span>
                                }
                                action={
                                    // Piano A4b: same rationale as the
                                    // expense row above — hides Elimina
                                    // instead of letting a non-creator click
                                    // through to a 403 for a linked_asset
                                    // settlement.
                                    canModifySettlement(settlement, {
                                        mySplitUserId,
                                    }) ? (
                                        <button
                                            type="button"
                                            className="btn btn-r btn-sm"
                                            data-testid={`split-settlement-delete-${settlement.id}`}
                                            onClick={() =>
                                                setDeleteSettlementTarget(
                                                    settlement,
                                                )
                                            }
                                        >
                                            {T("btn_delete")}
                                        </button>
                                    ) : undefined
                                }
                            />
                        ))}
                    </GroupedList>
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
                        {deleteTarget.linked_asset != null && (
                            <div
                                style={{ fontSize: 13, color: "var(--danger)" }}
                            >
                                {T("split_delete_expense_linked_asset_warning")
                                    .replace(
                                        "{account}",
                                        bankAccounts.find(
                                            (account) =>
                                                account.id ===
                                                deleteTarget.linked_asset,
                                        )?.name ?? "",
                                    )
                                    .replace(
                                        "{amount}",
                                        formatEur(deleteTarget.amount),
                                    )}
                            </div>
                        )}
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

            {deleteSettlementTarget && (
                <Modal
                    title={T("modal_delete_settlement")}
                    onClose={() => setDeleteSettlementTarget(null)}
                >
                    <div
                        style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 16,
                        }}
                    >
                        <div style={{ fontSize: 14 }}>
                            {settlementPartyLabel(
                                deleteSettlementTarget,
                                "payer",
                            )}{" "}
                            →{" "}
                            {settlementPartyLabel(
                                deleteSettlementTarget,
                                "payee",
                            )}{" "}
                            — {formatEur(deleteSettlementTarget.amount)}
                        </div>
                        {deleteSettlementTarget.linked_asset != null && (
                            <div
                                style={{ fontSize: 13, color: "var(--danger)" }}
                            >
                                {T(
                                    "split_delete_settlement_linked_asset_warning",
                                )
                                    .replace(
                                        "{account}",
                                        bankAccounts.find(
                                            (account) =>
                                                account.id ===
                                                deleteSettlementTarget.linked_asset,
                                        )?.name ?? "",
                                    )
                                    .replace(
                                        "{amount}",
                                        formatEur(
                                            deleteSettlementTarget.amount,
                                        ),
                                    )}
                            </div>
                        )}
                        <div style={{ fontSize: 13, color: "var(--fg-soft)" }}>
                            {T("action_cannot_be_undone")}
                        </div>
                        <div
                            className="row"
                            style={{ justifyContent: "flex-end", gap: 8 }}
                        >
                            <button
                                className="btn btn-g"
                                onClick={() => setDeleteSettlementTarget(null)}
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
                                data-testid="split-settlement-delete-confirm"
                                disabled={deletingSettlement}
                                onClick={handleDeleteSettlement}
                            >
                                {T("btn_delete")}
                            </button>
                        </div>
                    </div>
                </Modal>
            )}

            {pendingMember && (
                <Modal
                    title={T("modal_add_member")}
                    onClose={() => {
                        setPendingMember(null);
                        setAddMemberValue("");
                    }}
                >
                    <div
                        style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 16,
                        }}
                    >
                        <div style={{ fontSize: 14 }}>
                            {pendingMember.display_name}
                        </div>
                        <div style={{ fontSize: 13, color: "var(--fg-soft)" }}>
                            {T("split_add_member_confirm_body")}
                        </div>
                        <div
                            className="row"
                            style={{ justifyContent: "flex-end", gap: 8 }}
                        >
                            <button
                                className="btn btn-g"
                                onClick={() => {
                                    setPendingMember(null);
                                    setAddMemberValue("");
                                }}
                            >
                                {T("btn_cancel")}
                            </button>
                            <button
                                className="btn btn-p"
                                data-testid="split-add-member-confirm"
                                disabled={addingMember}
                                onClick={handleConfirmAddMember}
                            >
                                {T("btn_add")}
                            </button>
                        </div>
                    </div>
                </Modal>
            )}

            {removeMemberTarget && (
                <Modal
                    title={T("modal_remove_member")}
                    onClose={() => setRemoveMemberTarget(null)}
                >
                    <div
                        style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 16,
                        }}
                    >
                        <div style={{ fontSize: 14 }}>
                            {splitMemberLabel(removeMemberTarget, {
                                myEmail: user,
                                contacts,
                                T,
                            })}
                        </div>
                        <div style={{ fontSize: 13, color: "var(--fg-soft)" }}>
                            {T("split_remove_member_confirm_body")}
                        </div>
                        <div
                            className="row"
                            style={{ justifyContent: "flex-end", gap: 8 }}
                        >
                            <button
                                className="btn btn-g"
                                onClick={() => setRemoveMemberTarget(null)}
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
                                data-testid="split-member-remove-confirm"
                                disabled={removingMember}
                                onClick={handleConfirmRemoveMember}
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
