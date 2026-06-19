import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { API } from "../utils/api";
import { REFRESH_REASONS } from "../utils/refreshReasons";
import {
    buildCfBulkSelectionPayload,
    getCfBulkActionsAllowed,
    getSelectedCount,
} from "./bulkSelectionModel";
import type { ApiFetcher } from "../api/client";
import type { Category } from "../api/types";
import type { Translator } from "../types";
import type { RefreshReason } from "../utils/refreshReasons";
import type { RefObject } from "react";
import type { CashflowFilters } from "./feedDefaults";
import type { CashflowFeedItem, CashflowItemType, EntityId } from "./feedTypes";

type BulkAction = "edit" | "delete";
type BulkRequest = { action: BulkAction; patch: Record<string, unknown> };
type BulkResponse = {
    error_codes?: string[];
    errors?: unknown[];
    [key: string]: unknown;
};

type UseCashflowBulkActionsArgs = {
    T: Translator;
    apiFetch: ApiFetcher;
    categories: Category[];
    cfFilters: CashflowFilters;
    cfItems: CashflowFeedItem[];
    cfTotalCount: number;
    guardDemo: () => boolean;
    loadCfFeed: (page?: number, filters?: CashflowFilters) => unknown;
    refreshAfterRef: RefObject<((reason: RefreshReason) => unknown) | null>;
};

const parseBulkResponse = (payload: unknown): BulkResponse =>
    payload && typeof payload === "object" && !Array.isArray(payload)
        ? (payload as BulkResponse)
        : {};

const isAbortError = (error: unknown): boolean =>
    error instanceof DOMException && error.name === "AbortError";

