"use client";

import { useEffect, useState } from "react";
import type {
    SplitBalanceEntry,
    SplitContact,
    SplitExpense,
    SplitParticipant,
    SplitSettlement,
} from "../../api/split";
import { deleteSplitExpense } from "../../api/split";
import {
    Card,
    Icon,
    LargeTitleHeader,
    ModalError,
    PullToRefresh,
    SpeedDialFab,
} from "../../components/ui";
import { useApp } from "../../context/useApp";
import { useSplit } from "../../context/split/useSplit";
import { useFormatters } from "../../utils/useFormatters";
import SplitDeleteConfirmation from "./SplitDeleteConfirmation";
import SplitExpenseFormModal from "./SplitExpenseFormModal";
import SplitGroupActivitySection from "./SplitGroupActivitySection";
import SplitGroupFormSheet from "./SplitGroupFormSheet";
import SplitGroupSummarySection from "./SplitGroupSummarySection";
import SplitMemberFormSheet from "./SplitMemberFormSheet";
import SplitRecurringSection from "./SplitRecurringSection";
import SplitSettleUpModal from "./SplitSettleUpModal";
import {
    canModifyExpense,
    canModifySettlement,
    resolveMySplitUserId,
    splitIdentityIsMe,
    splitIdentityLabel,
    splitMemberLabel,
} from "./splitIdentity";

