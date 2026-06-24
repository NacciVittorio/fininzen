"use client";

import type { ReactNode } from "react";
import { useFormatters } from "../../utils/useFormatters";
import PrivacyValue from "../../components/PrivacyValue";
import { BottomSheet, CategoryDot, Icon } from "../../components/ui";
import type { Asset } from "../../api/types";
import type { CashflowTrendPoint } from "../../api/expenses";
import type { Translator } from "../../types";
import type { EntityId } from "../../context/feedTypes";

function StatTile({
    label,
    value,
    color,
    onClick,
}: {
    label: ReactNode;
    value: ReactNode;
    color?: string;
    onClick?: () => void;
}) {
    return (
        <div
            className={onClick ? "pressable" : undefined}
            onClick={onClick}
            style={{
                background: "var(--card-inset)",
                borderRadius: "var(--r-input)",
                padding: "10px 12px",
                cursor: onClick ? "pointer" : "default",
            }}
        >
            <div
                className="label"
                style={{
                    marginBottom: 4,
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                }}
            >
                {label}
                {onClick && <span aria-hidden="true">›</span>}
            </div>
            <div
                className="num"
                style={{
                    fontSize: 14,
                    fontWeight: 700,
                    color: color || "var(--fg)",
                }}
            >
                {value}
            </div>
        </div>
    );
}

export default function AccountDetailSheet({
    a,
    open,
    onClose,
    T,
    trendIncomes,
    trendExpenses,
    accountInvestments,
    onEdit,
    onAdjust,
    onArchive,
    onUnarchive,
    onDelete,
    onGoExpenses,
    onGoIncome,
    onGoInvestments,
}: {
    a: Asset | null;
    open: boolean;
    onClose: () => void;
    T: Translator;
    trendIncomes: readonly CashflowTrendPoint[];
    trendExpenses: readonly CashflowTrendPoint[];
    accountInvestments: number;
    onEdit?: (asset: Asset) => void;
    onAdjust?: (asset: Asset) => void;
    onArchive?: (asset: Asset) => void | Promise<unknown>;
    onUnarchive?: (id: EntityId) => void | Promise<unknown>;
    onDelete?: (id: EntityId) => void | Promise<unknown>;
    onGoExpenses?: (() => void) | null;
    onGoIncome?: (() => void) | null;
    onGoInvestments?: (() => void) | null;
}) {
    const { formatEur } = useFormatters();
    if (!a) return null;
    const typeDetail = a.investment_type_detail;
    const acctIncome = trendIncomes
        .filter((e) => String(e.linked_asset) === String(a.id))
        .reduce((s, e) => s + parseFloat(String(e.amount || 0)), 0);
    const acctOutcome = trendExpenses
        .filter((e) => String(e.linked_asset) === String(a.id))
        .reduce((s, e) => s + parseFloat(String(e.amount || 0)), 0);
    const masked = (key: string, value: ReactNode) => (
        <PrivacyValue scope="accounts" field={key}>
            {value}
        </PrivacyValue>
    );
    const actionBtnStyle = {
        flex: 1,
        background: "var(--card-inset)",
        border: "1px solid var(--rule)",
        color: "var(--fg)",
        cursor: "pointer",
        fontSize: 13,
        fontWeight: 600,
        minHeight: 44,
        padding: "10px 12px",
        borderRadius: "var(--r-input)",
        fontFamily: "inherit",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
    };

    return (
        <BottomSheet open={open} onClose={onClose} ariaLabel={a.name}>
            <div style={{ padding: "8px 18px 18px" }}>
                <div style={{ marginBottom: 14 }}>
                    <div
                        style={{
                            fontSize: 17,
                            fontWeight: 800,
                            color: "var(--fg)",
                            letterSpacing: "var(--ls-h-small)",
                        }}
                    >
                        {a.name}
                    </div>
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                            marginTop: 6,
                            fontSize: 12,
                            color: "var(--fg-soft)",
                        }}
                    >
                        <CategoryDot
                            color={typeDetail?.color || "var(--accent)"}
                            size={7}
                        />
                        {typeDetail?.name || "Account"}
                        {a.is_archived && <span>· {T("label_archived")}</span>}
                    </div>
                </div>

                <div
                    className="mob-grid-2"
                    style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: 8,
                        marginBottom: 14,
                    }}
                >
                    <StatTile
                        label={T("current")}
                        value={masked(
                            "account_values",
                            formatEur(a.current_value),
                        )}
                    />
                    {onGoInvestments && (
                        <StatTile
                            label={T("accounts_investments_total")}
                            value={masked(
                                "account_values",
                                formatEur(accountInvestments),
                            )}
                            color="var(--accent)"
                            onClick={() => {
                                onClose();
                                onGoInvestments();
                            }}
                        />
                    )}
                    {onGoExpenses && acctOutcome > 0 && (
                        <StatTile
                            label={T("direction_expense")}
                            value={masked(
                                "account_values",
                                formatEur(acctOutcome),
                            )}
                            color="var(--danger)"
                            onClick={() => {
                                onClose();
                                onGoExpenses();
                            }}
                        />
                    )}
                    {onGoIncome && acctIncome > 0 && (
                        <StatTile
                            label={T("direction_income")}
                            value={masked(
                                "account_values",
                                formatEur(acctIncome),
                            )}
                            color="var(--success)"
                            onClick={() => {
                                onClose();
                                onGoIncome();
                            }}
                        />
                    )}
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {!a.is_archived && onEdit && (
                        <button
                            className="pressable"
                            style={actionBtnStyle}
                            onClick={() => {
                                onClose();
                                onEdit(a);
                            }}
                        >
                            {T("btn_edit", "Edit")}
                        </button>
                    )}
                    {!a.is_archived && onAdjust && (
                        <button
                            className="pressable"
                            style={actionBtnStyle}
                            onClick={() => {
                                onClose();
                                onAdjust(a);
                            }}
                        >
                            {T("btn_adjust_balance")}
                        </button>
                    )}
                    {!a.is_archived && onArchive && (
                        <button
                            className="pressable"
                            style={{
                                ...actionBtnStyle,
                                color: "var(--warning)",
                            }}
                            onClick={() => {
                                onClose();
                                onArchive(a);
                            }}
                        >
                            <Icon name="archive" size={15} /> {T("btn_archive")}
                        </button>
                    )}
                    {a.is_archived && onUnarchive && (
                        <button
                            className="pressable"
                            style={{
                                ...actionBtnStyle,
                                color: "var(--accent)",
                            }}
                            onClick={() => {
                                onClose();
                                onUnarchive(a.id);
                            }}
                        >
                            {T("btn_unarchive")}
                        </button>
                    )}
                    {onDelete && (
                        <button
                            className="pressable"
                            style={{
                                ...actionBtnStyle,
                                color: "var(--danger)",
                                flex: "0 0 auto",
                            }}
                            onClick={() => {
                                if (window.confirm(T("asset_delete_confirm"))) {
                                    onClose();
                                    onDelete(a.id);
                                }
                            }}
                        >
                            <Icon name="trash" size={15} />{" "}
                            {T("btn_delete", "Delete")}
                        </button>
                    )}
                </div>

                {a.notes && (
                    <div
                        style={{
                            marginTop: 12,
                            fontSize: 12,
                            color: "var(--fg-soft)",
                            fontStyle: "italic",
                        }}
                    >
                        {a.notes}
                    </div>
                )}
            </div>
        </BottomSheet>
    );
}