export function useCashflowBulkActions({
    apiFetch,
    categories,
    cfFilters,
    cfItems,
    cfTotalCount,
    guardDemo,
    loadCfFeed,
    refreshAfterRef,
    T,
}: UseCashflowBulkActionsArgs) {
    const refreshAfter = useCallback(
        (reason: RefreshReason) => refreshAfterRef.current?.(reason),
        [refreshAfterRef],
    );

    // ── Cash Flow bulk selection (K-3.7) ──
    const [cfSelectionMode, setCfSelectionMode] = useState(false);
    // When cfSelectAllFiltered is false: cfSelectedIds holds the explicit set
    // of feed ids the user picked. When true: every filtered row is selected
    // and cfSelectedIds is interpreted as the inverse — rows the user un-ticked.
    const [cfSelectedIds, setCfSelectedIds] = useState<Set<EntityId>>(
        () => new Set(),
    );
    const [cfSelectAllFiltered, setCfSelectAllFiltered] = useState(false);
    const [cfBulkPreview, setCfBulkPreview] = useState<BulkResponse | null>(
        null,
    );
    const [cfBulkLoading, setCfBulkLoading] = useState(false);
    const [cfBulkError, setCfBulkError] = useState<string | null>(null);
    const [cfBulkEditOpen, setCfBulkEditOpen] = useState(false);
    // The first row picked in selection mode locks the kind for the rest of the
    // session. Subsequent picks of a different kind are rejected with a toast,
    // surfaced via the rejection tick (monotonic counter so the view layer can
    // observe each rejection).
    const [cfSelectionKind, setCfSelectionKind] =
        useState<CashflowItemType | null>(null);
    const [cfSelectionRejectionTick, setCfSelectionRejectionTick] = useState(0);
    // ── Cash Flow bulk selection (K-3.7) ──────────────────────────────────────

    const clearCfSelection = useCallback(() => {
        setCfSelectedIds(new Set());
        setCfSelectAllFiltered(false);
        setCfSelectionKind(null);
        setCfBulkPreview(null);
        setCfBulkError(null);
    }, []);

    const enterCfSelectionMode = useCallback(() => {
        setCfSelectionMode(true);
        clearCfSelection();
    }, [clearCfSelection]);

    const exitCfSelectionMode = useCallback(() => {
        setCfSelectionMode(false);
        clearCfSelection();
        setCfBulkEditOpen(false);
    }, [clearCfSelection]);

    const toggleCfItemSelected = useCallback(
        (id: EntityId, itemType?: CashflowItemType | null) => {
            setCfSelectedIds((prev) => {
                // Removing a row: always allowed. If the selection drops to zero,
                // unlock the kind so the next pick can be of any type.
                if (prev.has(id)) {
                    const next = new Set(prev);
                    next.delete(id);
                    if (next.size === 0) setCfSelectionKind(null);
                    return next;
                }
                // Adding a row: must match the locked kind (if any). The first pick
                // sets the kind; later picks of a different kind are rejected.
                if (
                    cfSelectionKind &&
                    itemType &&
                    cfSelectionKind !== itemType
                ) {
                    setCfSelectionRejectionTick((t) => t + 1);
                    return prev;
                }
                if (!cfSelectionKind && itemType) {
                    setCfSelectionKind(itemType);
                }
                const next = new Set(prev);
                next.add(id);
                return next;
            });
        },
        [cfSelectionKind],
    );

    const selectVisibleCf = useCallback(() => {
        setCfSelectAllFiltered(false);
        // Restrict to items matching the current kind. If no kind is set yet, the
        // first visible item's type locks the selection.
        const lockedKind = cfSelectionKind || cfItems[0]?.type || null;
        const eligible = cfItems.filter(
            (i) => !lockedKind || i.type === lockedKind,
        );
        if (lockedKind && lockedKind !== cfSelectionKind) {
            setCfSelectionKind(lockedKind);
        }
        setCfSelectedIds(new Set(eligible.map((i) => i.id)));
    }, [cfItems, cfSelectionKind]);

    const selectAllFilteredCf = useCallback(() => {
        // Only meaningful when the active filter narrows to a single kind —
        // otherwise the resulting selection would be mixed and the backend rejects
        // it. The ExpensesView disables the trigger button accordingly.
        const types = Array.isArray(cfFilters.types) ? cfFilters.types : [];
        if (types.length !== 1) return;
        setCfSelectAllFiltered(true);
        setCfSelectedIds(new Set());
        setCfSelectionKind(types[0]!);
    }, [cfFilters]);

    const isCfItemSelected = useCallback(
        (id: EntityId) => {
            if (cfSelectAllFiltered) return !cfSelectedIds.has(id);
            return cfSelectedIds.has(id);
        },
        [cfSelectAllFiltered, cfSelectedIds],
    );

    // Which toolbar actions are allowed for the current selection kind. The
    // backend gates the same way; this is the UI mirror so we don't render
    // buttons that would always 400.
    const bulkActionsAllowed = useMemo(
        () => getCfBulkActionsAllowed(cfSelectionKind),
        [cfSelectionKind],
    );

    const cfSelectedCount = useMemo(
        () =>
            getSelectedCount({
                selectAllFiltered: cfSelectAllFiltered,
                selectedIds: cfSelectedIds,
                totalCount: cfTotalCount,
            }),
        [cfSelectAllFiltered, cfSelectedIds, cfTotalCount],
    );

    const cfSelectedSum = useMemo(() => {
        // We can only sum what's currently loaded; for select-all-filtered the
        // server's preview returns the authoritative total. This is an estimate
        // used only for inline display before the user opens the modal.
        let total = 0;
        cfItems.forEach((item) => {
            if (!isCfItemSelected(item.id)) return;
            const amt = Number.parseFloat(item.amount || "0");
            if (item.type === "income") total += amt;
            else if (item.type === "outcome") total -= amt;
        });
        return total;
    }, [cfItems, isCfItemSelected]);

    // Reset selection when filters change — the row identity behind a feed-id
    // is stable but the comprehension of "all selected" is filter-bound.
    const cfFilterFingerprintRef = useRef("");
    useEffect(() => {
        const fp = JSON.stringify(cfFilters);
        if (fp !== cfFilterFingerprintRef.current) {
            cfFilterFingerprintRef.current = fp;
            // Only clear if user is in selection mode (avoids noisy resets at boot)
            if (cfSelectionMode) clearCfSelection();
        }
    }, [cfFilters, cfSelectionMode, clearCfSelection]);

    const getCfBulkSelectionPayload = useCallback(
        () =>
            buildCfBulkSelectionPayload({
                filters: cfFilters,
                selectAllFiltered: cfSelectAllFiltered,
                selectedIds: cfSelectedIds,
                categories,
            }),
        [cfFilters, cfSelectAllFiltered, cfSelectedIds, categories],
    );

    // i18n keys for backend error_codes — single source of truth.
    const cfBulkErrorCodeKeys = useMemo<Record<string, string>>(
        () => ({
            asset_refresh_failed: "cf_bulk_err_refresh_failed",
            category_direction_mismatch:
                "cf_bulk_err_category_direction_mismatch",
            account_not_bank: "cf_bulk_err_account_not_bank",
            invalid_date: "cf_bulk_err_invalid_date",
            empty_patch: "cf_bulk_err_empty_patch",
            filtered_too_large: "cf_bulk_err_filtered_too_large",
        }),
        [],
    );

    const formatCfBulkError = useCallback(
        (data: BulkResponse) => {
            const codes = Array.isArray(data.error_codes)
                ? data.error_codes
                : [];
            const localized = codes
                .map((c) => cfBulkErrorCodeKeys[c])
                .filter((key): key is string => Boolean(key))
                .map((k) => T(k));
            if (localized.length > 0) return localized.join(" ");
            if (Array.isArray(data.errors) && data.errors.length > 0) {
                return data.errors.map(String).join(", ");
            }
            return T("cf_bulk_err_generic");
        },
        [cfBulkErrorCodeKeys, T],
    );

    const cfBulkPreviewAbortRef = useRef<AbortController | null>(null);
    // HIGH-29: signature of the *selection* (filters + ids) the shown preview was
    // computed for. The abort logic below already stops a slow response from
    // overwriting a newer one, but the previously-rendered preview keeps showing
    // until the next response lands — counts for filters the user has already
    // changed. When the selection signature changes we drop the stale preview at
    // once so the panel shows a loading state, never numbers for a dead filter.
    const cfBulkPreviewSelSigRef = useRef<string | null>(null);

    const runCfBulkPreview = useCallback(
        async ({ action, patch }: BulkRequest) => {
            // Cancel any in-flight preview before starting a new one — live preview
            // fires on every keystroke (debounced), so without abort the slowest
            // response could overwrite the latest.
            if (cfBulkPreviewAbortRef.current) {
                cfBulkPreviewAbortRef.current.abort();
            }
            const controller = new AbortController();
            cfBulkPreviewAbortRef.current = controller;

            const selection = getCfBulkSelectionPayload();
            const selSig = JSON.stringify(selection);
            // Invalidate a preview that belonged to a different selection (changed
            // filters/ids). Keyed on the selection only — not the patch — so ordinary
            // edit keystrokes don't blank the panel between debounced responses.
            if (
                cfBulkPreviewSelSigRef.current !== null &&
                cfBulkPreviewSelSigRef.current !== selSig
            ) {
                setCfBulkPreview(null);
            }
            cfBulkPreviewSelSigRef.current = selSig;

            setCfBulkLoading(true);
            setCfBulkError(null);
            try {
                const res = await apiFetch(`${API}/expenses/cashflow/bulk/`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        action,
                        patch,
                        selection,
                        dry_run: true,
                    }),
                    signal: controller.signal,
                });
                const data = parseBulkResponse(
                    await res.json().catch(() => ({})),
                );
                if (!res.ok) {
                    setCfBulkError(formatCfBulkError(data));
                    setCfBulkPreview(data);
                    return null;
                }
                setCfBulkPreview(data);
                return data;
            } catch (error) {
                if (isAbortError(error)) return null;
                setCfBulkError(T("error_network"));
                return null;
            } finally {
                if (cfBulkPreviewAbortRef.current === controller) {
                    cfBulkPreviewAbortRef.current = null;
                    setCfBulkLoading(false);
                }
            }
        },
        [apiFetch, getCfBulkSelectionPayload, formatCfBulkError, T],
    );

    const applyCfBulk = useCallback(
        async ({ action, patch }: BulkRequest) => {
            if (guardDemo()) return null;
            // Cancel any pending preview to avoid race with apply response.
            if (cfBulkPreviewAbortRef.current) {
                cfBulkPreviewAbortRef.current.abort();
                cfBulkPreviewAbortRef.current = null;
            }
            setCfBulkLoading(true);
            setCfBulkError(null);
            try {
                const res = await apiFetch(`${API}/expenses/cashflow/bulk/`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        action,
                        patch,
                        selection: getCfBulkSelectionPayload(),
                    }),
                });
                const data = parseBulkResponse(
                    await res.json().catch(() => ({})),
                );
                if (!res.ok) {
                    setCfBulkError(formatCfBulkError(data));
                    return null;
                }
                refreshAfter(
                    action === "delete"
                        ? REFRESH_REASONS.EXPENSE_DELETED
                        : REFRESH_REASONS.EXPENSE_UPDATED,
                );
                clearCfSelection();
                setCfSelectionMode(false);
                setCfBulkEditOpen(false);
                void loadCfFeed(1);
                return data;
            } catch {
                setCfBulkError(T("error_network"));
                return null;
            } finally {
                setCfBulkLoading(false);
            }
        },
        [
            apiFetch,
            getCfBulkSelectionPayload,
            clearCfSelection,
            formatCfBulkError,
            guardDemo,
            loadCfFeed,
            refreshAfter,
            T,
        ],
    );

    // Verify / unverify a single feed item without entering selection mode —
    // used by the detail sheet toggle and the row swipe action. Reuses the
    // existing cashflow bulk endpoint with an explicit single-id selection, so
    // there is no new backend surface.
    const setCfItemVerified = useCallback(
        async (item: CashflowFeedItem, value: boolean) => {
            if (guardDemo()) return null;
            if (!item?.id) return null;
            setCfBulkError(null);
            try {
                const res = await apiFetch(`${API}/expenses/cashflow/bulk/`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        action: "edit",
                        patch: { is_verified: value },
                        selection: { mode: "ids", ids: [item.id] },
                    }),
                });
                const data = parseBulkResponse(
                    await res.json().catch(() => ({})),
                );
                if (!res.ok) {
                    setCfBulkError(formatCfBulkError(data));
                    return null;
                }
                refreshAfter(REFRESH_REASONS.EXPENSE_UPDATED);
                void loadCfFeed(1);
                return data;
            } catch {
                setCfBulkError(T("error_network"));
                return null;
            }
        },
        [apiFetch, formatCfBulkError, guardDemo, loadCfFeed, refreshAfter, T],
    );

    return {
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
    };
}
