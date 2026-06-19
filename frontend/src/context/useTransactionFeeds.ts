import { useCallback, useRef, useState } from "react";
import { API } from "../utils/api";
import { parseAmount, parseMoneyToString } from "../utils/formatters";
import { logError } from "../utils/logger";
import { buildCashflowFilters } from "./feedDefaults";
import { buildCashflowQueryParams as createCashflowQueryParams } from "./feedQueryModel";
import { useAssetTransactionFeed } from "./useAssetTransactionFeed";
import { useCashflowBulkActions } from "./useCashflowBulkActions";
import type { ApiFetcher } from "../api/client";
import type { Category } from "../api/types";
import type { Translator } from "../types";
import type { DecimalSeparator } from "../utils/formatters";
import type { RefreshReason } from "../utils/refreshReasons";
import type { RefObject } from "react";
import type { CashflowFilters } from "./feedDefaults";
import type {
    CashflowFeedItem,
    CashflowFeedPage,
    CashflowItemType,
    CashflowSummary,
} from "./feedTypes";
import { parseCashflowFeedPage } from "./feedTypes";

type UseTransactionFeedsArgs = {
    T: Translator;
    apiFetch: ApiFetcher;
    categories: Category[];
    decimalSeparator: DecimalSeparator;
    guardDemo: () => boolean;
    refreshAfterRef: RefObject<((reason: RefreshReason) => unknown) | null>;
};

type CashflowQueryOptions = { page?: number; pageSize?: number };
type TransferEditForm = {
    date: string;
    notes: string;
    is_verified: boolean;
    amount: string;
};

const EMPTY_CASHFLOW_SUMMARY: CashflowSummary = {
    income: "0.00",
    outcome: "0.00",
    net: "0.00",
};

const isAbortError = (error: unknown): boolean =>
    error instanceof DOMException && error.name === "AbortError";

