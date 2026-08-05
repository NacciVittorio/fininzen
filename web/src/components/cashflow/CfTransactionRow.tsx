"use client";

import type { ReactNode } from "react";
import { useApp } from "../../context/useApp";
import { useFormatters } from "../../utils/useFormatters";
import { isOutcomeMoney, splitRowActions } from "../../utils/cashflowItemKind";
import { Icon, SwipeRow } from "../ui";
import type { SwipeAction } from "../ui/SwipeRow";

type CfAccount = { name?: string };
type CfCategory = { icon?: ReactNode; color?: string; name?: string };

export type CfItem = {
    id: number | string;
    source_type?: string;
    source_id?: number | string;
    is_verified?: boolean;
    type?: string;
    date?: string;
    category?: CfCategory | null;
    from_account?: CfAccount | null;
    to_account?: CfAccount | null;
    account?: CfAccount | null;
    description?: string | null;
    amount: number | string;
    // split_settlement only — null for a cross-group settlement (see
    // expenses/cashflow.py::_split_reimbursement_to_item). Decides whether
    // Edit/Delete route to Split or fall back to an in-place delete here.
    group_id?: number | string | null;
    // split_expense only — the full amount charged to the account, shown
    // alongside the net personal quota in CfDetailSheet.
    gross_amount?: string;
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
    const isOutcome = isOutcomeMoney(item);
    const typeColor =
        item.type === "income"
            ? "var(--success)"
            : isOutcome
              ? "var(--danger)"
              : "var(--fg-soft)";
    const sign = item.type === "income" ? "+" : isOutcome ? "-" : "±";
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

    const { openInSplit, showEditAction, showDeleteAction } =
        splitRowActions(item);
    const editLabel = openInSplit ? T("cf_open_in_split") : T("cf_bulk_edit");

    // Left-swipe (finger right→left) → Edit + Delete (right edge).
    const editDeleteActions: SwipeAction[] = [
        ...(showEditAction
            ? [
                  {
                      key: "edit",
                      label: editLabel,
                      icon: (
                          <Icon
                              name={openInSplit ? "split" : "edit"}
                              size={16}
                          />
                      ),
                      background: "var(--accent)",
                      onPress: () => onEdit(item),
                      testId: `cf-row-swipe-edit-${item.id}`,
                  },
              ]
            : []),
        ...(showDeleteAction
            ? [
                  {
                      key: "delete",
                      label: T("cf_bulk_delete"),
                      icon: <Icon name="trash" size={16} />,
                      background: "var(--danger)",
                      onPress: () => onDelete(item),
                      testId: `cf-row-swipe-delete-${item.id}`,
                  },
              ]
            : []),
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
                padding: "13px 18px",
                gap: 12,
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
                        margin: "-13px 0 -13px -4px",
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
                            fontWeight: 600,
                            transition: "background 0.12s, border-color 0.12s",
                        }}
                    >
                        {selected ? "✓" : ""}
                    </span>
                </span>
            )}

            <div
                style={{
                    width: 38,
                    height: 38,
                    borderRadius: 10,
                    background: catColor + "22",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 18,
                    flexShrink: 0,
                    color: catColor,
                }}
            >
                {catIcon}
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span
                        style={{
                            fontSize: 16,
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
                    {(item.type === "split" ||
                        item.type === "split_reimbursement") && (
                        <span
                            data-testid={`cf-row-split-badge-${item.id}`}
                            style={{
                                fontSize: 11,
                                fontWeight: 600,
                                padding: "2px 7px",
                                borderRadius: 999,
                                background: "var(--accent-soft)",
                                color: "var(--accent-deep)",
                                flexShrink: 0,
                            }}
                        >
                            {T("cf_split_badge")}
                        </span>
                    )}
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
                        fontSize: 13,
                        color: "var(--fg-soft)",
                        marginTop: 3,
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
                    fontSize: 16,
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
