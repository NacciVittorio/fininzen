import type { Dispatch, ReactNode, SetStateAction } from "react";
import AssetTransactionRow from "./assetTransactions/AssetTransactionRow";
import AssetTransactionsControls from "./assetTransactions/AssetTransactionsControls";
import AssetTransactionsFooter from "./assetTransactions/AssetTransactionsFooter";
import AssetTransactionsSelectionBanner from "./assetTransactions/AssetTransactionsSelectionBanner";
import { ALL_ASSET_TX_TYPES } from "./TxFiltersSheet";
import type { NumericValue, Translator } from "../../types";
import type { EntityId } from "../../context/feedTypes";
import type { AssetTransactionFilters } from "../../context/feedDefaults";
import type { AssetTransactionFeedItem } from "../../context/useAssetTransactionFeed";
import type { DecoratedDatedItem } from "../transactionFeedModel";

export default function AssetTransactionsSection({
    T,
    assetTxFilters,
    setAssetTxFilters,
    setTxFiltersSheetOpen,
    assetTxSelectionMode,
    enterAssetTxSelectionMode,
    exitAssetTxSelectionMode,
    assetTxItems,
    assetTxLoading,
    assetTxTotalCount,
    assetTxSelectedCount,
    assetTxSelectAllFiltered,
    selectAllFilteredAssetTx,
    selectVisibleAssetTx,
    clearAssetTxSelection,
    assetTxDecorated,
    activeActionRow,
    setActiveActionRow,
    isAssetTxItemSelected,
    toggleAssetTxItemSelected,
    openEditTransaction,
    setTxDeleteConfirm,
    assetTxHasMore,
    loadMoreAssetTx,
    loadAllAssetTx,
    masked,
    formatEur,
}: {
    T: Translator;
    assetTxFilters: AssetTransactionFilters;
    setAssetTxFilters: Dispatch<SetStateAction<AssetTransactionFilters>>;
    setTxFiltersSheetOpen: (open: boolean) => void;
    assetTxSelectionMode: boolean;
    enterAssetTxSelectionMode: () => void;
    exitAssetTxSelectionMode: () => void;
    assetTxItems: readonly AssetTransactionFeedItem[];
    assetTxLoading: boolean;
    assetTxTotalCount: number;
    assetTxSelectedCount: number;
    assetTxSelectAllFiltered: boolean;
    selectAllFilteredAssetTx: () => void;
    selectVisibleAssetTx: () => void;
    clearAssetTxSelection: () => void;
    assetTxDecorated: readonly DecoratedDatedItem<AssetTransactionFeedItem>[];
    activeActionRow: string | null;
    setActiveActionRow: (value: string | null) => void;
    isAssetTxItemSelected: (id: EntityId) => boolean;
    toggleAssetTxItemSelected: (id: EntityId) => void;
    openEditTransaction: (item: AssetTransactionFeedItem) => void;
    setTxDeleteConfirm: (item: AssetTransactionFeedItem) => void;
    assetTxHasMore: boolean;
    loadMoreAssetTx: () => void;
    loadAllAssetTx: () => void;
    masked: (scope: string, value: string) => ReactNode;
    formatEur: (value: NumericValue) => string;
}) {
    const typeActive = assetTxFilters.types.length < ALL_ASSET_TX_TYPES.length;
    const activeFilterCount =
        (assetTxFilters.asset_ids?.length ? 1 : 0) +
        (typeActive ? 1 : 0) +
        (assetTxFilters.verified !== null ? 1 : 0) +
        (assetTxFilters.date_from ? 1 : 0) +
        ((assetTxFilters.ordering || "-date") !== "-date" ? 1 : 0);

    return (
        <div style={{ marginTop: 28 }}>
            <div
                style={{
                    fontSize: 11,
                    letterSpacing: 0,
                    color: "var(--fg-soft)",
                    textTransform: "uppercase",
                    marginBottom: 10,
                }}
            >
                {T("portfolio_transactions")}
            </div>

            <AssetTransactionsControls
                T={T}
                activeFilterCount={activeFilterCount}
                assetTxFilters={assetTxFilters}
                setAssetTxFilters={setAssetTxFilters}
                setTxFiltersSheetOpen={setTxFiltersSheetOpen}
                assetTxSelectionMode={assetTxSelectionMode}
                enterAssetTxSelectionMode={enterAssetTxSelectionMode}
                exitAssetTxSelectionMode={exitAssetTxSelectionMode}
            />

            {assetTxSelectionMode && assetTxItems.length > 0 && (
                <AssetTransactionsSelectionBanner
                    T={T}
                    assetTxItems={assetTxItems}
                    assetTxTotalCount={assetTxTotalCount}
                    assetTxSelectedCount={assetTxSelectedCount}
                    assetTxSelectAllFiltered={assetTxSelectAllFiltered}
                    selectAllFilteredAssetTx={selectAllFilteredAssetTx}
                    selectVisibleAssetTx={selectVisibleAssetTx}
                    clearAssetTxSelection={clearAssetTxSelection}
                />
            )}

            <div className="card" style={{ padding: 0, overflow: "hidden" }}>
                {assetTxLoading && assetTxItems.length === 0 && (
                    <div
                        style={{
                            textAlign: "center",
                            color: "var(--fg-soft)",
                            padding: "32px 0",
                            fontSize: 13,
                        }}
                    >
                        {T("loading")}…
                    </div>
                )}
                {!assetTxLoading && assetTxItems.length === 0 && (
                    <div
                        style={{
                            textAlign: "center",
                            color: "var(--fg-soft)",
                            padding: "32px 0",
                            fontSize: 13,
                        }}
                    >
                        {T("cf_no_results")}
                    </div>
                )}

                {assetTxDecorated.map(
                    ({
                        item,
                        monthKey,
                        showMonthDivider,
                        monthLabel,
                        showDayDivider,
                        dayLabel,
                    }) => (
                        <div key={item.id}>
                            {showMonthDivider && (
                                <div
                                    key={`m-${monthKey}-${item.id}`}
                                    style={{
                                        padding: "10px 14px 6px",
                                        fontSize: 12,
                                        fontWeight: 700,
                                        letterSpacing: 0,
                                        textTransform: "uppercase",
                                        color: "var(--fg)",
                                        background: "var(--card-inset)",
                                        borderTop: "1px solid var(--rule)",
                                        borderBottom: "1px solid var(--rule)",
                                    }}
                                >
                                    {monthLabel}
                                </div>
                            )}
                            {showDayDivider && (
                                <div
                                    key={`d-${item.date}-${item.id}`}
                                    className="tx-day-divider"
                                    style={{ padding: "6px 14px 2px" }}
                                >
                                    {dayLabel}
                                </div>
                            )}
                            <AssetTransactionRow
                                T={T}
                                item={item}
                                activeActionRow={activeActionRow}
                                setActiveActionRow={setActiveActionRow}
                                assetTxSelectionMode={assetTxSelectionMode}
                                isAssetTxItemSelected={isAssetTxItemSelected}
                                toggleAssetTxItemSelected={
                                    toggleAssetTxItemSelected
                                }
                                openEditTransaction={openEditTransaction}
                                setTxDeleteConfirm={setTxDeleteConfirm}
                                masked={masked}
                                formatEur={formatEur}
                            />
                        </div>
                    ),
                )}

                {(assetTxHasMore || assetTxItems.length > 0) && (
                    <AssetTransactionsFooter
                        T={T}
                        assetTxHasMore={assetTxHasMore}
                        assetTxLoading={assetTxLoading}
                        assetTxItems={assetTxItems}
                        assetTxTotalCount={assetTxTotalCount}
                        loadMoreAssetTx={loadMoreAssetTx}
                        loadAllAssetTx={loadAllAssetTx}
                    />
                )}
            </div>
        </div>
    );
}
