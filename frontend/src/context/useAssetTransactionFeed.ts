import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { API } from "../utils/api";
import { logError } from "../utils/logger";
import { REFRESH_REASONS } from "../utils/refreshReasons";
import {
    buildAssetTxBulkSelectionPayload,
    getSelectedCount,
} from "./bulkSelectionModel";
import { buildAssetTxFilters } from "./feedDefaults";
import { buildAssetTxQueryParams } from "./feedQueryModel";
import type { ApiFetcher } from "../api/client";
import type { Translator } from "../types";
import type { RefreshReason } from "../utils/refreshReasons";
import type { RefObject } from "react";
import type { AssetTransactionFilters } from "./feedDefaults";
import type { AssetTransactionFilterType } from "./feedDefaults";

type EntityId = number | string;

export type AssetTransactionFeedItem = {
    id: EntityId;
    asset?: {
        id: EntityId;
        name: string;
        icon?: string;
        currency?: string;
        investment_type_id?: EntityId | null;
        is_bank_account?: boolean;
        is_archived?: boolean;
        supports_contribution_source?: boolean;
        effective_tax_rate?: string;
    };
    transaction_type?: string;
    date?: string | null;
    shares?: string | null;
    price_per_share?: string | null;
    total_value?: string;
    cash_flow_value?: string;
    fee?: string;
    tax_amount?: string;
    tax_amount_is_manual?: boolean;
    notes?: string;
    contribution_source?: EntityId | null;
    contribution_source_name?: string;
    is_verified?: boolean;
    linked_account_id?: EntityId | null;
    linked_account_name?: string | null;
    [key: string]: unknown;
};

type AssetTransactionPage = {
    count: number;
    next_page: number | null;
    results: AssetTransactionFeedItem[];
};

type UseAssetTransactionFeedArgs = {
    T: Translator;
    apiFetch: ApiFetcher;
    guardDemo: () => boolean;
    refreshAfterRef: RefObject<((reason: RefreshReason) => unknown) | null>;
};

type BulkResponse = { errors?: unknown[]; [key: string]: unknown };

const parseTransactionPage = (
    payload: unknown,
): AssetTransactionPage | null => {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        return null;
    }
    const record = payload as Record<string, unknown>;
    if (!Array.isArray(record.results)) return null;
    return {
        count: Number(record.count) || 0,
        next_page:
            record.next_page == null ? null : Number(record.next_page) || null,
        results: record.results as AssetTransactionFeedItem[],
    };
};

const parseBulkResponse = (payload: unknown): BulkResponse =>
    payload && typeof payload === "object" && !Array.isArray(payload)
        ? (payload as BulkResponse)
        : {};

