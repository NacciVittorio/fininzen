"use client";

import type { Dispatch, ReactNode, SetStateAction } from "react";
import { CategoryDot, GroupedList, Icon } from "../../components/ui";
import type { SwipeAction } from "../../components/ui";
import type { Asset, InvestmentType } from "../../api/types";
import type { NumericValue, Translator } from "../../types";
import type { EntityId } from "../../context/feedTypes";
import AccountRow from "./AccountRow";

// Accounts split into one section per account type, mirroring the shape
// InvestmentAssetGroups already uses on the Investments tab: typed groups with
// a coloured dot and a subtotal, then an untyped bucket, then the collapsible
// archived section. Account types are user-owned InvestmentType rows
// (is_bank_account), so their names are rendered raw and never translated.
export default function AccountTypeGroups({
    bankAccounts,
    bankAccountTypes,
    archivedBankAccounts,
    archivedExpanded,
    setArchivedExpanded,
    openSwipeId,
    setOpenSwipeId,
    swipeActionsFor,
    onSelectAccount,
    T,
    masked,
    formatEur,
}: {
    bankAccounts: readonly Asset[];
    bankAccountTypes: readonly InvestmentType[];
    archivedBankAccounts: readonly Asset[];
    archivedExpanded: boolean;
    setArchivedExpanded: Dispatch<SetStateAction<boolean>>;
    openSwipeId: EntityId | null;
    setOpenSwipeId: (id: EntityId | null) => void;
    swipeActionsFor: (account: Asset) => SwipeAction[];
    onSelectAccount: (id: EntityId) => void;
    T: Translator;
    masked: (field: string, value: ReactNode) => ReactNode;
    formatEur: (value: NumericValue) => string;
}) {
    const groups = bankAccountTypes
        .map((type) => ({
            type,
            accounts: bankAccounts.filter(
                (a) => a.investment_type_detail?.id === type.id,
            ),
        }))
        .filter((group) => group.accounts.length > 0);

    // Everything the typed groups didn't claim, not just accounts with no type
    // at all: `bankAccountTypes` comes from a separate fetch, so on a slow load
    // (or a stale type list) a matching type may be missing and those rows must
    // still show up somewhere rather than silently disappear.
    const groupedIds = new Set(
        groups.flatMap((group) => group.accounts.map((a) => a.id)),
    );
    const ungroupedAccounts = bankAccounts.filter((a) => !groupedIds.has(a.id));

    const renderRows = (accounts: readonly Asset[]) =>
        accounts.map((a, index) => (
            <AccountRow
                key={a.id}
                a={a}
                T={T}
                isLast={index === accounts.length - 1}
                openSwipeId={openSwipeId}
                onRequestSwipeOpen={setOpenSwipeId}
                actions={swipeActionsFor(a)}
                onTap={() => onSelectAccount(a.id)}
            />
        ));

    return (
        <>
            {bankAccounts.length === 0 && (
                <div
                    style={{
                        textAlign: "center",
                        padding: "60px 20px",
                        color: "var(--fg-soft)",
                    }}
                >
                    <div style={{ marginBottom: 14, opacity: 0.4 }}>
                        <Icon name="accounts" size={36} />
                    </div>
                    <div style={{ fontSize: 14, marginBottom: 8 }}>
                        {T("no_accounts")}
                    </div>
                </div>
            )}

            {groups.map(({ type, accounts }) => {
                const typeTotal = accounts.reduce(
                    (sum, a) => sum + parseFloat(a.current_value || "0"),
                    0,
                );
                return (
                    <GroupedList
                        key={type.id}
                        title={
                            <span
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 8,
                                    justifyContent: "space-between",
                                    fontSize: 13,
                                    fontWeight: 600,
                                    color: "var(--fg)",
                                }}
                            >
                                <span
                                    style={{
                                        display: "inline-flex",
                                        alignItems: "center",
                                        gap: 8,
                                    }}
                                >
                                    <CategoryDot
                                        color={type.color || "var(--accent)"}
                                        size={8}
                                    />
                                    {type.name}
                                </span>
                                <span
                                    className="num"
                                    style={{ letterSpacing: 0 }}
                                >
                                    {masked(
                                        "account_values",
                                        formatEur(typeTotal),
                                    )}
                                </span>
                            </span>
                        }
                    >
                        {renderRows(accounts)}
                    </GroupedList>
                );
            })}

            {ungroupedAccounts.length > 0 && (
                <GroupedList>{renderRows(ungroupedAccounts)}</GroupedList>
            )}

            {archivedBankAccounts.length > 0 && (
                <GroupedList style={{ marginTop: 24 }}>
                    <GroupedList.Item
                        label={`${T("label_archived_accounts")} (${archivedBankAccounts.length})`}
                        icon={<Icon name="archive" size={16} />}
                        onClick={() => setArchivedExpanded((p) => !p)}
                        action={
                            <span
                                aria-hidden="true"
                                style={{
                                    display: "inline-block",
                                    color: "var(--fg-faint)",
                                    fontSize: 17,
                                    transform: archivedExpanded
                                        ? "rotate(90deg)"
                                        : "rotate(0deg)",
                                    transition: "transform 0.18s ease",
                                }}
                            >
                                ›
                            </span>
                        }
                    />
                    {archivedExpanded && renderRows(archivedBankAccounts)}
                </GroupedList>
            )}
        </>
    );
}
