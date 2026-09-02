"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ComponentProps, ReactNode } from "react";
import { useApp } from "../context/useApp";
import { API } from "../utils/api";
import { parseFlexibleDecimal, today } from "../utils/formatters";
import { useFormatters } from "../utils/useFormatters";
import { regroupTargets } from "../utils/allocationGroups";
import type { Asset, ContributionSource } from "../api/types";
import type { EntityId } from "../context/feedTypes";
import type { AssetTransactionFeedItem } from "../context/useAssetTransactionFeed";
import type { AddTxPriceStatus } from "./portfolio/addTransaction/addTransactionTypes";
import PrivacyValue from "../components/PrivacyValue";
import PortfolioContent from "./portfolio/PortfolioContent";
import PortfolioOverlays from "./portfolio/PortfolioOverlays";
import { estimateSellTax } from "./portfolio/portfolioCalculations";
import { decorateDatedItems } from "./transactionFeedModel";
import {
    ASSET_TX_BULK_VERIFY_CONFIRM_THRESHOLD,
    calculatePortfolioTotals,
    createAddTransactionForm,
} from "./portfolio/portfolioViewModel";
import type { PendingAssetTxBulkVerify } from "./portfolio/AssetTxBulkActions";
import { usePortfolioAssetActions } from "./portfolio/usePortfolioAssetActions";

type EditingItem = Parameters<typeof estimateSellTax>[3];