export function useAssetTransactionFeed({
    apiFetch,
    guardDemo,
    refreshAfterRef,
    T,
}: UseAssetTransactionFeedArgs) {
    const refreshAfter = useCallback(
        (reason: RefreshReason) => refreshAfterRef.current?.(reason),
        [refreshAfterRef],
    );

    // ── Asset Transactions Feed (Portfolio) ──
    const [assetTxItems, setAssetTxItems] = useState<
        AssetTransactionFeedItem[]
    >([]);
    const assetTxPageRef = useRef(1);
    const assetTxRequestSeqRef = useRef(0);
    const [assetTxHasMore, setAssetTxHasMore] = useState(false);
    const [assetTxLoading, setAssetTxLoading] = useState(false);
    const [assetTxTotalCount, setAssetTxTotalCount] = useState(0);
    const [assetTxFilters, setAssetTxFilters] =
        useState<AssetTransactionFilters>(() => buildAssetTxFilters());
    const [assetTxSelectionMode, setAssetTxSelectionMode] = useState(false);
    const [assetTxSelectedIds, setAssetTxSelectedIds] = useState<Set<EntityId>>(
        () => new Set(),
    );
    const [assetTxSelectAllFiltered, setAssetTxSelectAllFiltered] =
        useState(false);
    const [assetTxBulkLoading, setAssetTxBulkLoading] = useState(false);
    const [assetTxBulkError, setAssetTxBulkError] = useState<string | null>(
        null,
    );

    const loadAssetTxFeed = useCallback(
        async (page = 1, overrideFilters?: AssetTransactionFilters) => {
            const requestSeq = ++assetTxRequestSeqRef.current;
            setAssetTxLoading(true);
            try {
                const f = overrideFilters || assetTxFilters;
                const params = buildAssetTxQueryParams(f, { page });
                const res = await apiFetch(
                    `${API}/portfolio/transactions/?${params}`,
                );
                if (!res.ok) return;
                const data = parseTransactionPage(await res.json());
                if (!data) return;
                if (requestSeq !== assetTxRequestSeqRef.current) return;
                if (page === 1) {
                    setAssetTxItems(data.results);
                } else {
                    setAssetTxItems((prev) => [...prev, ...data.results]);
                }
                setAssetTxHasMore(data.next_page !== null);
                setAssetTxTotalCount(data.count);
                assetTxPageRef.current = page;
            } catch (e) {
                logError("loadAssetTxFeed:", e);
            } finally {
                setAssetTxLoading(false);
            }
        },
        [apiFetch, assetTxFilters],
    );

    const loadMoreAssetTx = useCallback(
        () => loadAssetTxFeed(assetTxPageRef.current + 1),
        [loadAssetTxFeed],
    );

    const loadAllAssetTx = useCallback(async () => {
        const requestSeq = ++assetTxRequestSeqRef.current;
        setAssetTxLoading(true);
        try {
            const results: AssetTransactionFeedItem[] = [];
            let page: number | null = 1;
            let data: AssetTransactionPage | null = null;
            do {
                const params = buildAssetTxQueryParams(assetTxFilters, {
                    page,
                    pageSize: 200,
                });
                const res = await apiFetch(
                    `${API}/portfolio/transactions/?${params}`,
                );
                if (!res.ok) return;
                data = parseTransactionPage(await res.json());
                if (!data) return;
                results.push(...data.results);
                page = data.next_page;
            } while (page !== null);
            if (requestSeq !== assetTxRequestSeqRef.current) return;
            setAssetTxItems(results);
            setAssetTxHasMore(false);
            setAssetTxTotalCount(data?.count ?? results.length);
        } catch (e) {
            logError("loadAllAssetTx:", e);
        } finally {
            setAssetTxLoading(false);
        }
    }, [apiFetch, assetTxFilters]);

    const toggleAssetTxType = useCallback(
        (type: AssetTransactionFilterType) => {
            const ALL: AssetTransactionFilterType[] = [
                "buy",
                "sell",
                "adjustment",
            ];
            setAssetTxFilters((prev) => {
                let types;
                if (prev.types.length === ALL.length) {
                    types = [type];
                } else if (prev.types.includes(type)) {
                    types = prev.types.filter((t) => t !== type);
                } else {
                    types = [...prev.types, type];
                }
                if (types.length === 0) types = [type];
                return { ...prev, types };
            });
        },
        [],
    );

    const clearAssetTxSelection = useCallback(() => {
        setAssetTxSelectedIds(new Set());
        setAssetTxSelectAllFiltered(false);
        setAssetTxBulkError(null);
    }, []);

    const enterAssetTxSelectionMode = useCallback(() => {
        setAssetTxSelectionMode(true);
        clearAssetTxSelection();
    }, [clearAssetTxSelection]);

    const exitAssetTxSelectionMode = useCallback(() => {
        setAssetTxSelectionMode(false);
        clearAssetTxSelection();
    }, [clearAssetTxSelection]);

    const toggleAssetTxItemSelected = useCallback((id: EntityId) => {
        setAssetTxSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }, []);

    const selectVisibleAssetTx = useCallback(() => {
        setAssetTxSelectAllFiltered(false);
        setAssetTxSelectedIds(
            new Set(
                (assetTxItems || [])
                    .filter((item) => !item.asset?.is_archived)
                    .map((item) => item.id),
            ),
        );
    }, [assetTxItems]);

    const selectAllFilteredAssetTx = useCallback(() => {
        setAssetTxSelectAllFiltered(true);
        setAssetTxSelectedIds(new Set());
    }, []);

    const isAssetTxItemSelected = useCallback(
        (id: EntityId) => {
            if (assetTxSelectAllFiltered) return !assetTxSelectedIds.has(id);
            return assetTxSelectedIds.has(id);
        },
        [assetTxSelectAllFiltered, assetTxSelectedIds],
    );

    const assetTxSelectedCount = useMemo(
        () =>
            getSelectedCount({
                selectAllFiltered: assetTxSelectAllFiltered,
                selectedIds: assetTxSelectedIds,
                totalCount: assetTxTotalCount,
            }),
        [assetTxSelectAllFiltered, assetTxSelectedIds, assetTxTotalCount],
    );

    const assetTxFilterFingerprintRef = useRef("");
    useEffect(() => {
        const fp = JSON.stringify(assetTxFilters);
        if (fp !== assetTxFilterFingerprintRef.current) {
            assetTxFilterFingerprintRef.current = fp;
            if (assetTxSelectionMode) clearAssetTxSelection();
        }
    }, [assetTxFilters, assetTxSelectionMode, clearAssetTxSelection]);

    const getAssetTxBulkSelectionPayload = useCallback(
        () =>
            buildAssetTxBulkSelectionPayload({
                filters: assetTxFilters,
                selectAllFiltered: assetTxSelectAllFiltered,
                selectedIds: assetTxSelectedIds,
            }),
        [assetTxFilters, assetTxSelectAllFiltered, assetTxSelectedIds],
    );

    const applyAssetTxBulkVerify = useCallback(
        async (value: boolean) => {
            if (guardDemo()) return null;
            setAssetTxBulkLoading(true);
            setAssetTxBulkError(null);
            try {
                const res = await apiFetch(
                    `${API}/portfolio/transactions/bulk/`,
                    {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            action: "edit",
                            patch: { is_verified: value },
                            selection: getAssetTxBulkSelectionPayload(),
                        }),
                    },
                );
                const data = parseBulkResponse(
                    await res.json().catch(() => ({})),
                );
                if (!res.ok) {
                    const message =
                        Array.isArray(data.errors) && data.errors.length > 0
                            ? data.errors.map(String).join(", ")
                            : T("cf_bulk_err_generic");
                    setAssetTxBulkError(message);
                    return null;
                }
                refreshAfter(REFRESH_REASONS.TRANSACTION_UPDATED);
                await loadAssetTxFeed(1);
                clearAssetTxSelection();
                setAssetTxSelectionMode(false);
                return data;
            } catch {
                setAssetTxBulkError(T("error_network"));
                return null;
            } finally {
                setAssetTxBulkLoading(false);
            }
        },
        [
            apiFetch,
            getAssetTxBulkSelectionPayload,
            clearAssetTxSelection,
            guardDemo,
            loadAssetTxFeed,
            refreshAfter,
            T,
        ],
    );

    return {
        assetTxItems,
        assetTxHasMore,
        assetTxLoading,
        assetTxTotalCount,
        assetTxFilters,
        setAssetTxFilters,
        loadAssetTxFeed,
        loadMoreAssetTx,
        loadAllAssetTx,
        toggleAssetTxType,
        assetTxSelectionMode,
        assetTxSelectedIds,
        assetTxSelectAllFiltered,
        assetTxSelectedCount,
        assetTxBulkLoading,
        assetTxBulkError,
        enterAssetTxSelectionMode,
        exitAssetTxSelectionMode,
        toggleAssetTxItemSelected,
        selectVisibleAssetTx,
        selectAllFilteredAssetTx,
        isAssetTxItemSelected,
        clearAssetTxSelection,
        applyAssetTxBulkVerify,
    };
}
