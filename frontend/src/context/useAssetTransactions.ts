import { useCallback, useEffect, useRef, useState } from "react";
import { API } from "../utils/api";
import {
    parseFlexibleDecimal,
    parseMoneyToString,
    today,
} from "../utils/formatters";
import { logError } from "../utils/logger";
import { REFRESH_REASONS } from "../utils/refreshReasons";
import { buildTxForm } from "./formBuilders";
import { buildPortfolioTransactionPayload } from "./portfolioTransactionModel";
import type { ApiFetcher } from "../api/client";
import type { Asset } from "../api/types";
import type { Translator } from "../types";
import type { RefreshReason } from "../utils/refreshReasons";
import type { RefObject } from "react";
import type { TransactionForm } from "./formBuilders";

type EntityId = number | string;

export type AssetTransaction = {
    id: EntityId;
    transaction_type?: string;
    date?: string;
    shares?: number | string | null;
    price_per_share?: number | string | null;
    fee?: number | string | null;
    tax_amount?: number | string | null;
    tax_amount_is_manual?: boolean;
    notes?: string | null;
    linked_account_id?: EntityId | null;
    contribution_source?: EntityId | null;
    warning?: unknown;
    [key: string]: unknown;
};

type UseAssetTransactionsArgs = {
    apiFetch: ApiFetcher;
    guardDemo: () => boolean;
    refreshAfterRef: RefObject<((reason: RefreshReason) => unknown) | null>;
    T: Translator;
};

type SubmitTransactionOptions = {
    taxIsManual?: boolean | null;
};

type HistoricalPriceResponse = {
    close?: number | string | null;
};

const responseErrorMessage = (payload: unknown): string => {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        return "";
    }
    return Object.values(payload).flat().filter(Boolean).join(" ");
};

const isAbortError = (error: unknown): boolean =>
    error instanceof DOMException && error.name === "AbortError";

