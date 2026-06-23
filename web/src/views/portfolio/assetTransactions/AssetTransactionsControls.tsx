"use client";

import type { Dispatch, SetStateAction } from "react";
import { Icon } from "../../../components/ui";
import type { Translator } from "../../../types";
import type { AssetTransactionFilters } from "../../../context/feedDefaults";

export default function AssetTransactionsControls({
    T,
    activeFilterCount,
    assetTxFilters,
    setAssetTxFilters,
    setTxFiltersSheetOpen,
    assetTxSelectionMode,
    enterAssetTxSelectionMode,
    exitAssetTxSelectionMode,
}: {
    T: Translator;
    activeFilterCount: number;
    assetTxFilters: AssetTransactionFilters;
    setAssetTxFilters: Dispatch<SetStateAction<AssetTransactionFilters>>;
    setTxFiltersSheetOpen: (open: boolean) => void;
    assetTxSelectionMode: boolean;
    enterAssetTxSelectionMode: () => void;
    exitAssetTxSelectionMode: () => void;
}) {
    return (
        <>
            <div style={{ position: "relative", marginBottom: 10 }}>
                <span
                    aria-hidden
                    style={{
                        position: "absolute",
                        left: 12,
                        top: "50%",
                        transform: "translateY(-50%)",
                        color: "var(--fg-soft)",
                        display: "flex",
                        alignItems: "center",
                        pointerEvents: "none",
                    }}
                >
                    <Icon name="search" size={16} />
                </span>
                <input
                    data-testid="asset-tx-search-input"
                    type="search"
                    value={assetTxFilters.search ?? ""}
                    onChange={(event) =>
                        setAssetTxFilters((previous) => ({
                            ...previous,
                            search: event.target.value,
                        }))
                    }
                    placeholder={T("cf_search_placeholder")}
                    aria-label={T("cf_search_placeholder")}
                    style={{
                        width: "100%",
                        background: "var(--card-inset)",
                        border: "1px solid var(--rule)",
                        borderRadius: 10,
                        color: "var(--fg)",
                        padding: "9px 36px 9px 36px",
                        fontSize: 14,
                        fontFamily: "inherit",
                        outline: "none",
                        boxSizing: "border-box",
                    }}
                />
                {assetTxFilters.search && (
                    <button
                        type="button"
                        data-testid="asset-tx-search-clear"
                        onClick={() =>
                            setAssetTxFilters((previous) => ({
                                ...previous,
                                search: "",
                            }))
                        }
                        aria-label={T("cf_search_clear")}
                        style={{
                            position: "absolute",
                            right: 8,
                            top: "50%",
                            transform: "translateY(-50%)",
                            background: "transparent",
                            border: 0,
                            color: "var(--fg-soft)",
                            cursor: "pointer",
                            padding: 4,
                            lineHeight: 1,
                            fontSize: 16,
                            fontFamily: "inherit",
                        }}
                    >
                        ×
                    </button>
                )}
            </div>

            <div
                style={{
                    display: "flex",
                    gap: 8,
                    flexWrap: "wrap",
                    marginBottom: 14,
                    alignItems: "center",
                }}
            >
                <button
                    type="button"
                    data-testid="asset-tx-filters-open"
                    onClick={() => setTxFiltersSheetOpen(true)}
                    className="pressable"
                    style={{
                        position: "relative",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 7,
                        border: "1px solid var(--rule)",
                        cursor: "pointer",
                        background: activeFilterCount
                            ? "var(--accent)"
                            : "var(--card-inset)",
                        color: activeFilterCount
                            ? "var(--btn-primary-fg)"
                            : "var(--fg)",
                        borderRadius: 10,
                        minHeight: 38,
                        padding: "0 14px",
                        fontSize: 14,
                        fontWeight: 700,
                        fontFamily: "inherit",
                        flexShrink: 0,
                    }}
                >
                    {T("cf_filters")}
                    {activeFilterCount > 0 && (
                        <span
                            data-testid="asset-tx-filters-count"
                            style={{
                                background: "var(--card)",
                                color: "var(--accent)",
                                borderRadius: 999,
                                minWidth: 18,
                                height: 18,
                                display: "inline-flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: 11.5,
                                fontWeight: 800,
                                padding: "0 5px",
                            }}
                        >
                            {activeFilterCount}
                        </span>
                    )}
                </button>
                <button
                    data-testid="asset-tx-bulk-toggle"
                    onClick={() =>
                        assetTxSelectionMode
                            ? exitAssetTxSelectionMode()
                            : enterAssetTxSelectionMode()
                    }
                    className="pressable"
                    style={{
                        marginLeft: "auto",
                        background: assetTxSelectionMode
                            ? "var(--accent-soft)"
                            : "transparent",
                        color: assetTxSelectionMode
                            ? "var(--accent-deep)"
                            : "var(--fg-soft)",
                        border: "1px solid var(--rule)",
                        borderRadius: 999,
                        padding: "6px 12px",
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: "pointer",
                        fontFamily: "inherit",
                    }}
                    aria-pressed={assetTxSelectionMode}
                >
                    {assetTxSelectionMode
                        ? T("cf_bulk_done")
                        : T("cf_bulk_select")}
                </button>
            </div>
        </>
    );
}
