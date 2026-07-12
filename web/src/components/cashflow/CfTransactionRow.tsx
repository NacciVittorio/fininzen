"use client";

import type { ReactNode } from "react";
import { useApp } from "../../context/useApp";
import { useFormatters } from "../../utils/useFormatters";
import { Icon, SwipeRow } from "../ui";
import type { SwipeAction } from "../ui/SwipeRow";

type CfAccount = { name?: string };
type CfCategory = { icon?: ReactNode; color?: string; name?: string };

export type CfItem = {
    id: number | string;
    source_type?: string;
    is_verified?: boolean;
    type?: string;
    date?: string;
    category?: CfCategory | null;
    from_account?: CfAccount | null;
    to_account?: CfAccount | null;
    account?: CfAccount | null;
    description?: string | null;
    amount: number | string;
};

type CfTransactionRowProps = {
    item: CfItem;
    selectionMode?: boolean;
    selected?: boolean;
    swipeOpen?: boolean;
    onRequestSwipeOpen?: (id: string | number | null) => void;
    onToggleSelect: (item: CfItem) => void;
    onOpenDetail: (item: CfItem) => void;
    onEdit: (item: CfItem) => void;
    onVerifyToggle: (item: CfItem) => void;
    onDelete: (item: CfItem) => void;
    canVerify?: boolean;
};

// One clean Cash Flow row, built on the shared SwipeRow. Verified is silent;
// only unverified rows show an amber dot. Tap opens the detail sheet.
// Bidirectional swipe (Pointer Events, degrades to tap on desktop):
//   • left-swipe (finger right→left) reveals Edit + Delete
//   • right-swipe (finger left→right) reveals Verify
// In selection mode the swipe is disabled and a checkbox is shown instead.
export default function CfTransactionRow({
    item,
    selectionMode,
    selected,
    swipeOpen,
    onRequestSwipeOpen,
    onToggleSelect,
    onOpenDetail,
    onEdit,
    onVerifyToggle,
    onDelete,
    canVerify,
}: CfTransactionRowProps) {
    const { T } = useApp();
    const { formatEur } = useFormatters();

    const isTransfer = item.source_type === "transfer";
    const isAdjustment = item.source_type === "adjustment";
    const isVerified = item.is_verified;
    const typeColor =
        item.type === "income"
            ? "var(--success)"
            : item.type === "outcome"
              ? "var(--danger)"
              : "var(--fg-soft)";
    const sign =
        item.type === "income" ? "+" : item.type === "outcome" ? "-" : "±";
    const catIcon =
        item.category?.icon ||
        (isTransfer ? (
            <Icon name="transfer" size={16} />
        ) : isAdjustment ? (
            <Icon name="status" size={16} />
        ) : (
            <Icon name="cashflow" size={16} />
        ));
    const catColor = item.category?.color || "var(--fg-soft)";
    const accountText =
        isTransfer && item.from_account && item.to_account
            ? `${item.from_account.name} → ${item.to_account.name}`
            : isAdjustment && item.account
              ? item.account.name
              : item.account?.name || null;
    const categoryText = item.category?.name || null;
    const title =
        item.description ||
        (item.type === "adjustment" ? T("cf_adjustment_default") : null) ||
        (item.type === "transfer"
            ? T("cf_transfer_default_in").replace(
                  "{account}",
                  item.from_account?.name ?? "",
              )
            : null) ||
        categoryText ||
        "—";

    // Left-swipe (finger right→left) → Edit + Delete (right edge).
    const editDeleteActions: SwipeAction[] = [
        {
            key: "edit",
            label: T("cf_bulk_edit"),
            icon: <Icon name="edit" size={16} />,
            background: "var(--accent)",
            onPress: () => onEdit(item),
            testId: `cf-row-swipe-edit-${item.id}`,
        },
        {
            key: "delete",
            label: T("cf_bulk_delete"),
            icon: <Icon name="trash" size={16} />,
            background: "var(--danger)",
            onPress: () => onDelete(item),
            testId: `cf-row-swipe-delete-${item.id}`,
        },
    ];

    // Right-swipe (finger left→right) → Verify (left edge).
    const verifyActions: SwipeAction[] = canVerify
        ? [
              {
                  key: "verify",
                  label: isVerified
                      ? T("cf_bulk_unverify")
                      : T("cf_bulk_verify"),
                  icon: <span style={{ fontSize: 16 }}>✓</span>,
                  background: "var(--success)",
                  onPress: () => onVerifyToggle(item),
                  testId: `cf-row-swipe-verify-${item.id}`,
              },
          ]
        : [];

    return (
        <SwipeRow
            rowId={item.id}
            openRowId={swipeOpen ? item.id : null}
            onRequestOpen={onRequestSwipeOpen}
            actions={editDeleteActions}
            leftActions={verifyActions}
            disabled={selectionMode}
            onTap={() =>
                selectionMode ? onToggleSelect(item) : onOpenDetail(item)
            }
            style={{ borderBottom: "1px solid var(--card-inset)" }}
            rowClassName={`tx-row${selected ? " is-selected" : ""}`}
            rowStyle={{
                padding: "11px 14px",
                background: selected ? "var(--accent-soft)" : "var(--card)",
            }}
            role={selectionMode ? "checkbox" : "button"}
            ariaChecked={selectionMode ? selected : undefined}
        >
            {selectionMode && (
                <span
                    data-testid={`cf-row-checkbox-${item.id}`}
                    aria-hidden="true"
                    style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: 44,
                        height: 44,
                        margin: "-11px 0 -11px -4px",
                        flexShrink: 0,
                    }}
                >
                    <span
                        style={{
                            width: 22,
                            height: 22,
                            borderRadius: 6,
                            border: selected
                                ? "2px solid var(--accent)"
                                : "1.5px solid var(--rule)",
                            background: selected
                                ? "var(--accent)"
                                : "transparent",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            color: "var(--btn-primary-fg, #fff)",
                            fontSize: 14,
                            fontWeight: 700,
                            transition: "background 0.12s, border-color 0.12s",
                        }}
                    >
                        {selected ? "✓" : ""}
                    </span>
                </span>
            )}

            <div
                style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    background: catColor + "22",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 15,
                    flexShrink: 0,
                    color: catColor,
                }}
            >
                {catIcon}
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    <span
                        style={{
                            fontSize: 14,
                            fontWeight: 600,
                            color: "var(--fg)",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            minWidth: 0,
                        }}
                    >
                        {title}
                    </span>
                    {!isVerified && (
                        <span
                            data-testid={`cf-row-unverified-${item.id}`}
                            role="img"
                            aria-label={T("cf_unverified")}
                            title={T("cf_unverified")}
                            style={{
                                width: 8,
                                height: 8,
                                borderRadius: 99,
                                background: "var(--warning)",
                                boxShadow: "0 0 0 3px var(--warning-soft)",
                                flexShrink: 0,
                            }}
                        />
                    )}
                </div>
                <div
                    style={{
                        fontSize: 11,
                        color: "var(--fg-soft)",
                        marginTop: 2,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                    }}
                >
                    {categoryText}
                    {categoryText && accountText && " — "}
                    {accountText}
                </div>
            </div>

            <span
                style={{
                    fontSize: 14,
                    fontWeight: 600,
                    fontFamily: "var(--font-mono)",
                    fontVariantNumeric: "tabular-nums",
                    color: typeColor,
                    flexShrink: 0,
                }}
            >
                {sign}
                {formatEur(item.amount)}
            </span>
        </SwipeRow>
    );
}