export function useAssetTransactions({
    apiFetch,
    guardDemo,
    refreshAfterRef,
    T,
}: UseAssetTransactionsArgs) {
    const refreshAfter = useCallback(
        (reason: RefreshReason) => refreshAfterRef.current?.(reason),
        [refreshAfterRef],
    );

    // Transaction panel
    const [txPanel, setTxPanel] = useState<Asset | null>(null);
    const [assetTransactions, setAssetTransactions] = useState<
        AssetTransaction[]
    >([]);
    const [txAddMode, setTxAddMode] = useState(false);
    const [editingTxId, setEditingTxId] = useState<EntityId | null>(null);
    const [txDeleteConfirm, setTxDeleteConfirm] =
        useState<AssetTransaction | null>(null);
    const [txForm, setTxForm] = useState<TransactionForm>(() => buildTxForm());
    const [txLoading, setTxLoading] = useState(false);
    const [txError, setTxError] = useState<string | null>(null);
    const [txWarning, setTxWarning] = useState<string | null>(null);
    const [txAutofilling, setTxAutofilling] = useState(false);

    // ── Transaction panel ──

    const openTxPanel = useCallback(
        async (asset: Asset) => {
            setTxPanel(asset);
            setTxAddMode(false);
            setEditingTxId(null);
            setTxDeleteConfirm(null);
            setTxError(null);
            setTxForm(
                buildTxForm({
                    linked_account_id: asset.source_account
                        ? String(asset.source_account)
                        : "",
                }),
            );
            setTxWarning(null);
            try {
                setTxLoading(true);
                const res = await apiFetch(
                    `${API}/portfolio/${asset.id}/transactions/`,
                );
                if (!res.ok) return;
                const data = (await res.json()) as unknown;
                setAssetTransactions(Array.isArray(data) ? data : []);
            } catch {
                setAssetTransactions([]);
            } finally {
                setTxLoading(false);
            }
        },
        [apiFetch],
    );

    const closeTxPanel = useCallback(() => {
        setTxPanel(null);
        setAssetTransactions([]);
        setTxAddMode(false);
        setTxDeleteConfirm(null);
        setTxError(null);
        setTxWarning(null);
    }, []);

    const submitTxAdd = useCallback(async () => {
        if (guardDemo()) return;
        if (!txPanel) return;
        const payload = buildPortfolioTransactionPayload({
            form: txForm,
            editingTxId,
            parseFlexibleDecimal,
            parseMoneyToString,
        });
        if (!payload.ok) {
            setTxError(T(payload.errorKey));
            return;
        }
        try {
            setTxLoading(true);
            setTxError(null);
            setTxWarning(null);
            const url = editingTxId
                ? `${API}/portfolio/${txPanel.id}/transactions/${editingTxId}/`
                : `${API}/portfolio/${txPanel.id}/transactions/`;

            const res = await apiFetch(url, {
                method: editingTxId ? "PATCH" : "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload.body),
            });
            if (!res.ok) {
                const err = (await res.json().catch(() => ({}))) as unknown;
                setTxError(responseErrorMessage(err) || T("error_save_failed"));
                return;
            }
            const savedTx = (await res.json()) as AssetTransaction;
            if (savedTx.warning) setTxWarning(T("balance_warning"));
            if (editingTxId) {
                setAssetTransactions((prev) =>
                    prev.map((t) => (t.id === editingTxId ? savedTx : t)),
                );
            } else {
                setAssetTransactions((prev) => [savedTx, ...prev]);
            }
            setTxAddMode(false);
            setEditingTxId(null);
            setTxForm(buildTxForm());
            refreshAfter(
                editingTxId
                    ? REFRESH_REASONS.TRANSACTION_UPDATED
                    : REFRESH_REASONS.TRANSACTION_CREATED,
            );
        } catch {
            setTxError(T("error_network"));
        } finally {
            setTxLoading(false);
        }
    }, [apiFetch, txPanel, txForm, editingTxId, refreshAfter, guardDemo, T]);

    const submitAddTxFromModal = useCallback(
        async (
            assetId: EntityId,
            form: TransactionForm,
            editingTransactionId: EntityId | null = null,
            options: SubmitTransactionOptions = {},
        ) => {
            if (guardDemo()) return { ok: false };
            if (!assetId) {
                return { ok: false, errorKey: "tx_error_fields" };
            }
            const payload = buildPortfolioTransactionPayload({
                form,
                editingTxId: editingTransactionId,
                taxIsManual: options.taxIsManual,
                parseFlexibleDecimal,
                parseMoneyToString,
            });
            if (!payload.ok) return payload;
            try {
                const url = editingTransactionId
                    ? `${API}/portfolio/${assetId}/transactions/${editingTransactionId}/`
                    : `${API}/portfolio/${assetId}/transactions/`;
                const res = await apiFetch(url, {
                    method: editingTransactionId ? "PATCH" : "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload.body),
                });
                if (!res.ok) {
                    const err = (await res.json().catch(() => ({}))) as unknown;
                    return {
                        ok: false,
                        error:
                            responseErrorMessage(err) || T("error_save_failed"),
                    };
                }
                refreshAfter(
                    editingTransactionId
                        ? REFRESH_REASONS.TRANSACTION_UPDATED
                        : REFRESH_REASONS.TRANSACTION_CREATED,
                );
                return { ok: true };
            } catch {
                return { ok: false, errorKey: "error_network" };
            }
        },
        [apiFetch, refreshAfter, guardDemo, T],
    );

    const autofillAbortRef = useRef<AbortController | null>(null);

    const autofillTxPrice = useCallback(
        async (dateStr: string) => {
            if (!txPanel || !txPanel.ticker || editingTxId || !dateStr) return;
            // Abort any in-flight autofill before starting a new one so we never
            // race two responses against each other (and avoid setState after unmount).
            if (autofillAbortRef.current) autofillAbortRef.current.abort();
            const controller = new AbortController();
            autofillAbortRef.current = controller;
            try {
                setTxAutofilling(true);
                const res = await apiFetch(
                    `${API}/portfolio/${txPanel.id}/historical-price/?date=${dateStr}`,
                    { signal: controller.signal },
                );
                if (controller.signal.aborted || !res.ok) return;
                const data = (await res.json()) as HistoricalPriceResponse;
                if (controller.signal.aborted) return;
                if (data?.close)
                    setTxForm((p) => ({
                        ...p,
                        price_per_share: String(data.close),
                    }));
            } catch (error) {
                if (isAbortError(error)) return;
            } finally {
                if (autofillAbortRef.current === controller) {
                    autofillAbortRef.current = null;
                }
                if (!controller.signal.aborted) setTxAutofilling(false);
            }
        },
        [apiFetch, txPanel, editingTxId],
    );

    useEffect(() => {
        if (
            txAddMode &&
            !editingTxId &&
            txPanel?.ticker &&
            !txForm.price_per_share &&
            txForm.date
        ) {
            autofillTxPrice(txForm.date);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [txAddMode, editingTxId]);

    // Abort any in-flight autofill on unmount (or when the tx panel goes away).
    useEffect(() => {
        return () => {
            if (autofillAbortRef.current) {
                autofillAbortRef.current.abort();
                autofillAbortRef.current = null;
            }
        };
    }, []);

    const openEditTx = useCallback((tx: AssetTransaction) => {
        setEditingTxId(tx.id);
        setTxForm(
            buildTxForm({
                transaction_type: tx.transaction_type || "buy",
                date: tx.date || today(),
                shares: String(tx.shares ?? ""),
                price_per_share: String(tx.price_per_share ?? ""),
                fee: String(tx.fee ?? ""),
                tax_amount: tx.tax_amount_is_manual
                    ? String(tx.tax_amount ?? "")
                    : "",
                notes: tx.notes || "",
                linked_account_id: tx.linked_account_id
                    ? String(tx.linked_account_id)
                    : "",
                contribution_source: tx.contribution_source
                    ? String(tx.contribution_source)
                    : "",
            }),
        );
        setTxAddMode(true);
        setTxError(null);
    }, []);

    const deleteTx = useCallback(
        async (txId: EntityId, assetId: EntityId | null | undefined) => {
            if (!assetId) {
                logError("deleteTx: missing assetId");
                return;
            }
            try {
                await apiFetch(
                    `${API}/portfolio/${assetId}/transactions/${txId}/`,
                    {
                        method: "DELETE",
                    },
                );
                setTxDeleteConfirm(null);
                refreshAfter(REFRESH_REASONS.TRANSACTION_DELETED);
            } catch {
                setTxError(T("error_network"));
            }
        },
        [apiFetch, refreshAfter, T],
    );

    return {
        txPanel,
        assetTransactions,
        setAssetTransactions,
        txAddMode,
        setTxAddMode,
        editingTxId,
        setEditingTxId,
        txDeleteConfirm,
        setTxDeleteConfirm,
        txForm,
        setTxForm,
        txLoading,
        txError,
        setTxError,
        txWarning,
        setTxWarning,
        txAutofilling,
        openTxPanel,
        closeTxPanel,
        submitTxAdd,
        submitAddTxFromModal,
        autofillTxPrice,
        openEditTx,
        deleteTx,
    };
}
