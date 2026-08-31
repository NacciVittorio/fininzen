"use client";

import type {
    SplitBalanceEntry,
    SplitContact,
    SplitParticipant,
    SplitSimplifiedTransaction,
} from "../../api/split";
import { Card } from "../../components/ui";
import { useApp } from "../../context/useApp";
import { useFormatters } from "../../utils/useFormatters";
import SplitActionRow from "./SplitActionRow";
import {
    simplifiedTransactionToSettleEntry,
    splitIdentityKey,
    splitIdentityLabel,
    splitMemberLabel,
} from "./splitIdentity";

export default function SplitGroupSummarySection({
    balances,
    members,
    contacts,
    simplified,
    simplifyLoading,
    canRemoveMembers,
    mySplitUserId,
    onSimplify,
    onSettle,
    onAddMember,
    onRemoveMember,
}: {
    balances: SplitBalanceEntry[];
    members: SplitParticipant[];
    contacts: SplitContact[];
    simplified: SplitSimplifiedTransaction[] | null;
    simplifyLoading: boolean;
    canRemoveMembers: boolean;
    mySplitUserId: number | null;
    onSimplify: () => void;
    onSettle: (entry: SplitBalanceEntry) => void;
    onAddMember: () => void;
    onRemoveMember: (member: SplitParticipant) => void;
}) {
    const { T, user } = useApp();
    const { formatEur } = useFormatters();

    return (
        <aside className="split-group-summary">
            <Card
                className="split-summary-card"
                data-testid="split-group-balances"
            >
                <div className="split-card-heading">
                    {T("split_group_balances_title")}
                </div>
                {balances.length === 0 ? (
                    <div className="split-confirm-hint">
                        {T("split_balance_settled")}
                    </div>
                ) : (
                    <div className="split-compact-stack">
                        {balances.map((entry) => {
                            const amount = Number(entry.balance);
                            const key = splitIdentityKey(entry);
                            return (
                                <div
                                    key={key}
                                    className="split-balance-line"
                                    data-testid={`split-group-balance-row-${key}`}
                                >
                                    <span>
                                        {splitIdentityLabel(entry, {
                                            myEmail: user,
                                            T,
                                        })}
                                    </span>
                                    <strong
                                        className={
                                            amount >= 0
                                                ? "positive"
                                                : "negative"
                                        }
                                    >
                                        {amount >= 0 ? "+" : "-"}
                                        {formatEur(Math.abs(amount))}
                                    </strong>
                                </div>
                            );
                        })}
                    </div>
                )}
                <button
                    type="button"
                    className="btn btn-g btn-sm split-card-action"
                    data-testid="split-simplify-btn"
                    disabled={simplifyLoading}
                    onClick={onSimplify}
                >
                    {simplifyLoading ? "…" : T("split_simplify_debts")}
                </button>
                {simplified && (
                    <div className="split-simplified-list">
                        {simplified.length === 0 ? (
                            <div className="split-confirm-hint">
                                {T("split_simplify_empty")}
                            </div>
                        ) : (
                            simplified.map((transaction, index) => {
                                const entryForMe =
                                    simplifiedTransactionToSettleEntry(
                                        transaction,
                                        {
                                            mySplitUserId,
                                            myEmail: user,
                                        },
                                    );
                                return (
                                    <div
                                        key={`${splitIdentityKey(transaction.from)}-${splitIdentityKey(transaction.to)}-${index}`}
                                        className="split-simplified-line"
                                        data-testid={`split-simplify-tx-${index}`}
                                    >
                                        <span>
                                            {splitIdentityLabel(
                                                transaction.from,
                                                { myEmail: user, T },
                                            )}{" "}
                                            →{" "}
                                            {splitIdentityLabel(
                                                transaction.to,
                                                {
                                                    myEmail: user,
                                                    T,
                                                },
                                            )}
                                        </span>
                                        <strong>
                                            {formatEur(transaction.amount)}
                                        </strong>
                                        {entryForMe && (
                                            <button
                                                type="button"
                                                className="btn btn-g btn-sm"
                                                data-testid={`split-simplify-settle-${index}`}
                                                onClick={() =>
                                                    onSettle(entryForMe)
                                                }
                                            >
                                                {T("split_settle_up")}
                                            </button>
                                        )}
                                    </div>
                                );
                            })
                        )}
                    </div>
                )}
            </Card>

            <Card className="split-summary-card">
                <div className="split-card-heading-row">
                    <div className="split-card-heading">
                        {T("split_group_members_title")}
                    </div>
                    <span className="split-count-badge">{members.length}</span>
                </div>
                <div className="grouped-list split-members-list">
                    {members.map((member) => (
                        <SplitActionRow
                            key={member.id}
                            rowId={`member-${member.id}`}
                            testId={`split-member-row-${member.id}`}
                            icon={
                                <span
                                    className="split-contact-dot"
                                    style={{
                                        background:
                                            member.contact_color ??
                                            "var(--fg-faint)",
                                    }}
                                />
                            }
                            label={splitMemberLabel(member, {
                                myEmail: user,
                                contacts,
                                T,
                            })}
                            onDelete={
                                member.user_email !== user && canRemoveMembers
                                    ? () => onRemoveMember(member)
                                    : undefined
                            }
                            deleteTestId={`split-member-remove-${member.id}`}
                        />
                    ))}
                </div>
                <button
                    type="button"
                    className="btn btn-g btn-sm desktop-only split-card-action"
                    data-testid="split-add-member-open"
                    onClick={onAddMember}
                >
                    + {T("split_member_new")}
                </button>
            </Card>
        </aside>
    );
}
