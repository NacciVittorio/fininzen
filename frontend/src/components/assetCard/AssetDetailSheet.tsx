import type { CSSProperties, ReactNode } from "react";
import { BottomSheet, CategoryDot, Icon } from "../ui";
import Sparkline from "./Sparkline";
import StatCell from "./StatCell";
import type { PricePoint } from "./priceHistory";

type AssetLike = {
    id: number | string;
    name?: string;
    ticker?: string;
    is_archived?: boolean;
    invested_capital?: number | string;
    currency?: string;
    current_value_eur?: number | string | null;
    current_value?: number | string;
    shares?: number | string | null;
    price_per_share?: number | string | null;
    source_account_name?: string;
    notes?: string;
    isin?: string;
};

type AssetDetailSheetProps = {
    asset: AssetLike;
    open: boolean;
    onClose: () => void;
    allocPct: number | null;
    avgCost: number | null;
    canLoadHistory: boolean;
    historyWarning: { tone: string; text: string } | null;
    loadingChart: boolean;
    priceHistory: PricePoint[] | null;
    setShowChart: (v: boolean) => void;
    weekData: PricePoint[] | null;
    typeColor?: string;
    typeName?: ReactNode;
    isManual?: boolean;
    hasTicker?: boolean;
    gain: number;
    gainPct: number;
    isValueHidden?: (section: string, key: string) => boolean;
    onAdjust?: (asset: AssetLike) => void;
    onArchive?: (asset: AssetLike) => void;
    onDelete?: (id: number | string) => void;
    onEdit?: (asset: AssetLike) => void;
    onMove?: (asset: AssetLike) => void;
    onRealize?: (asset: AssetLike) => void;
    onUnarchive?: (id: number | string) => void;
    T: (key: string, fallback?: string) => string;
    masked: (value: ReactNode) => ReactNode;
    formatEur: (value: number | string) => string;
    actionBtnStyle?: CSSProperties;
};

