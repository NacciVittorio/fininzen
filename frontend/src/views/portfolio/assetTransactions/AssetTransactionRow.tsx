import type { ReactNode } from "react";
import { Icon } from "../../../components/ui";
import type { NumericValue, Translator } from "../../../types";
import type { EntityId } from "../../../context/feedTypes";
import type { AssetTransactionFeedItem } from "../../../context/useAssetTransactionFeed";

export default function AssetTransactionRow({
    T,
    item,
    activeActionRow,
    setActiveActionRow,
    assetTxSelectionMode,
    isAssetTxItemSelected,
    toggleAssetTxItemSelected,
    openEditTransaction,
    setTxDeleteConfirm,
    masked,
    formatEur,
}: {
    T: Translator;
    item: AssetTransactionFeedItem;
    activeActionRow: string | null;
    setActiveActionRow: (value: string | null) => void;
    assetTxSelectionMode: boolean;
    isAssetTxItemSelected: (id: EntityId) => boolean;
    toggleAssetTxItemSelected: (id: EntityId) => void;
    openEditTransaction: (item: AssetTransactionFeedItem) => void;
    setTxDeleteConfirm: (item: AssetTransactionFeedItem) => void;
    masked: (scope: string, value: string) => ReactNode;
    formatEur: (value: NumericValue) => string;
}) {
    const isArchivedTx = Boolean(item.asset?.is_archived);
    const rowSelected =
        assetTxSelectionMode && !isArchivedTx && isAssetTxItemSelected(item.id);

    const typeMetaByType: Record<
        string,
        { sign: string; color: string; icon: ReactNode }
    > = {
        buy: {
            sign: "-",
            color: "var(--danger)",
            icon: <Icon name="investments" size={16} />,
        },
        sell: {
            sign: "+",
            color: "var(--success)",
            icon: <Icon name="investments" size={16} />,
        },
        cash_in: {
            sign: "+",
            color: "var(--success)",
            icon: <Icon name="cashflow" size={16} />,
        },
        cash_out: {
            sign: "-",
            color: "var(--danger)",
            icon: <Icon name="cashflow" size={16} />,
        },
        adjustment: {
            sign: "±",
            color: "var(--fg-soft)",
            icon: <Icon name="status" size={16} />,
        },
    };
    const typeMeta = typeMetaByType[item.transaction_type ?? ""] || {
        sign: "",
        color: "var(--fg-soft)",
        icon: "•",
    };

    return (
        <div
            className={`tx-row${activeActionRow === `tx-${item.id}` ? " is-active" : ""}${rowSelected ? " is-selected" : ""}`}
            tabIndex={0}
            onFocus={() => setActiveActionRow(`tx-${item.id}`)}
            onBlur={() => setActiveActionRow(null)}
            onPointerEnter={() => setActiveActionRow(`tx-${item.id}`)}
            onPointerLeave={() => setActiveActionRow(null)}
            onClick={() => {
                if (isArchivedTx) return;
                if (assetTxSelectionMode) {
                    toggleAssetTxItemSelected(item.id);
                } else {
                    openEditTransaction(item);
                }
            }}
            style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 14px",
                borderBottom: "1px solid var(--card-inset)",
                cursor: isArchivedTx ? "default" : "pointer",
                background: rowSelected ? "var(--accent-soft)" : undefined,
                opacity: isArchivedTx ? 0.82 : 1,
            }}
        >
            {assetTxSelectionMode && !isArchivedTx && (
                <input
                    type="checkbox"
                    checked={rowSelected}
                    onChange={() => toggleAssetTxItemSelected(item.id)}
                    onClick={(event) => event.stopPropagation()}
                    aria-label={T("cf_bulk_select")}
                    style={{ flexShrink: 0 }}
                />
            )}
            <div
                style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    background: "var(--card-inset)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 15,
                    flexShrink: 0,
                }}
            >
                {item.asset?.icon || typeMeta.icon}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
                <div
                    style={{
                        fontSize: 13,
                        fontWeight: 500,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                    }}
                >
                    {item.asset?.name || "—"}
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
                    {T(`tx_type_${item.transaction_type}`)}
                    {item.shares && item.price_per_share
                        ? ` · ${parseFloat(item.shares)} × ${parseFloat(
                              item.price_per_share,
                          ).toFixed(4)} ${item.asset?.currency || "EUR"}`
                        : ""}
                    {item.linked_account_name
                        ? ` · ${
                              item.linked_account_direction === "source"
                                  ? T("tx_source_account")
                                  : T("tx_dest_account")
                          }: ${item.linked_account_name}`
                        : ""}
                    {item.contribution_source_name
                        ? ` · ${T("label_contribution_source")}: ${
                              item.contribution_source_name
                          }`
                        : ""}
                    {parseFloat(item.fee || "0") > 0
                        ? ` · ${T("tx_fee")}: ${formatEur(item.fee)}`
                        : ""}
                    {parseFloat(item.tax_amount || "0") > 0
                        ? ` · ${T("tx_tax_paid")}: ${formatEur(item.tax_amount)}`
                        : ""}
                    {isArchivedTx ? ` · ${T("label_archived")}` : ""}
                    {(() => {
                        const label =
                            item.notes ||
                            (item.transaction_type === "cash_in" &&
                            !item.derived_from
                                ? T("cf_opening_balance")
                                : "");
                        return label ? ` · ${label}` : "";
                    })()}
                </div>
            </div>
            {!item.is_verified && (
                <span
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
            <span
                style={{
                    fontSize: 14,
                    fontWeight: 600,
                    fontFamily: "var(--font-mono)",
                    color: typeMeta.color,
                    flexShrink: 0,
                }}
            >
                {typeMeta.sign}
                {masked(
                    "transactions",
                    formatEur(item.cash_flow_value ?? item.total_value),
                )}
            </span>
            {!assetTxSelectionMode && !isArchivedTx && (
                <button
                    className="btn btn-g btn-sm tx-delete"
                    style={{
                        fontSize: 11,
                        padding: "4px 8px",
                        flexShrink: 0,
                    }}
                    onClick={(event) => {
                        event.stopPropagation();
                        setTxDeleteConfirm(item);
                    }}
                    aria-label={T("btn_delete")}
                >
                    ×
                </button>
            )}
        </div>
    );
}
