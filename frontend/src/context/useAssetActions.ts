import { API, LONG_FETCH_TIMEOUT_MS } from "../utils/api";
import {
    parseAmount,
    parseFlexibleDecimal,
    parseMoneyToString,
} from "../utils/formatters";
import { REFRESH_REASONS } from "../utils/refreshReasons";
import type { ApiFetcher } from "../api/client";
import type { Asset } from "../api/types";
import type { Translator } from "../types";
import type { DecimalSeparator } from "../utils/formatters";
import type { RefreshReason } from "../utils/refreshReasons";
import type { Dispatch, SetStateAction } from "react";
import type { AppProviderState } from "./useAppProviderState";
import type { TickerResult, TickerSearchOrigin } from "./useImportAndTicker";

type AssetActionState = Pick<
    AppProviderState,
    | "adjustAssetId"
    | "adjustForm"
    | "assetForm"
    | "assetSaving"
    | "contributionSources"
    | "editingAssetId"
    | "editingAssetOrigOverrideRef"
    | "investmentTypes"
    | "setAdjustAssetId"
    | "setAdjustError"
    | "setAdjustForm"
    | "setAssetError"
    | "setAssetForm"
    | "setAssetSaving"
    | "setEditingAssetId"
    | "setPriceRefreshCounter"
    | "setRefreshing"
    | "setRefreshMsg"
    | "setShowAdjustModal"
    | "setShowAssetModal"
    | "setTaxPropagationFlow"
>;

export type AssetActionsOptions = AssetActionState & {
    T: Translator;
    apiFetch: ApiFetcher;
    decimalSeparator: DecimalSeparator;
    guardDemo: () => boolean;
    refreshAfter: (reason: RefreshReason) => unknown;
    setTickerQuery: Dispatch<SetStateAction<string>>;
    setTickerResults: Dispatch<SetStateAction<TickerResult[]>>;
    setTickerSearchOrigin: Dispatch<SetStateAction<TickerSearchOrigin>>;
};

type AssetPayload = {
    name: string;
    ticker: string;
    price_source: string;
    source_symbol: string;
    source_url: string;
    isin: string;
    investment_type: number;
    tracking_type: string;
    notes: string;
    source_account: number | null;
    contribution_source_mode: string;
    contribution_source_ids: number[];
    tax_rate_override?: string | null;
    currency?: string;
    initial_balance?: string;
};

type AssetMutationResult =
    | { ok: false; data: unknown }
    | { ok: true; rollbackCandidates?: unknown[] };

type PriceRefreshResponse = {
    updated?: number;
    total?: number;
    details?: Array<{
        status?: string;
        ticker?: string;
        name?: string;
    }>;
};

const responseErrorMessage = (payload: unknown): string => {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        return "";
    }
    return Object.values(payload).flat().filter(Boolean).join(" ");
};