export default function AssetDetailSheet({
    asset: a,
    open,
    onClose,
    allocPct,
    avgCost,
    canLoadHistory,
    historyWarning,
    loadingChart,
    priceHistory,
    setShowChart,
    weekData,
    typeColor,
    typeName,
    isManual,
    hasTicker,
    gain,
    gainPct,
    isValueHidden,
    onAdjust,
    onArchive,
    onDelete,
    onEdit,
    onMove,
    onRealize,
    onUnarchive,
    T,
    masked,
    formatEur,
    actionBtnStyle,
}: AssetDetailSheetProps) {
    const detailOpen = open;
    const setDetailOpen = (next: boolean) => {
        if (!next) onClose();
    };
    return (
        <BottomSheet
            open={detailOpen}
            onClose={() => setDetailOpen(false)}
            ariaLabel={a.name}
        >
            <div style={{ padding: "8px 18px 18px" }}>
                <div style={{ marginBottom: 14 }}>
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            minWidth: 0,
                        }}
                    >
                        <span
                            style={{
                                fontSize: 17,
                                fontWeight: 800,
                                color: "var(--fg)",
                                letterSpacing: "var(--ls-h-small)",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                            }}
                        >
                            {a.name}
                        </span>
                        {a.ticker && (
                            <span
                                className="tag num"
                                style={{
                                    background: "var(--card-inset)",
                                    color: "var(--fg-soft)",
                                    flexShrink: 0,
                                }}
                            >
                                {a.ticker}
                            </span>
                        )}
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
                        <CategoryDot color={typeColor} size={7} />
                        {typeName}
                        {a.is_archived && <span>· {T("label_archived")}</span>}
                    </div>
                </div>

                <div
                    style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: 6,
                        marginBottom: hasTicker ? 10 : 0,
                    }}
                >
                    <StatCell
                        label={T("invested")}
                        value={masked(formatEur(a.invested_capital ?? 0))}
                    />
                    <StatCell
                        label={T("current")}
                        value={masked(
                            a.currency &&
                                a.currency !== "EUR" &&
                                a.current_value_eur != null
                                ? formatEur(a.current_value_eur)
                                : formatEur(a.current_value ?? 0),
                        )}
                        sub={
                            !isValueHidden?.("investments", "asset_values") &&
                            a.currency !== "EUR" &&
                            a.current_value_eur != null
                                ? `${parseFloat(String(a.current_value ?? 0)).toFixed(2)} ${a.currency}`
                                : undefined
                        }
                    />
                    <StatCell
                        label={T("gain_eur")}
                        value={masked(
                            `${gain >= 0 ? "+" : ""}${formatEur(gain)}`,
                        )}
                        color={gain >= 0 ? "var(--success)" : "var(--danger)"}
                    />
                    <StatCell
                        label={T("return_label")}
                        value={masked(
                            `${gainPct >= 0 ? "+" : ""}${gainPct.toFixed(2)}%`,
                        )}
                        color={gain >= 0 ? "var(--success)" : "var(--danger)"}
                    />
                    {!isManual && a.shares && (
                        <>
                            <StatCell
                                label={T("shares")}
                                value={parseFloat(
                                    String(a.shares),
                                ).toLocaleString()}
                            />
                            <StatCell
                                label={T("price")}
                                value={
                                    a.price_per_share
                                        ? masked(
                                              `${parseFloat(String(a.price_per_share)).toFixed(2)} ${a.currency || "EUR"}`,
                                          )
                                        : "—"
                                }
                            />
                        </>
                    )}
                    {allocPct !== null && (
                        <StatCell
                            label={T("alloc_pct")}
                            value={`${allocPct.toFixed(1)}%`}
                            color={typeColor}
                        />
                    )}
                    {avgCost !== null && (
                        <StatCell
                            label={T("avg_cost")}
                            value={masked(
                                `${avgCost.toFixed(2)} ${a.currency || "EUR"}`,
                            )}
                            color="var(--fg-soft)"
                        />
                    )}
                </div>

                {a.source_account_name && (
                    <div
                        style={{
                            fontSize: 11,
                            color: "var(--fg-soft)",
                            marginTop: 6,
                        }}
                    >
                        {T("label_source_account_display")}:{" "}
                        <span style={{ color: "var(--fg)" }}>
                            {a.source_account_name}
                        </span>
                    </div>
                )}
                {a.notes && (
                    <div
                        style={{
                            fontSize: 11,
                            color: "var(--fg-soft)",
                            fontStyle: "italic",
                            marginTop: 4,
                        }}
                    >
                        {a.notes}
                    </div>
                )}

                {!isManual && a.isin && !hasTicker && (
                    <div
                        style={{
                            color: "var(--warning)",
                            fontSize: 11,
                            marginTop: 8,
                        }}
                    >
                        {T("isin_no_match")}
                    </div>
                )}

                {canLoadHistory && (
                    <div style={{ marginTop: 10 }}>
                        <div
                            style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                marginBottom: 6,
                            }}
                        >
                            <div className="label">{T("price_chart")} · 1W</div>
                            {priceHistory && priceHistory.length >= 2 && (
                                <button
                                    onClick={() => setShowChart(true)}
                                    style={{
                                        background: "var(--card-inset)",
                                        border: "1px solid var(--rule)",
                                        color: "var(--fg-soft)",
                                        borderRadius: 6,
                                        padding: "2px 8px",
                                        fontSize: 10,
                                        cursor: "pointer",
                                        fontFamily: "inherit",
                                    }}
                                >
                                    ↗ {T("expand_chart")}
                                </button>
                            )}
                        </div>
                        {loadingChart ? (
                            <div
                                style={{
                                    height: 56,
                                    display: "flex",
                                    alignItems: "center",
                                    color: "var(--fg-soft)",
                                    fontSize: 11,
                                }}
                            >
                                …
                            </div>
                        ) : priceHistory && priceHistory.length === 0 ? (
                            <div
                                style={{
                                    height: 56,
                                    display: "flex",
                                    alignItems: "center",
                                    color: "var(--fg-soft)",
                                    fontSize: 11,
                                }}
                            >
                                {T("no_price_data")}
                            </div>
                        ) : (
                            <Sparkline data={weekData ?? undefined} />
                        )}
                        {historyWarning && (
                            <div
                                style={{
                                    color: historyWarning.tone,
                                    fontSize: 11,
                                    marginTop: 6,
                                }}
                            >
                                {historyWarning.text}
                            </div>
                        )}
                    </div>
                )}

                <div
                    style={{
                        display: "flex",
                        gap: 8,
                        flexWrap: "wrap",
                        marginTop: 14,
                    }}
                >
                    {!a.is_archived && onEdit && (
                        <button
                            className="pressable"
                            style={actionBtnStyle}
                            onClick={() => {
                                setDetailOpen(false);
                                onEdit(a);
                            }}
                        >
                            {T("btn_edit", "Edit")}
                        </button>
                    )}
                    {!a.is_archived && isManual && onAdjust && (
                        <button
                            className="pressable"
                            style={actionBtnStyle}
                            onClick={() => {
                                setDetailOpen(false);
                                onAdjust(a);
                            }}
                        >
                            {T("btn_adjust_balance")}
                        </button>
                    )}
                    {!a.is_archived && isManual && onRealize && (
                        <button
                            className="pressable"
                            style={actionBtnStyle}
                            onClick={() => {
                                setDetailOpen(false);
                                onRealize(a);
                            }}
                        >
                            {T("btn_realize_asset")}
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
                                setDetailOpen(false);
                                onArchive(a);
                            }}
                        >
                            <Icon name="archive" size={15} /> {T("btn_archive")}
                        </button>
                    )}
                    {!a.is_archived && onMove && (
                        <button
                            className="pressable"
                            style={actionBtnStyle}
                            onClick={() => {
                                setDetailOpen(false);
                                onMove(a);
                            }}
                        >
                            {T("btn_move")}
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
                                setDetailOpen(false);
                                onUnarchive(a.id);
                            }}
                        >
                            {T("btn_unarchive")}
                        </button>
                    )}
                    {!a.is_archived && onDelete && (
                        <button
                            className="pressable"
                            style={{
                                ...actionBtnStyle,
                                color: "var(--danger)",
                                flex: "0 0 auto",
                            }}
                            onClick={() => {
                                if (window.confirm(T("asset_delete_confirm"))) {
                                    setDetailOpen(false);
                                    onDelete(a.id);
                                }
                            }}
                        >
                            <Icon name="trash" size={15} />{" "}
                            {T("btn_delete", "Delete")}
                        </button>
                    )}
                </div>
            </div>
        </BottomSheet>
    );
}
