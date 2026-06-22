import { useState } from "react";
import type { ReactNode } from "react";
import { useFormatters } from "../utils/useFormatters";
import PrivacyValue from "./PrivacyValue";
import { SwipeRow, CategoryDot } from "./ui";
import AssetDetailSheet from "./assetCard/AssetDetailSheet";
import ChartModal from "./assetCard/ChartModal";
import { buildAssetSwipeActions } from "./assetCard/assetCardActions";
import { useAssetCardController } from "./assetCard/useAssetCardController";
import type { ApiFetcher } from "../api/client";
import type { Asset } from "../api/types";
import type { NumericValue, Translator } from "../types";
import type { EntityId } from "../context/feedTypes";

// ─── main ────────────────────────────────────────────────────────────────────

// Asset-action callbacks operate on a full Asset — this matches the upstream
// handlers (AppContext / usePortfolioAssetActions), so the props bag spreads
// cleanly from PortfolioView. AssetCard is the adapter to the leaf children
// (AssetDetailSheet, buildAssetSwipeActions) which use deliberately loose asset
// params; it casts to a minimal { id } shape when forwarding (see below).
export type AssetActionTarget = Asset;

// The structural contract the loose leaf children actually require of an asset
// handler. A real (asset: Asset) => void is sound to forward as this.
type LooseAssetHandler = ((asset: { id: EntityId }) => void) | undefined;

type AssetCardProps = {
    a: Asset;
    onDelete?: (id: EntityId) => void;
    onEdit?: (asset: AssetActionTarget) => void;
    onAdjust?: (asset: AssetActionTarget) => void;
    onRealize?: (asset: AssetActionTarget) => void;
    onArchive?: (asset: AssetActionTarget) => void;
    onMove?: (asset: AssetActionTarget) => void;
    onUnarchive?: (id: EntityId) => void;
    T: Translator;
    totalPortfolioValue?: NumericValue;
    priceRefreshCounter?: number;
    apiFetch?: ApiFetcher;
    isValueHidden?: (section: string, key: string) => boolean;
    openSwipeId?: EntityId | null;
    onRequestSwipeOpen?: (id: EntityId | null) => void;
    isLast?: boolean;
};