export function useTransactionFeeds({
    apiFetch,
    categories,
    decimalSeparator,
    guardDemo,
    refreshAfterRef,
    T,
}: UseTransactionFeedsArgs) {
    // ── Cash Flow Feed (K-3.1) ──
    const [cfItems, setCfItems] = useState<CashflowFeedItem[]>([]);
    const [cfSummary, setCfSummary] = useState<CashflowSummary>(
        EMPTY_CASHFLOW_SUMMARY,
    );
    const cfPageRef = useRef(1);
    const cfRequestSeqRef = useRef(0);
    // HIGH-28: holds the in-flight cashflow request so a newer load (e.g. a
    // filter change) can abort a slow previous one instead of only discarding it.
    const cfAbortRef = useRef<AbortController | null>(null);
    const [cfHasMore, setCfHasMore] = useState(false);
    const [cfLoading, setCfLoading] = useState(false);
    const [cfTotalCount, setCfTotalCount] = useState(0);
    const [cfFilters, setCfFilters] = useState<CashflowFilters>(() =>
        buildCashflowFilters(),
    );

    const {
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
    } = useAssetTransactionFeed({
        apiFetch,
        guardDemo,
        refreshAfterRef,
        T,
    });

    const [cfEditTransferItem, setCfEditTransferItem] =
        useState<CashflowFeedItem | null>(null);
    const [cfEditTransferForm, setCfEditTransferForm] =
        useState<TransferEditForm>({
            date: "",
            notes: "",
            is_verified: false,
            amount: "",
        });
    const [cfEditTransferError, setCfEditTransferError] = useState<
        string | null
    >(null);
    const [cfEditTransferLoading, setCfEditTransferLoading] = useState(false);

    // ── Cash Flow Feed actions (K-3) ──

    const deleteCfExpense = useCallback(
        async (id: number | string) => {
            if (guardDemo()) return;
            const res = await apiFetch(`${API}/expenses/${id}/`, {
                method: "DELETE",
            });
            if (!res.ok) return;
            setCfItems((prev) =>
                prev.filter((item) => item.id !== `expense_${id}`),
            );
        },
        [apiFetch, guardDemo],
    );

    const deleteCfTx = useCallback(
        async (item: CashflowFeedItem) => {
            if (guardDemo()) return;
            if (item.type === "transfer") {
                if (!item.from_account) return;
                const res = await apiFetch(
                    `${API}/portfolio/${item.from_account.id}/transactions/${item.paired_id}/`,
                    { method: "DELETE" },
                );
                if (!res.ok) return;
                setCfItems((prev) => prev.filter((i) => i.id !== item.id));
            } else if (item.type === "adjustment" && item.account) {
                const res = await apiFetch(
                    `${API}/portfolio/${item.account.id}/transactions/${item.source_id}/`,
                    { method: "DELETE" },
                );
                if (!res.ok) return;
                setCfItems((prev) => prev.filter((i) => i.id !== item.id));
            }
        },
        [apiFetch, guardDemo],
    );

    const buildCashflowQueryParams = useCallback(
        (filters: CashflowFilters, options?: CashflowQueryOptions) =>
            createCashflowQueryParams(filters, { ...options, categories }),
        [categories],
    );

    const loadCfFeed = useCallback(
        async (page = 1, overrideFilters?: CashflowFilters) => {
            const requestSeq = ++cfRequestSeqRef.current;
            // HIGH-28: abort any previous in-flight feed request so a stale response
            // can't keep the connection busy (the seq guard still protects against
            // out-of-order resolution).
            if (cfAbortRef.current) cfAbortRef.current.abort();
            const controller = new AbortController();
            cfAbortRef.current = controller;
            setCfLoading(true);
            try {
                const f = overrideFilters || cfFilters;
                const params = buildCashflowQueryParams(f, { page });
                const res = await apiFetch(
                    `${API}/expenses/cashflow/?${params}`,
                    {
                        signal: controller.signal,
                    },
                );
                if (!res.ok) return;
                const data = parseCashflowFeedPage(await res.json());
                if (!data) return;
                if (requestSeq !== cfRequestSeqRef.current) return;
                if (page === 1) {
                    setCfItems(data.results);
                    setCfSummary(data.summary || EMPTY_CASHFLOW_SUMMARY);
                } else {
                    setCfItems((prev) => [...prev, ...data.results]);
                }
                setCfHasMore(data.next_page !== null);
                setCfTotalCount(data.count ?? 0);
                cfPageRef.current = page;
            } catch (error) {
                if (isAbortError(error)) return;
                logError("loadCfFeed:", error);
            } finally {
                if (cfAbortRef.current === controller)
                    cfAbortRef.current = null;
                // Only the request that is still current owns the loading flag — an
                // aborted older request must not flip it off under a newer one.
                if (requestSeq === cfRequestSeqRef.current) setCfLoading(false);
            }
        },
        [apiFetch, cfFilters, buildCashflowQueryParams],
    );

    const loadMoreCf = useCallback(
        () => loadCfFeed(cfPageRef.current + 1),
        [loadCfFeed],
    );

    const loadAllCf = useCallback(async () => {
        const requestSeq = ++cfRequestSeqRef.current;
        setCfLoading(true);
        try {
            const f = cfFilters;
            const results: CashflowFeedItem[] = [];
            let page: number | null = 1;
            let data: CashflowFeedPage | null = null;
            do {
                const params = buildCashflowQueryParams(f, {
                    page,
                    pageSize: 200,
                });
                const res = await apiFetch(
                    `${API}/expenses/cashflow/?${params}`,
                );
                if (!res.ok) return;
                data = parseCashflowFeedPage(await res.json());
                if (!data) return;
                results.push(...data.results);
                page = data.next_page;
            } while (page !== null);
            if (requestSeq !== cfRequestSeqRef.current) return;
            setCfItems(results);
            setCfHasMore(false);
            setCfTotalCount(data?.count ?? results.length);
        } catch (e) {
            logError("loadAllCf:", e);
        } finally {
            setCfLoading(false);
        }
    }, [apiFetch, cfFilters, buildCashflowQueryParams]);

    const toggleCfType = useCallback((type: CashflowItemType) => {
        setCfFilters((prev) => {
            let types;
            // From "all types", selecting one should focus to that single type.
            if (prev.types.length === 4) {
                types = [type];
            } else if (prev.types.includes(type)) {
                types = prev.types.filter((t) => t !== type);
            } else {
                types = [...prev.types, type];
            }
            // Keep at least one selected type.
            if (types.length === 0) types = [type];
            return { ...prev, types };
        });
    }, []);

    const openCfEditTransfer = useCallback((item: CashflowFeedItem) => {
        setCfEditTransferItem(item);
        setCfEditTransferForm({
            date: item.date,
            notes: item.description || "",
            is_verified: item.is_verified ?? false,
            amount: item.amount,
        });
        setCfEditTransferError(null);
    }, []);

    const closeCfEditTransfer = useCallback(() => {
        setCfEditTransferItem(null);
        setCfEditTransferError(null);
    }, []);

    const submitCfEditTransfer = useCallback(async () => {
        if (guardDemo()) return;
        const item = cfEditTransferItem;
        if (!item || !item.to_account) return;
        const parsedAmount = parseAmount(
            cfEditTransferForm.amount,
            decimalSeparator,
        );
        if (isNaN(parsedAmount) || parsedAmount <= 0) {
            setCfEditTransferError(T("error_invalid_amount"));
            return;
        }
        setCfEditTransferLoading(true);
        setCfEditTransferError(null);
        try {
            const canonicalAmount = parseMoneyToString(
                cfEditTransferForm.amount,
                decimalSeparator,
            );
            if (canonicalAmount == null) {
                setCfEditTransferError(T("error_invalid_amount"));
                return;
            }
            const body = {
                date: cfEditTransferForm.date,
                notes: cfEditTransferForm.notes,
                is_verified: cfEditTransferForm.is_verified,
                // CRIT-04: canonical decimal string (validated above via parseAmount).
                price_per_share: canonicalAmount,
            };
            const r1 = await apiFetch(
                `${API}/portfolio/${item.to_account.id}/transactions/${item.source_id}/`,
                {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(body),
                },
            );
            if (!r1.ok) {
                setCfEditTransferError(T("error_generic"));
                return;
            }
            if (item.paired_id && item.from_account?.id) {
                await apiFetch(
                    `${API}/portfolio/${item.from_account.id}/transactions/${item.paired_id}/`,
                    {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(body),
                    },
                );
            }
            setCfItems((prev) =>
                prev.map((i) =>
                    i.id === item.id
                        ? {
                              ...i,
                              date: body.date,
                              description: body.notes ?? i.description,
                              is_verified: body.is_verified,
                              amount: cfEditTransferForm.amount,
                          }
                        : i,
                ),
            );
            closeCfEditTransfer();
        } catch {
            setCfEditTransferError(T("error_generic"));
        } finally {
            setCfEditTransferLoading(false);
        }
    }, [
        apiFetch,
        guardDemo,
        cfEditTransferItem,
        cfEditTransferForm,
        closeCfEditTransfer,
        T,
        decimalSeparator,
    ]);

    const {
        cfSelectionMode,
        cfSelectedIds,
        cfSelectAllFiltered,
        cfSelectedCount,
        cfSelectedSum,
        cfBulkPreview,
        cfBulkLoading,
        cfBulkError,
        cfBulkEditOpen,
        setCfBulkEditOpen,
        enterCfSelectionMode,
        exitCfSelectionMode,
        toggleCfItemSelected,
        selectVisibleCf,
        selectAllFilteredCf,
        isCfItemSelected,
        clearCfSelection,
        runCfBulkPreview,
        applyCfBulk,
        setCfItemVerified,
        setCfBulkError,
        setCfBulkPreview,
        cfSelectionKind,
        cfSelectionRejectionTick,
        bulkActionsAllowed,
    } = useCashflowBulkActions({
        apiFetch,
        categories,
        cfFilters,
        cfItems,
        cfTotalCount,
        guardDemo,
        loadCfFeed,
        refreshAfterRef,
        T,
    });

    return {
        cfItems,
        cfSummary,
        cfHasMore,
        cfLoading,
        cfTotalCount,
        cfFilters,
        setCfFilters,
        cfEditTransferItem,
        cfEditTransferForm,
        setCfEditTransferForm,
        cfEditTransferError,
        cfEditTransferLoading,
        loadCfFeed,
        loadMoreCf,
        loadAllCf,
        toggleCfType,
        deleteCfExpense,
        deleteCfTx,
        openCfEditTransfer,
        closeCfEditTransfer,
        submitCfEditTransfer,
        cfSelectionMode,
        cfSelectedIds,
        cfSelectAllFiltered,
        cfSelectedCount,
        cfSelectedSum,
        cfBulkPreview,
        cfBulkLoading,
        cfBulkError,
        cfBulkEditOpen,
        setCfBulkEditOpen,
        enterCfSelectionMode,
        exitCfSelectionMode,
        toggleCfItemSelected,
        selectVisibleCf,
        selectAllFilteredCf,
        isCfItemSelected,
        clearCfSelection,
        runCfBulkPreview,
        applyCfBulk,
        setCfItemVerified,
        setCfBulkError,
        setCfBulkPreview,
        cfSelectionKind,
        cfSelectionRejectionTick,
        bulkActionsAllowed,
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