export default function SplitGroupDetailView({
    autoOpenExpense,
    onAutoOpenExpenseConsumed,
}: {
    autoOpenExpense?: SplitExpense | null;
    onAutoOpenExpenseConsumed?: () => void;
}) {
    const { T, apiFetch, guardDemo, user, bankAccounts } = useApp();
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
        loadSplitOverview,
        loadSplitActivity,
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
    const [deleteSettlementTarget, setDeleteSettlementTarget] =
        useState<SplitSettlement | null>(null);
    const [removeMemberTarget, setRemoveMemberTarget] =
        useState<SplitParticipant | null>(null);
    const [deletingExpense, setDeletingExpense] = useState(false);
    const [deletingSettlement, setDeletingSettlement] = useState(false);
    const [removingMember, setRemovingMember] = useState(false);
    const [addingMember, setAddingMember] = useState(false);
    const [showMemberSheet, setShowMemberSheet] = useState(false);
    const [showGroupEdit, setShowGroupEdit] = useState(false);
    const [recurringCreateRequest, setRecurringCreateRequest] = useState(0);

    useEffect(() => {
        if (!autoOpenExpense || !groupDetail) return;
        if (String(groupDetail.id) !== String(autoOpenExpense.group)) return;
        setEditingExpense(autoOpenExpense);
        setShowExpenseModal(true);
        onAutoOpenExpenseConsumed?.();
    }, [autoOpenExpense, groupDetail, onAutoOpenExpenseConsumed]);

    if (!selectedGroupId) return null;

    if (!groupDetail) {
        return (
            <Card className="split-empty-state">
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
    const myBalance = groupBalances.find((entry) =>
        splitIdentityIsMe(entry, {
            mySplitUserId,
            myEmail: user,
        }),
    );
    const myBalanceAmount = Number(myBalance?.balance ?? 0);
    const myBalanceText = `${myBalanceAmount >= 0 ? "+" : "-"}${formatEur(
        Math.abs(myBalanceAmount),
    )}`;

    const refresh = () => {
        loadSplitGroupDetail(selectedGroupId);
        loadSplitOverview();
        loadSplitActivity();
    };
    const openNewExpense = () => {
        setEditingExpense(null);
        setShowExpenseModal(true);
    };
    const openEditExpense = (expense: SplitExpense) => {
        setEditingExpense(expense);
        setShowExpenseModal(true);
    };

    const handleAddMember = async (contact: SplitContact) => {
        setAddingMember(true);
        const added =
            contact.linked_user != null
                ? await addMemberToSplitGroup(selectedGroupId, {
                      user_id: contact.linked_user,
                  })
                : await addMemberToSplitGroup(selectedGroupId, {
                      contact_id: contact.id,
                  });
        setAddingMember(false);
        if (added) setShowMemberSheet(false);
    };

    const handleConfirmRemoveMember = async () => {
        if (!removeMemberTarget) return;
        setRemovingMember(true);
        const removed = await removeMemberFromSplitGroup(
            selectedGroupId,
            removeMemberTarget.id,
        );
        setRemovingMember(false);
        if (removed) setRemoveMemberTarget(null);
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

    const settlementAmountColor = (settlement: SplitSettlement): string => {
        if (
            splitIdentityIsMe(
                {
                    user_id: settlement.payer_user ?? null,
                    email: settlement.payer_user_email ?? null,
                },
                { mySplitUserId, myEmail: user },
            )
        ) {
            return "var(--danger)";
        }
        if (
            splitIdentityIsMe(
                {
                    user_id: settlement.payee_user ?? null,
                    email: settlement.payee_user_email ?? null,
                },
                { mySplitUserId, myEmail: user },
            )
        ) {
            return "var(--success)";
        }
        return "var(--fg)";
    };

    return (
        <PullToRefresh onRefresh={async () => refresh()}>
            <div>
                <button
                    type="button"
                    className="split-back-button pressable"
                    data-testid="split-group-back"
                    onClick={clearSplitGroupDetail}
                >
                    ‹ {T("split_groups_title")}
                </button>

                <LargeTitleHeader
                    eyebrow={T("split_group_balance_you")}
                    title={`${groupDetail.icon} ${groupDetail.name}`}
                    compactTitle={groupDetail.name}
                    compactValue={myBalanceText}
                    subtitle={`${myBalanceText} · ${groupMembers.length} ${T("split_members_label")}`}
                    actions={
                        <div className="split-header-actions desktop-only">
                            <button
                                type="button"
                                className="btn btn-p"
                                data-testid="split-group-new-expense-desktop"
                                onClick={openNewExpense}
                            >
                                + {T("split_expense_new")}
                            </button>
                            <button
                                type="button"
                                className="btn btn-g"
                                data-testid="split-add-member-open-desktop"
                                onClick={() => setShowMemberSheet(true)}
                            >
                                {T("split_member_new")}
                            </button>
                            <button
                                type="button"
                                className="btn btn-g"
                                data-testid="split-recurring-new-desktop"
                                onClick={() =>
                                    setRecurringCreateRequest(
                                        (value) => value + 1,
                                    )
                                }
                            >
                                {T("add_recurring")}
                            </button>
                            <button
                                type="button"
                                className="btn btn-g"
                                data-testid="split-group-edit-detail"
                                onClick={() => setShowGroupEdit(true)}
                            >
                                {T("btn_edit")}
                            </button>
                        </div>
                    }
                />

                {groupDetailError && (
                    <div style={{ marginBottom: 16 }}>
                        <ModalError>{groupDetailError}</ModalError>
                    </div>
                )}

                <div className="split-group-layout">
                    <SplitGroupSummarySection
                        balances={groupBalances}
                        members={groupMembers}
                        contacts={contacts}
                        simplified={groupSimplified}
                        simplifyLoading={groupSimplifyLoading}
                        canRemoveMembers={canRemoveMembers}
                        mySplitUserId={mySplitUserId}
                        onSimplify={() =>
                            loadSplitGroupSimplify(selectedGroupId)
                        }
                        onSettle={setSettleEntry}
                        onAddMember={() => setShowMemberSheet(true)}
                        onRemoveMember={setRemoveMemberTarget}
                    />
                    <main className="split-group-main">
                        <SplitGroupActivitySection
                            expenses={groupExpenses}
                            settlements={groupSettlements}
                            canEditExpense={(expense) =>
                                canModifyExpense(expense, { mySplitUserId })
                            }
                            canDeleteSettlement={(settlement) =>
                                canModifySettlement(settlement, {
                                    mySplitUserId,
                                })
                            }
                            settlementPartyLabel={settlementPartyLabel}
                            settlementAmountColor={settlementAmountColor}
                            onEditExpense={openEditExpense}
                            onDeleteExpense={setDeleteTarget}
                            onDeleteSettlement={setDeleteSettlementTarget}
                        />
                        <SplitRecurringSection
                            group={groupDetail}
                            createRequest={recurringCreateRequest}
                        />
                    </main>
                </div>

                <SpeedDialFab
                    className="mobile-only"
                    mainLabel={T("split_group_actions")}
                    actions={[
                        {
                            label: T("split_expense_new"),
                            icon: <Icon name="category" size={19} />,
                            testId: "split-group-new-expense",
                            onClick: openNewExpense,
                        },
                        {
                            label: T("split_member_new"),
                            icon: <Icon name="plus" size={19} />,
                            testId: "split-group-new-member",
                            onClick: () => setShowMemberSheet(true),
                        },
                        {
                            label: T("add_recurring"),
                            icon: <Icon name="refresh" size={19} />,
                            testId: "split-group-new-recurring",
                            onClick: () =>
                                setRecurringCreateRequest((value) => value + 1),
                        },
                    ]}
                    hidden={
                        showExpenseModal ||
                        showMemberSheet ||
                        showGroupEdit ||
                        settleEntry != null
                    }
                />

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
                <SplitMemberFormSheet
                    open={showMemberSheet}
                    candidates={memberCandidates}
                    saving={addingMember}
                    onSave={handleAddMember}
                    onClose={() => setShowMemberSheet(false)}
                />
                <SplitGroupFormSheet
                    open={showGroupEdit}
                    group={groupDetail}
                    onClose={() => setShowGroupEdit(false)}
                    onSaved={refresh}
                />

                {deleteTarget && (
                    <SplitDeleteConfirmation
                        title={T("modal_delete_expense")}
                        summary={`${deleteTarget.description} — ${formatEur(deleteTarget.amount)}`}
                        warning={
                            deleteTarget.linked_asset != null
                                ? T("split_delete_expense_linked_asset_warning")
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
                                      )
                                : undefined
                        }
                        confirmTestId="split-expense-delete-confirm"
                        busy={deletingExpense}
                        onClose={() => setDeleteTarget(null)}
                        onConfirm={handleDeleteExpense}
                    />
                )}

                {deleteSettlementTarget && (
                    <SplitDeleteConfirmation
                        title={T("modal_delete_settlement")}
                        summary={`${settlementPartyLabel(deleteSettlementTarget, "payer")} → ${settlementPartyLabel(deleteSettlementTarget, "payee")} — ${formatEur(deleteSettlementTarget.amount)}`}
                        warning={
                            deleteSettlementTarget.linked_asset != null
                                ? T(
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
                                      )
                                : undefined
                        }
                        confirmTestId="split-settlement-delete-confirm"
                        busy={deletingSettlement}
                        onClose={() => setDeleteSettlementTarget(null)}
                        onConfirm={handleDeleteSettlement}
                    />
                )}

                {removeMemberTarget && (
                    <SplitDeleteConfirmation
                        title={T("modal_remove_member")}
                        summary={splitMemberLabel(removeMemberTarget, {
                            myEmail: user,
                            contacts,
                            T,
                        })}
                        warning={T("split_remove_member_confirm_body")}
                        confirmTestId="split-member-remove-confirm"
                        busy={removingMember}
                        onClose={() => setRemoveMemberTarget(null)}
                        onConfirm={handleConfirmRemoveMember}
                    />
                )}
            </div>
        </PullToRefresh>
    );
}