// Asset row: swipe → quick actions (Edit/Archive/Delete, Unarchive when archived),
// tap → detail bottom sheet with the stats grid, notes and price chart.
export default function AssetCard({
    a,
    onDelete,
    onEdit,
    onAdjust,
    onRealize,
    onArchive,
    onMove,
    onUnarchive,
    T,
    totalPortfolioValue,
    priceRefreshCounter,
    apiFetch,
    isValueHidden,
    openSwipeId,
    onRequestSwipeOpen,
    isLast = true,
}: AssetCardProps) {
    const { formatEur, formatEurFull } = useFormatters();
    // Swipe-open coordination: controlled by the parent list when provided,
    // self-contained otherwise (unit tests render the card standalone).
    const [localSwipeOpen, setLocalSwipeOpen] = useState<EntityId | null>(null);
    const swipeOpenId =
        openSwipeId !== undefined ? openSwipeId : localSwipeOpen;
    const requestSwipeOpen = onRequestSwipeOpen || setLocalSwipeOpen;

    const gain = parseFloat(a.gain || "0");
    const gainPct = parseFloat(a.gain_percent || "0");
    const typeDetail = a.investment_type_detail;
    const typeColor = typeDetail?.color || "var(--accent)";
    const typeName = typeDetail?.name || "Unknown";
    const isManual = a.tracking_type === "MANUAL";
    const hasTicker = Boolean(a.has_ticker && (a.source_symbol || a.ticker));
    // eur_complete is a boolean at runtime; the OpenAPI schema mistypes the
    // untyped SerializerMethodField as string, so compare via unknown.
    const eurIncomplete = (a.eur_complete as unknown) === false;
    const {
        allocPct,
        avgCost,
        canLoadHistory,
        detailOpen,
        historyWarning,
        loadingChart,
        priceHistory,
        priceHistoryMeta,
        setDetailOpen,
        setShowChart,
        showChart,
        weekData,
    } = useAssetCardController({
        asset: a,
        apiFetch,
        priceRefreshCounter: priceRefreshCounter ?? 0,
        T,
        totalPortfolioValue: Number(totalPortfolioValue ?? 0),
    });
    const masked = (value: ReactNode) => (
        <PrivacyValue scope="investments" field="asset_values">
            {value}
        </PrivacyValue>
    );

    // Forward the (asset: Asset) => void handlers to the loose leaf children.
    // The runtime value passed back is always this row's full asset `a`.
    const looseOnEdit = onEdit as LooseAssetHandler;
    const looseOnAdjust = onAdjust as LooseAssetHandler;
    const looseOnArchive = onArchive as LooseAssetHandler;
    const looseOnMove = onMove as LooseAssetHandler;
    const looseOnRealize = onRealize as LooseAssetHandler;

    const swipeActions = buildAssetSwipeActions({
        asset: a,
        onArchive: looseOnArchive,
        onDelete,
        onEdit: looseOnEdit,
        onUnarchive,
        T,
    });

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
        <>
            <SwipeRow
                rowId={a.id}
                openRowId={swipeOpenId}
                onRequestOpen={requestSwipeOpen}
                actions={swipeActions}
                onTap={() => setDetailOpen(true)}
                style={{
                    borderBottom: isLast ? "none" : "1px solid var(--rule)",
                }}
                rowStyle={{ padding: "13px 16px" }}
                ariaLabel={a.name}
            >
                <div style={{ flex: 1, minWidth: 0 }}>
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
                                fontSize: 14,
                                fontWeight: 600,
                                color: "var(--fg)",
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
                            marginTop: 3,
                            fontSize: 11,
                            color: "var(--fg-soft)",
                        }}
                    >
                        <CategoryDot color={typeColor} size={6} />
                        {typeName}
                    </div>
                </div>

                <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div
                        className="num"
                        title={eurIncomplete ? T("eur_incomplete") : undefined}
                        style={{
                            fontSize: 14,
                            fontWeight: 700,
                            // HIGH-05: when the backend couldn't fully convert to EUR (missing
                            // FX history) current_value_eur is null and we fall back to the
                            // native amount — mark it as approximate so it doesn't read as an
                            // exact € figure.
                            color: eurIncomplete
                                ? "var(--warning)"
                                : "var(--fg)",
                        }}
                    >
                        {eurIncomplete ? "~ " : ""}
                        {masked(
                            formatEurFull(
                                a.current_value_eur ?? a.current_value,
                            ),
                        )}
                    </div>
                    <div
                        className="num"
                        style={{
                            fontSize: 11,
                            color:
                                gainPct >= 0
                                    ? "var(--success)"
                                    : "var(--danger)",
                        }}
                    >
                        {masked(
                            `${gainPct >= 0 ? "+" : ""}${gainPct.toFixed(2)}%`,
                        )}
                    </div>
                </div>
                <span
                    aria-hidden="true"
                    style={{
                        color: "var(--fg-faint)",
                        fontSize: 17,
                        flexShrink: 0,
                    }}
                >
                    ›
                </span>
            </SwipeRow>

            <AssetDetailSheet
                asset={a}
                open={detailOpen}
                onClose={() => setDetailOpen(false)}
                allocPct={allocPct}
                avgCost={avgCost}
                canLoadHistory={canLoadHistory}
                historyWarning={historyWarning}
                loadingChart={loadingChart}
                priceHistory={priceHistory}
                setShowChart={setShowChart}
                weekData={weekData}
                typeColor={typeColor}
                typeName={typeName}
                isManual={isManual}
                hasTicker={hasTicker}
                gain={gain}
                gainPct={gainPct}
                isValueHidden={isValueHidden}
                onAdjust={looseOnAdjust}
                onArchive={looseOnArchive}
                onDelete={onDelete}
                onEdit={looseOnEdit}
                onMove={looseOnMove}
                onRealize={looseOnRealize}
                onUnarchive={onUnarchive}
                T={T}
                masked={masked}
                formatEur={formatEur}
                actionBtnStyle={actionBtnStyle}
            />

            {showChart && priceHistory && (
                <ChartModal
                    data={priceHistory}
                    meta={priceHistoryMeta}
                    asset={a}
                    onClose={() => setShowChart(false)}
                    T={T}
                />
            )}
        </>
    );
}