export function useAssetActions({
    adjustAssetId,
    adjustForm,
    apiFetch,
    assetForm,
    assetSaving,
    contributionSources,
    decimalSeparator,
    editingAssetId,
    editingAssetOrigOverrideRef,
    guardDemo,
    investmentTypes,
    refreshAfter,
    setAdjustAssetId,
    setAdjustError,
    setAdjustForm,
    setAssetError,
    setAssetForm,
    setAssetSaving,
    setEditingAssetId,
    setPriceRefreshCounter,
    setRefreshing,
    setRefreshMsg,
    setShowAdjustModal,
    setShowAssetModal,
    setTaxPropagationFlow,
    setTickerQuery,
    setTickerResults,
    setTickerSearchOrigin,
    T,
}: AssetActionsOptions) {
    // ── Asset actions ──

    const openAssetAdd = (
        preferredType?: Asset["investment_type_detail"],
    ): void => {
        const firstType =
            preferredType !== undefined ? preferredType : investmentTypes[0];
        setEditingAssetId(null);
        editingAssetOrigOverrideRef.current = null;
        setAssetForm({
            name: "",
            ticker: "",
            price_source: "AUTO",
            source_symbol: "",
            source_url: "",
            isin: "",
            investment_type: firstType?.id || "",
            tracking_type: "AUTO",
            initial_balance: "",
            tax_rate_override: "",
            notes: "",
            source_account: "",
            contribution_source_mode: "inherit",
            contribution_source_ids: [],
        });
        setTickerQuery("");
        setTickerResults([]);
        setTickerSearchOrigin("ticker");
        setAssetError(null);
        setShowAssetModal(true);
    };

    const openAssetEdit = (a: Asset): void => {
        const rawContributionSourceIds: unknown =
            a.custom_contribution_source_ids;
        const customContributionSourceIds = Array.isArray(
            rawContributionSourceIds,
        )
            ? rawContributionSourceIds
            : [];
        setEditingAssetId(a.id);
        editingAssetOrigOverrideRef.current =
            a.tax_rate_override !== null && a.tax_rate_override !== undefined
                ? Number(a.tax_rate_override)
                : null;
        setAssetForm({
            name: a.name,
            ticker: a.ticker || "",
            price_source: a.price_source || "AUTO",
            source_symbol: a.source_symbol || a.ticker || "",
            source_url: a.source_url || "",
            isin: a.isin || "",
            investment_type: a.investment_type ?? "",
            tracking_type: a.tracking_type || "AUTO",
            initial_balance: "",
            tax_rate_override:
                a.tax_rate_override !== null &&
                a.tax_rate_override !== undefined
                    ? String(
                          Number.parseFloat(String(a.tax_rate_override)) * 100,
                      )
                    : "",
            notes: a.notes || "",
            source_account: a.source_account ? String(a.source_account) : "",
            contribution_source_mode: a.contribution_source_mode || "inherit",
            contribution_source_ids: customContributionSourceIds.map((id) =>
                String(id),
            ),
        });
        setTickerQuery(a.ticker || "");
        setTickerResults([]);
        setTickerSearchOrigin("ticker");
        setAssetError(null);
        setShowAssetModal(true);
    };

    const closeAssetModal = () => {
        setShowAssetModal(false);
        setEditingAssetId(null);
        setAssetError(null);
        setTickerQuery("");
        setTickerResults([]);
        setTickerSearchOrigin("ticker");
    };

    const saveAsset = async () => {
        if (guardDemo()) return;
        if (assetSaving) return;
        if (!assetForm.name) {
            setAssetError(T("error_name_required"));
            return;
        }
        if (!assetForm.investment_type) {
            setAssetError(T("error_type_required"));
            return;
        }
        setAssetError(null);
        setAssetSaving(true);
        const selectedType = investmentTypes.find(
            (type) =>
                type.id ===
                Number.parseInt(String(assetForm.investment_type), 10),
        );
        const isBankAccount = !!selectedType?.is_bank_account;
        const isManual = isBankAccount || assetForm.tracking_type === "MANUAL";
        const activeContributionSourceIds = new Set(
            contributionSources
                .filter((source) => source.is_active !== false)
                .map((source) => String(source.id)),
        );
        const body: AssetPayload = {
            name: assetForm.name,
            ticker: isManual ? "" : assetForm.ticker || "",
            price_source: isManual ? "AUTO" : assetForm.price_source || "AUTO",
            source_symbol: isManual
                ? ""
                : assetForm.source_symbol || assetForm.ticker || "",
            source_url: isManual ? "" : assetForm.source_url || "",
            isin: assetForm.isin || "",
            investment_type: Number.parseInt(
                String(assetForm.investment_type),
                10,
            ),
            tracking_type: isManual ? "MANUAL" : "AUTO",
            notes: assetForm.notes || "",
            source_account:
                !isBankAccount && assetForm.source_account
                    ? Number.parseInt(assetForm.source_account, 10)
                    : null,
            contribution_source_mode:
                !isBankAccount && assetForm.contribution_source_mode
                    ? assetForm.contribution_source_mode
                    : "inherit",
            contribution_source_ids: !isBankAccount
                ? (assetForm.contribution_source_ids || [])
                      .filter((id) =>
                          activeContributionSourceIds.has(String(id)),
                      )
                      .map((id) => Number.parseInt(String(id), 10))
                : [],
        };
        if (!isBankAccount && assetForm.tax_rate_override !== "") {
            const parsedTaxRate = parseFlexibleDecimal(
                assetForm.tax_rate_override,
            );
            if (Number.isNaN(parsedTaxRate) || parsedTaxRate < 0) {
                setAssetError(T("error_invalid_amount"));
                setAssetSaving(false);
                return;
            }
            body.tax_rate_override = String(parsedTaxRate / 100);
        } else {
            body.tax_rate_override = null;
        }
        if (!editingAssetId) {
            body.currency = "EUR";
        }
        if (!editingAssetId && isManual && assetForm.initial_balance) {
            const parsedInitialBalance = parseFlexibleDecimal(
                assetForm.initial_balance,
            );
            if (
                Number.isNaN(parsedInitialBalance) ||
                parsedInitialBalance < 0
            ) {
                setAssetError(T("error_invalid_amount"));
                setAssetSaving(false);
                return;
            }
            body.initial_balance = String(parsedInitialBalance);
        }
        const doSave = async (
            propagation: "all" | "forward" | null,
        ): Promise<boolean> => {
            const finalBody =
                propagation && editingAssetId
                    ? { ...body, tax_propagation: propagation }
                    : body;
            try {
                const res = await apiFetch(
                    editingAssetId
                        ? `${API}/portfolio/${editingAssetId}/`
                        : `${API}/portfolio/`,
                    {
                        method: editingAssetId ? "PATCH" : "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(finalBody),
                    },
                );
                if (!res.ok) {
                    const err = (await res.json().catch(() => ({}))) as unknown;
                    setAssetError(
                        responseErrorMessage(err) || `Error ${res.status}`,
                    );
                    return false;
                }
                closeAssetModal();
                setAssetForm({
                    name: "",
                    ticker: "",
                    price_source: "AUTO",
                    source_symbol: "",
                    source_url: "",
                    isin: "",
                    investment_type: "",
                    tracking_type: "AUTO",
                    initial_balance: "",
                    tax_rate_override: "",
                    notes: "",
                    source_account: "",
                    contribution_source_mode: "inherit",
                    contribution_source_ids: [],
                });
                refreshAfter(
                    editingAssetId
                        ? REFRESH_REASONS.ASSET_UPDATED
                        : REFRESH_REASONS.ASSET_CREATED,
                );
                return true;
            } catch {
                setAssetError(T("error_network"));
                return false;
            } finally {
                setAssetSaving(false);
            }
        };

        // If the asset's tax override changed on an existing asset, ask whether to
        // propagate the new rate to its already-created sells before saving.
        const newOverride =
            body.tax_rate_override != null
                ? Number(body.tax_rate_override)
                : null;
        const taxChanged =
            !!editingAssetId &&
            newOverride !== editingAssetOrigOverrideRef.current;
        if (taxChanged) {
            setAssetSaving(false);
            setTaxPropagationFlow({
                kind: "asset",
                run: async (propagation) => {
                    setAssetSaving(true);
                    const ok = await doSave(propagation);
                    setTaxPropagationFlow(null);
                    return ok;
                },
            });
            return;
        }
        await doSave(null);
    };

    const openAdjustBalance = (a: Asset): void => {
        setAdjustAssetId(a.id);
        setAdjustForm({ new_balance: String(a.current_value || "") });
        setAdjustError(null);
        setShowAdjustModal(true);
    };

    const closeAdjustModal = () => {
        setShowAdjustModal(false);
        setAdjustAssetId(null);
        setAdjustError(null);
    };

    const saveAdjustBalance = async () => {
        if (guardDemo()) return;
        if (!adjustAssetId) return;
        // HIGH-25 / CRIT-04: parseFloat mangled IT-formatted input ("1.234,56" →
        // 1.234) and let Infinity slip past isNaN. parseAmount honors the user's
        // separator and rejects Infinity / >1e12; the balance may legitimately be
        // negative or zero (overdraft), which parseAmount preserves.
        const val = parseAmount(adjustForm.new_balance, decimalSeparator);
        if (isNaN(val)) {
            setAdjustError(T("error_generic"));
            return;
        }
        // Send the canonical decimal string (no Number round-trip) so precision is
        // preserved on the backend DecimalField.
        const newBalanceStr = parseMoneyToString(
            adjustForm.new_balance,
            decimalSeparator,
        );
        if (newBalanceStr == null) {
            setAdjustError(T("error_invalid_amount"));
            return;
        }
        setAdjustError(null);
        try {
            const res = await apiFetch(
                `${API}/portfolio/${adjustAssetId}/adjust-balance/`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ new_balance: newBalanceStr }),
                },
            );
            if (!res.ok) {
                const err = (await res.json().catch(() => ({}))) as unknown;
                setAdjustError(
                    responseErrorMessage(err) || T("error_save_failed"),
                );
                return;
            }
            closeAdjustModal();
            refreshAfter(REFRESH_REASONS.BALANCE_ADJUSTED);
        } catch {
            setAdjustError(T("error_network"));
        }
    };

    const deleteAsset = async (id: number | string): Promise<void> => {
        if (guardDemo()) return;
        await apiFetch(`${API}/portfolio/${id}/`, { method: "DELETE" });
        refreshAfter(REFRESH_REASONS.ASSET_DELETED);
    };

    const archiveAsset = async (
        id: number | string,
    ): Promise<AssetMutationResult | undefined> => {
        if (guardDemo()) return;
        const res = await apiFetch(`${API}/portfolio/${id}/archive/`, {
            method: "POST",
        });
        if (!res.ok) {
            const data = (await res.json().catch(() => ({}))) as unknown;
            return { ok: false, data };
        }
        refreshAfter(REFRESH_REASONS.ASSET_UPDATED);
        return { ok: true };
    };

    const unarchiveAsset = async (
        id: number | string,
    ): Promise<AssetMutationResult | undefined> => {
        if (guardDemo()) return;
        const res = await apiFetch(`${API}/portfolio/${id}/unarchive/`, {
            method: "POST",
        });
        if (!res.ok) {
            const data = (await res.json().catch(() => ({}))) as unknown;
            return { ok: false, data };
        }
        const data = (await res.json().catch(() => ({}))) as {
            rollback_candidates?: unknown[];
        };
        refreshAfter(REFRESH_REASONS.ASSET_UPDATED);
        return { ok: true, rollbackCandidates: data.rollback_candidates || [] };
    };

    const moveAsset = async (
        id: number | string,
        destinationAccountId: number | string,
    ): Promise<AssetMutationResult | undefined> => {
        if (guardDemo()) return;
        const res = await apiFetch(`${API}/portfolio/${id}/move/`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                destination_account_id: destinationAccountId,
            }),
        });
        if (!res.ok) {
            const data = (await res.json().catch(() => ({}))) as unknown;
            return { ok: false, data };
        }
        refreshAfter(REFRESH_REASONS.ASSET_UPDATED);
        return { ok: true };
    };

    const refreshPrices = async () => {
        setRefreshing(true);
        setRefreshMsg(null);
        try {
            const res = await apiFetch(`${API}/portfolio/refresh-prices/`, {
                method: "POST",
                timeoutMs: LONG_FETCH_TIMEOUT_MS,
            });
            if (!res.ok) {
                setRefreshMsg(T("error_network"));
                return;
            }
            const data = (await res.json()) as PriceRefreshResponse;
            refreshAfter(REFRESH_REASONS.PRICE_REFRESH_COMPLETED);
            setPriceRefreshCounter((c) => c + 1);
            const failed = (data.details ?? [])
                .filter((detail) => detail.status === "error")
                .map((detail) => detail.ticker || detail.name)
                .filter((name): name is string => Boolean(name));
            let msg = `${data.updated ?? 0}/${data.total ?? 0} ${T("refresh_done")}`;
            if (failed.length) msg += ` · ⚠ ${failed.join(", ")}`;
            setRefreshMsg(msg);
        } catch {
            setRefreshMsg(T("error_network"));
        } finally {
            setRefreshing(false);
        }
    };

    return {
        openAssetAdd,
        openAssetEdit,
        closeAssetModal,
        saveAsset,
        openAdjustBalance,
        closeAdjustModal,
        saveAdjustBalance,
        deleteAsset,
        archiveAsset,
        unarchiveAsset,
        moveAsset,
        refreshPrices,
    };
}
