"use client";

import { useRef } from "react";
import type { ReactNode } from "react";
import { useApp } from "../../context/useApp";
import { useFormatters } from "../../utils/useFormatters";
import { formatDate } from "../../utils/formatters";
import { BottomSheet, ToggleSwitch } from "../ui";
import type { CfItem } from "./CfTransactionRow";

function Field({ label, value }: { label: ReactNode; value: ReactNode }) {
    return (
        <div
            style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12,
                padding: "13px 16px",
                borderBottom: "1px solid var(--card-inset)",
            }}
        >
            <span style={{ color: "var(--fg-soft)", fontSize: 14 }}>
                {label}
            </span>
            <span
                style={{
                    color: "var(--fg)",
                    fontSize: 14,
                    fontWeight: 600,
                    maxWidth: "64%",
                    textAlign: "right",
                    wordBreak: "break-word",
                }}
            >
                {value}
            </span>
        </div>
    );
}

// Tap-to-detail bottom sheet: read-only fields + a Verificato toggle (hidden
// for adjustments and split rows, mirroring bulkActionsAllowed) + Modifica /
// Elimina — for split rows these become "Apri in Split" and/or disappear
// (piano Batch 1, see the split_* flags below). Edit and delete dispatch back
// to the existing flows in the parent (so the delete confirm + double-leg
// handling are unchanged).
export default function CfDetailSheet({
    item,
    open,
    onClose,
    onEdit,
    onDelete,
    onVerifyToggle,
}: {
    item: CfItem | null;
    open: boolean;
    onClose: () => void;
    onEdit: (item: CfItem) => void;
    onDelete: (item: CfItem) => void;
    onVerifyToggle: (item: CfItem) => void;
}) {
    const { T } = useApp();
    const { formatEur } = useFormatters();

    // Keep showing the last item through the close animation.
    const lastRef = useRef(item);
    if (item) lastRef.current = item;
    const data = item || lastRef.current;

    const isTransfer = data?.source_type === "transfer";
    const isAdjustment = data?.source_type === "adjustment";
    const isSplitExpense = data?.source_type === "split_expense";
    const isSplitSettlement = data?.source_type === "split_settlement";
    // Split rows are always is_verified=True from creation (no "pending"
    // concept in the Split domain, splitting/signals.py) and the bulk
    // endpoint doesn't recognize their feed ids anyway (expenses/bulk.py) —
    // hide the toggle rather than wire it to a dead endpoint (mirrors
    // CashflowFeed.tsx's canVerify for the row's own swipe action).
    const canVerify = !isAdjustment && !isSplitExpense && !isSplitSettlement;
    // A settlement with a known group can be deleted from its group page in
    // Split; one without (cross-group, registered from the overview) has no
    // list to land on there, so it deletes in place instead (see
    // splitting/views/settlements.py: no update endpoint either way).
    const splitSettlementHasGroup = isSplitSettlement && data?.group_id != null;
    const openInSplit = isSplitExpense || splitSettlementHasGroup;
    const showEdit = !isSplitSettlement || splitSettlementHasGroup;
    const showDelete = !openInSplit;
    const editLabel = openInSplit ? T("cf_open_in_split") : T("cf_bulk_edit");

    // "split" is a shared expense's net personal quota — real outcome money
    // (piano sez. 5, decision #3) — same treatment CfTransactionRow already
    // gives it; this sheet had not been updated to match, so it kept
    // rendering a split row's hero amount in the neutral "±" grey a
    // transfer/adjustment gets instead of the red "-" a real expense gets.
    const isOutcome = data?.type === "outcome" || data?.type === "split";
    const typeColor = !data
        ? "var(--fg)"
        : data.type === "income"
          ? "var(--success)"
          : isOutcome
            ? "var(--danger)"
            : "var(--fg-soft)";
    const sign = !data
        ? ""
        : data.type === "income"
          ? "+"
          : isOutcome
            ? "-"
            : "±";
    const catColor = data?.category?.color || "var(--fg-soft)";
    const catIcon =
        data?.category?.icon || (isTransfer ? "⇄" : isAdjustment ? "≈" : "•");
    const categoryText = data?.category?.name || null;
    const accountText =
        isTransfer && data?.from_account && data?.to_account
            ? `${data.from_account.name} → ${data.to_account.name}`
            : isAdjustment && data?.account
              ? data.account.name
              : data?.account?.name || null;
    const title =
        data?.description ||
        (data?.type === "adjustment" ? T("cf_adjustment_default") : null) ||
        (data?.type === "transfer"
            ? T("cf_transfer_default_in").replace(
                  "{account}",
                  data?.from_account?.name ?? "",
              )
            : null) ||
        categoryText ||
        "—";

    return (
        <BottomSheet open={open} onClose={onClose} ariaLabel={title}>
            {data && (
                <div style={{ padding: "4px 0 0" }}>
                    {/* hero */}
                    <div
                        style={{
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            gap: 10,
                            padding: "8px 18px 18px",
                        }}
                    >
                        <div
                            style={{
                                width: 60,
                                height: 60,
                                borderRadius: 18,
                                background: catColor + "22",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: 28,
                                color: catColor,
                            }}
                        >
                            {catIcon}
                        </div>
                        <div
                            style={{
                                fontSize: 18,
                                fontWeight: 600,
                                color: "var(--fg)",
                            }}
                        >
                            {title}
                        </div>
                        <div
                            style={{
                                fontSize: 30,
                                fontWeight: 600,
                                color: typeColor,
                                fontVariantNumeric: "tabular-nums",
                            }}
                        >
                            {sign}
                            {formatEur(data.amount)}
                        </div>
                    </div>

                    {/* fields */}
                    <div
                        style={{
                            background: "var(--card-inset)",
                            borderRadius: 16,
                            margin: "0 14px",
                            overflow: "hidden",
                        }}
                    >
                        {categoryText && (
                            <Field
                                label={T("category_label")}
                                value={`${data.category?.icon ? String(data.category.icon) + " " : ""}${categoryText}`}
                            />
                        )}
                        {accountText && (
                            <Field
                                label={
                                    isTransfer
                                        ? T("cf_detail_route")
                                        : T("account_label")
                                }
                                value={accountText}
                            />
                        )}
                        {isSplitExpense && data.gross_amount && (
                            <Field
                                label={T("cf_split_gross_amount_label")}
                                value={formatEur(data.gross_amount)}
                            />
                        )}
                        <Field
                            label={T("cf_edit_date")}
                            value={formatDate(data.date)}
                        />
                        {canVerify && (
                            <div
                                style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    alignItems: "center",
                                    padding: "11px 16px",
                                }}
                            >
                                <span
                                    style={{
                                        color: "var(--fg-soft)",
                                        fontSize: 14,
                                    }}
                                >
                                    {T("cf_verified")}
                                </span>
                                <ToggleSwitch
                                    checked={!!data.is_verified}
                                    onChange={() => onVerifyToggle(data)}
                                />
                            </div>
                        )}
                    </div>

                    {!data.is_verified && (
                        <div
                            style={{
                                margin: "12px 14px 0",
                                padding: "10px 14px",
                                borderRadius: 12,
                                background: "var(--warning-soft)",
                                color: "var(--warning)",
                                fontSize: 13,
                                display: "flex",
                                gap: 8,
                                alignItems: "center",
                            }}
                        >
                            <span aria-hidden="true">⚠︎</span>
                            {T("cf_unverified_excluded")}
                        </div>
                    )}

                    {isSplitExpense && data.gross_amount && (
                        <div
                            style={{
                                margin: "12px 14px 0",
                                padding: "10px 14px",
                                borderRadius: 12,
                                background: "var(--card-inset)",
                                color: "var(--fg-soft)",
                                fontSize: 13,
                            }}
                        >
                            {T("cf_split_net_quota_hint")}
                        </div>
                    )}

                    {/* actions */}
                    <div
                        style={{
                            display: "flex",
                            gap: 10,
                            padding: "16px 14px 0",
                        }}
                    >
                        {showEdit && (
                            <button
                                type="button"
                                data-testid="cf-detail-edit"
                                onClick={() => onEdit(data)}
                                style={{
                                    flex: 1,
                                    padding: "14px",
                                    borderRadius: 14,
                                    border: 0,
                                    background: "var(--btn-primary-bg)",
                                    color: "var(--btn-primary-fg)",
                                    fontSize: 16,
                                    fontWeight: 600,
                                    cursor: "pointer",
                                    fontFamily: "inherit",
                                }}
                            >
                                {editLabel}
                            </button>
                        )}
                        {showDelete && (
                            <button
                                type="button"
                                data-testid="cf-detail-delete"
                                onClick={() => onDelete(data)}
                                style={{
                                    padding: "14px 18px",
                                    borderRadius: 14,
                                    border: 0,
                                    background: "var(--danger-soft)",
                                    color: "var(--danger)",
                                    fontSize: 16,
                                    fontWeight: 600,
                                    cursor: "pointer",
                                    fontFamily: "inherit",
                                }}
                            >
                                {T("cf_bulk_delete")}
                            </button>
                        )}
                    </div>
                </div>
            )}
        </BottomSheet>
    );
}