export default function PortfolioView() {
    const { formatEur } = useFormatters();
    const app = useApp();
    const {
        tab,
        T,
        MONTHS,
        assets,
        investmentTypes,
        contributionSources,
        allocationData,
        showAssetModal,
        assetForm,
        txDeleteConfirm,
        investments,
        fetchMonthlyInvestmentStats,
        invStatsMonth,
        invStatsYear,
        fetchAssets,
        fetchPortfolioSummary,
        archiveAsset,
        unarchiveAsset,
        submitAddTxFromModal,
        assetTxItems,
        assetTxFilters,
        assetTxRefreshKey,
        loadAssetTxFeed,
        assetTxSelectionMode,
        assetTxSelectAllFiltered,
        assetTxSelectedCount,
        applyAssetTxBulkVerify,
        apiFetch,
        transactionPrefs,
    } = app;

    const [addModalOpen, setAddModalOpen] = useState(false);
    const [addTxAssetId, setAddTxAssetId] = useState("");
    const [addTxForm, setAddTxForm] = useState(() =>
        createAddTransactionForm(),
    );
    const [addTxError, setAddTxError] = useState<string | null>(null);
    const [addTxLoading, setAddTxLoading] = useState(false);
    const addTxSubmitInFlightRef = useRef(false);
    const [editingAddTxId, setEditingAddTxId] = useState<EntityId | null>(null);
    const [editingAddTxItem, setEditingAddTxItem] = useState<EditingItem>(null);
    const [addTxPriceTouched, setAddTxPriceTouched] = useState(false);
    const [addTxCashTouched, setAddTxCashTouched] = useState(false);
    // Surfaces the historical-price autofill to the user: "loading" while the
    // lookup runs, "unavailable" when the backend has no quote for that date
    // (weekend/holiday/pre-IPO → 404). Without it the price field just silently
    // stayed empty and the submit gave no clue why nothing happened.
    const [addTxPriceStatus, setAddTxPriceStatus] =
        useState<AddTxPriceStatus>("idle");
    const addTxPriceAbortRef = useRef<AbortController | null>(null);
    // Whether the user has hand-edited the tax field. Drives tax_amount_is_manual:
    // an untouched field keeps the auto snapshot (server recomputes at the current
    // rate); a touched one is a manual override the rate-change popup won't rewrite.
    const [addTxTaxTouched, setAddTxTaxTouched] = useState(false);
    const [debouncedAssetTxFilters, setDebouncedAssetTxFilters] =
        useState(assetTxFilters);
    const [allocGroup, setAllocGroup] = useState("all");
    const [activeActionRow, setActiveActionRow] = useState<string | null>(null);
    const [archivedInvExpanded, setArchivedInvExpanded] = useState(false);
    const [openSwipeId, setOpenSwipeId] = useState<EntityId | null>(null);
    const [txFiltersSheetOpen, setTxFiltersSheetOpen] = useState(false);
    const [pendingAssetTxBulkVerify, setPendingAssetTxBulkVerify] =
        useState<PendingAssetTxBulkVerify | null>(null);

    const {
        archiveBlockedModal,
        setArchiveBlockedModal,
        realizeModal,
        setRealizeModal,
        realizeForm,
        setRealizeForm,
        realizeError,
        realizeLoading,
        handleArchiveInvestment,
        handleUnarchiveInvestment,
        openRealizeAsset,
        submitRealizeAsset,
    } = usePortfolioAssetActions({
        T,
        apiFetch,
        // app.archiveAsset returns the broader AssetMutationResult; the hook
        // reads the archive-specific subset it documents.
        archiveAsset: archiveAsset as unknown as Parameters<
            typeof usePortfolioAssetActions
        >[0]["archiveAsset"],
        fetchAssets,
        fetchPortfolioSummary,
        loadAssetTxFeed,
        unarchiveAsset,
    });

    const triggerAssetTxBulkVerify = (value: boolean) => {
        if (
            assetTxSelectAllFiltered ||
            assetTxSelectedCount > ASSET_TX_BULK_VERIFY_CONFIRM_THRESHOLD
        ) {
            setPendingAssetTxBulkVerify({ value });
            return;
        }
        applyAssetTxBulkVerify(value);
    };

    // app.contributionSources uses the hand-written api/contributionSources type
    // (transaction_count: number); the form leaves consume the generated
    // api/types ContributionSource. They are structurally interchangeable for
    // the UI, so bridge once here.
    const activeContributionSources = useMemo(
        () =>
            contributionSources.filter(
                (source) => source.is_active !== false,
            ) as unknown as ContributionSource[],
        [contributionSources],
    );
    // Allocation-target rows recomputed within the selected group (all / investments
    // / accounts) so percentages and buy/sell actions are relative to that group.
    const regroupedAlloc = useMemo(
        () =>
            regroupTargets(
                allocationData,
                allocGroup as "all" | "investments" | "accounts",
            ),
        [allocationData, allocGroup],
    ) as unknown as ComponentProps<typeof PortfolioContent>["regroupedAlloc"];
    const getAvailableContributionSources = (asset: Asset) => {
        if (!asset?.supports_contribution_source) return [];
        // available_contribution_sources / custom_contribution_source_ids are arrays
        // at runtime but typed as string by the untyped SerializerMethodFields.
        const rawAssetSources = asset.available_contribution_sources as unknown;
        const rawCustomIds = asset.custom_contribution_source_ids as unknown;
        const assetSources = Array.isArray(rawAssetSources)
            ? (rawAssetSources as ContributionSource[])
            : [];
        const hasCustomSources =
            Array.isArray(rawCustomIds) && rawCustomIds.length > 0;
        return (
            hasCustomSources ? assetSources : activeContributionSources
        ).filter((source) => source.is_active !== false);
    };
    const assetFormSupportsContributionSource = useMemo(() => {
        const selectedType = investmentTypes.find(
            (t) => t.id === parseInt(String(assetForm.investment_type), 10),
        );
        if (!selectedType || selectedType.is_bank_account) return false;
        const mode = assetForm.contribution_source_mode || "inherit";
        if (mode === "enabled") return true;
        if (mode === "disabled") return false;
        return !!selectedType.supports_contribution_source;
    }, [
        assetForm.contribution_source_mode,
        assetForm.investment_type,
        investmentTypes,
    ]);
    const hasActiveOverlay =
        addModalOpen ||
        showAssetModal ||
        !!txDeleteConfirm ||
        txFiltersSheetOpen ||
        !!archiveBlockedModal ||
        !!realizeModal ||
        assetTxSelectionMode ||
        !!pendingAssetTxBulkVerify ||
        !!activeActionRow;
    const masked = (key: string, value: ReactNode, revealControl = false) => (
        <PrivacyValue
            scope="investments"
            field={key}
            revealControl={revealControl}
        >
            {value}
        </PrivacyValue>
    );

    // Load tx feed only while the Portfolio tab is active: avoids fetching the
    // global asset-transactions list every time refreshAfter() bumps the refresh
    // key on Cash Flow / Settings mutations.
    useEffect(() => {
        const t = setTimeout(
            () => setDebouncedAssetTxFilters(assetTxFilters),
            180,
        );
        return () => clearTimeout(t);
    }, [assetTxFilters]);

    useEffect(() => {
        if (tab !== "portfolio") return;
        loadAssetTxFeed(1, debouncedAssetTxFilters);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        tab,
        debouncedAssetTxFilters.asset_ids,
        debouncedAssetTxFilters.types,
        debouncedAssetTxFilters.date_from,
        debouncedAssetTxFilters.date_to,
        debouncedAssetTxFilters.verified,
        debouncedAssetTxFilters.search,
        debouncedAssetTxFilters.ordering,
        assetTxRefreshKey,
    ]);

    // Refetch monthly investment stats while the Portfolio tab is active and when
    // the card's dedicated month/year changes (independent from Cash Flow).
    useEffect(() => {
        if (tab !== "portfolio") return;
        fetchMonthlyInvestmentStats();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tab, invStatsMonth, invStatsYear, assetTxRefreshKey]);

    // Day dividers carry the day's signed net: buys and cash-outs leave the
    // portfolio (−), sells and cash-ins add to it (+); adjustments are neutral.
    const assetTxDecorated = useMemo(
        () =>
            decorateDatedItems(
                assetTxItems as readonly (AssetTransactionFeedItem & {
                    date: string;
                })[],
                MONTHS,
                T,
                undefined,
                (row) => {
                    const value =
                        Number.parseFloat(
                            String(row.cash_flow_value ?? row.total_value ?? 0),
                        ) || 0;
                    const type = row.transaction_type;
                    if (type === "buy" || type === "cash_out") return -value;
                    if (type === "sell" || type === "cash_in") return value;
                    return 0;
                },
            ),
        [assetTxItems, MONTHS, T],
    );

    const openAddTxModal = () => {
        setAddModalOpen(true);
        setAddTxAssetId("");
        setEditingAddTxId(null);
        setEditingAddTxItem(null);
        setAddTxError(null);
        setAddTxForm(
            createAddTransactionForm(
                transactionPrefs?.investments_default_verified ?? false,
            ),
        );
        setAddTxPriceTouched(false);
        setAddTxCashTouched(false);
        setAddTxTaxTouched(false);
    };

    const openEditTransaction = (item: AssetTransactionFeedItem) => {
        setAddModalOpen(true);
        setAddTxAssetId(String(item.asset?.id ?? ""));
        setEditingAddTxId(item.id);
        setEditingAddTxItem(item as unknown as EditingItem);
        setAddTxError(null);
        setAddTxForm({
            transaction_type: item.transaction_type || "buy",
            date: item.date || today(),
            shares: String(item.shares ?? ""),
            price_per_share: String(item.price_per_share ?? ""),
            cash_amount: String(item.cash_amount ?? item.cash_flow_value ?? ""),
            fee: String(item.fee ?? ""),
            tax_amount: item.tax_amount_is_manual
                ? String(item.tax_amount ?? "")
                : "",
            notes: item.notes || "",
            linked_account_id: item.linked_account_id
                ? String(item.linked_account_id)
                : "",
            contribution_source: item.contribution_source
                ? String(item.contribution_source)
                : "",
            is_verified: item.is_verified ?? false,
        });
        setAddTxPriceTouched(true);
        setAddTxCashTouched(true);
        // Preserve the manual/auto nature of the tax on edit: a manual override
        // stays manual (and editable); an auto one stays auto unless the user edits.
        setAddTxTaxTouched(!!item.tax_amount_is_manual);
    };

    const closeAddModal = () => {
        setAddModalOpen(false);
        setEditingAddTxId(null);
        setEditingAddTxItem(null);
        setAddTxError(null);
        setAddTxPriceTouched(false);
        setAddTxCashTouched(false);
        setAddTxTaxTouched(false);
    };

    // Autofill the price from the asset's historical quote. It runs in edit mode
    // too: `openEditTransaction` marks the price as touched, so the saved value is
    // safe, and the lookup only kicks in once the user actually changes the date
    // (which clears the field). Skipping it on edit was the reason changing a date
    // left the price permanently empty and the submit silently blocked.
    useEffect(() => {
        const selectedAsset = assets.find(
            (a) => String(a.id) === String(addTxAssetId),
        );
        if (
            !addModalOpen ||
            !selectedAsset?.ticker ||
            !addTxForm.date ||
            addTxPriceTouched ||
            addTxForm.price_per_share
        ) {
            // Nothing to look up (no ticker, the field is already filled, or the
            // user is typing it themselves): drop any stale hint. Guarding on the
            // filled price also stops a background `assets` refresh from
            // re-running the lookup and flashing the hint. Same-value setState
            // is a no-op, so this can't loop.
            setAddTxPriceStatus("idle");
            return;
        }
        // Abort any in-flight lookup so a late response for an older date can't
        // land on top of the current one.
        addTxPriceAbortRef.current?.abort();
        const controller = new AbortController();
        addTxPriceAbortRef.current = controller;
        const run = async () => {
            setAddTxPriceStatus("loading");
            try {
                const res = await apiFetch(
                    `${API}/portfolio/${selectedAsset.id}/historical-price/?date=${addTxForm.date}`,
                    { signal: controller.signal },
                );
                if (controller.signal.aborted) return;
                const data = res.ok ? await res.json() : null;
                if (controller.signal.aborted) return;
                if (!data?.close) {
                    // The backend answered and has no quote for this date.
                    setAddTxPriceStatus("unavailable");
                    return;
                }
                setAddTxPriceStatus("idle");
                setAddTxForm((prev) => {
                    if (prev.price_per_share) return prev;
                    return { ...prev, price_per_share: String(data.close) };
                });
            } catch {
                // Network/abort failure: no definitive answer, so no hint —
                // the submit-time validation still explains the empty field.
                if (!controller.signal.aborted) setAddTxPriceStatus("idle");
            } finally {
                if (addTxPriceAbortRef.current === controller) {
                    addTxPriceAbortRef.current = null;
                }
            }
        };
        run();
        return () => {
            controller.abort();
        };
    }, [
        addModalOpen,
        assets,
        addTxAssetId,
        addTxForm.date,
        addTxForm.price_per_share,
        addTxPriceTouched,
        apiFetch,
    ]);

    // Prefill the editable tax field on a SELL with the estimate from the asset's
    // current effective rate, so the snapshot is shown and adjustable. Skips once
    // the user has hand-edited the field (addTxTaxTouched) so we never clobber a
    // manual override.
    useEffect(() => {
        if (!addModalOpen || addTxForm.transaction_type !== "sell") return;
        if (addTxTaxTouched) return;
        const selectedAsset = assets.find(
            (a) => String(a.id) === String(addTxAssetId),
        );
        const est = estimateSellTax(
            addTxForm,
            selectedAsset,
            editingAddTxId,
            editingAddTxItem,
        );
        const formatted = est > 0 ? est.toFixed(2) : "";
        setAddTxForm((prev) =>
            prev.tax_amount === formatted
                ? prev
                : { ...prev, tax_amount: formatted },
        );
        // Depend on the specific form fields that feed the estimate, not the whole
        // addTxForm object, so updating tax_amount here doesn't re-trigger.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        addModalOpen,
        addTxTaxTouched,
        addTxForm.transaction_type,
        addTxForm.shares,
        addTxForm.price_per_share,
        addTxForm.fee,
        addTxAssetId,
        assets,
        editingAddTxId,
        editingAddTxItem,
    ]);

    // The cash movement is a first-class snapshot.  For a new transaction we
    // offer the legacy formula as a convenient default, but once the user edits
    // it (or when an existing transaction is opened) it is never overwritten by
    // quote/fee/tax changes in the background.
    useEffect(() => {
        if (!addModalOpen || addTxCashTouched) return;
        const shares = parseFlexibleDecimal(addTxForm.shares);
        const price = parseFlexibleDecimal(addTxForm.price_per_share);
        const fee = addTxForm.fee ? parseFlexibleDecimal(addTxForm.fee) : 0;
        const tax = addTxForm.tax_amount
            ? parseFlexibleDecimal(addTxForm.tax_amount)
            : 0;
        if (
            !Number.isFinite(shares) ||
            !Number.isFinite(price) ||
            !Number.isFinite(fee) ||
            !Number.isFinite(tax) ||
            shares <= 0 ||
            price <= 0 ||
            fee < 0 ||
            tax < 0
        ) {
            setAddTxForm((prev) =>
                prev.cash_amount ? { ...prev, cash_amount: "" } : prev,
            );
            return;
        }
        const gross = shares * price;
        const cash =
            addTxForm.transaction_type === "sell"
                ? gross - fee - tax
                : gross + fee;
        const formatted = cash > 0 ? cash.toFixed(2) : "";
        setAddTxForm((prev) =>
            prev.cash_amount === formatted
                ? prev
                : { ...prev, cash_amount: formatted },
        );
    }, [
        addModalOpen,
        addTxCashTouched,
        addTxForm.transaction_type,
        addTxForm.shares,
        addTxForm.price_per_share,
        addTxForm.fee,
        addTxForm.tax_amount,
    ]);

    const handleAddTxSubmit = async () => {
        // React applies the loading state on the next render, so two click events
        // dispatched in the same tick can both observe an enabled button. Keep a
        // synchronous lock as the source of truth for the in-flight submission.
        if (addTxSubmitInFlightRef.current) return;
        addTxSubmitInFlightRef.current = true;
        setAddTxError(null);
        setAddTxLoading(true);
        try {
            const taxIsManual =
                addTxForm.transaction_type === "sell" && addTxTaxTouched;
            const result = await submitAddTxFromModal(
                addTxAssetId,
                addTxForm,
                editingAddTxId,
                { taxIsManual },
            );
            if (result.ok) {
                closeAddModal();
                // Force immediate feed refresh so edited rows reflect new values even
                // before broader refresh orchestration settles.
                await loadAssetTxFeed(1);
            } else {
                setAddTxError(
                    result.error ?? T(result.errorKey ?? "error_save_failed"),
                );
            }
        } finally {
            setAddTxLoading(false);
            addTxSubmitInFlightRef.current = false;
        }
    };

    const { totalValue, totalGain, totalGainPct } =
        calculatePortfolioTotals(investments);
    const handlePullRefresh = async () => {
        await Promise.all([
            fetchAssets(),
            fetchPortfolioSummary(),
            loadAssetTxFeed(1),
            fetchMonthlyInvestmentStats(),
        ]);
    };

    return (
        <>
            <PortfolioContent
                // The AppContext value carries these props with the hand-written
                // api/* types (and Dispatch<union> setters), which differ from the
                // generated types the leaf components use. They are runtime-
                // compatible, so cast the bag once; every prop computed here is
                // still passed (and type-checked) explicitly below.
                {...(app as unknown as ComponentProps<typeof PortfolioContent>)}
                formatEur={formatEur}
                masked={masked}
                totalValue={totalValue}
                totalGain={totalGain}
                totalGainPct={totalGainPct}
                handlePullRefresh={handlePullRefresh}
                archivedInvExpanded={archivedInvExpanded}
                setArchivedInvExpanded={setArchivedInvExpanded}
                handleArchiveInvestment={handleArchiveInvestment}
                handleUnarchiveInvestment={handleUnarchiveInvestment}
                openRealizeAsset={openRealizeAsset}
                openSwipeId={openSwipeId}
                setOpenSwipeId={setOpenSwipeId}
                regroupedAlloc={regroupedAlloc}
                allocGroup={allocGroup}
                setAllocGroup={setAllocGroup}
                assetTxDecorated={assetTxDecorated}
                setTxFiltersSheetOpen={setTxFiltersSheetOpen}
                activeActionRow={activeActionRow}
                setActiveActionRow={setActiveActionRow}
                openEditTransaction={openEditTransaction}
                openAddTxModal={openAddTxModal}
            />
            <PortfolioOverlays
                {...(app as unknown as ComponentProps<
                    typeof PortfolioOverlays
                >)}
                formatEur={formatEur}
                addModalOpen={addModalOpen}
                closeAddModal={closeAddModal}
                editingAddTxId={editingAddTxId}
                addTxAssetId={addTxAssetId}
                setAddTxAssetId={setAddTxAssetId}
                addTxForm={addTxForm}
                setAddTxForm={setAddTxForm}
                addTxError={addTxError}
                addTxLoading={addTxLoading}
                setAddTxPriceTouched={setAddTxPriceTouched}
                setAddTxCashTouched={setAddTxCashTouched}
                setAddTxTaxTouched={setAddTxTaxTouched}
                addTxPriceStatus={addTxPriceStatus}
                editingAddTxItem={editingAddTxItem}
                getAvailableContributionSources={
                    getAvailableContributionSources
                }
                handleAddTxSubmit={handleAddTxSubmit}
                assetFormSupportsContributionSource={
                    assetFormSupportsContributionSource
                }
                activeContributionSources={activeContributionSources}
                realizeModal={realizeModal}
                setRealizeModal={(modal) =>
                    setRealizeModal(modal as Asset | null)
                }
                realizeForm={realizeForm}
                setRealizeForm={setRealizeForm}
                realizeError={realizeError}
                realizeLoading={realizeLoading}
                submitRealizeAsset={submitRealizeAsset}
                pendingAssetTxBulkVerify={pendingAssetTxBulkVerify}
                setPendingAssetTxBulkVerify={setPendingAssetTxBulkVerify}
                triggerAssetTxBulkVerify={triggerAssetTxBulkVerify}
                txFiltersSheetOpen={txFiltersSheetOpen}
                setTxFiltersSheetOpen={setTxFiltersSheetOpen}
                archiveBlockedModal={archiveBlockedModal}
                setArchiveBlockedModal={setArchiveBlockedModal}
                hasActiveOverlay={hasActiveOverlay}
                openAddTxModal={openAddTxModal}
            />
        </>
    );
}
