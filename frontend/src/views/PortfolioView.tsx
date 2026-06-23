import { useEffect, useMemo, useState } from "react";
import type { ComponentProps, ReactNode } from "react";
import { useApp } from "../context/useApp";
import { API } from "../utils/api";
import { today } from "../utils/formatters";
import { useFormatters } from "../utils/useFormatters";
import { regroupTargets } from "../utils/allocationGroups";
import type { Asset, ContributionSource } from "../api/types";
import type { EntityId } from "../context/feedTypes";
import type { AssetTransactionFeedItem } from "../context/useAssetTransactionFeed";
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
    const [editingAddTxId, setEditingAddTxId] = useState<EntityId | null>(null);
    const [editingAddTxItem, setEditingAddTxItem] = useState<EditingItem>(null);
    const [addTxPriceTouched, setAddTxPriceTouched] = useState(false);
    // Whether the user has hand-edited the tax field. Drives tax_amount_is_manual:
    // an untouched field keeps the auto snapshot (server recomputes at the current
    // rate); a touched one is a manual override the rate-change popup won't rewrite.
    const [addTxTaxTouched, setAddTxTaxTouched] = useState(false);
    const [assetTxPeriodMode, setAssetTxPeriodMode] = useState<
        "month" | "year"
    >("month");
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

    const assetTxDecorated = useMemo(
        () =>
            decorateDatedItems(
                assetTxItems as readonly (AssetTransactionFeedItem & {
                    date: string;
                })[],
                MONTHS,
                T,
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
        setAddTxTaxTouched(false);
    };

    useEffect(() => {
        const selectedAsset = assets.find(
            (a) => String(a.id) === String(addTxAssetId),
        );
        if (
            !addModalOpen ||
            editingAddTxId ||
            !selectedAsset?.ticker ||
            !addTxForm.date ||
            addTxPriceTouched
        )
            return;
        let cancelled = false;
        const run = async () => {
            try {
                const res = await apiFetch(
                    `${API}/portfolio/${selectedAsset.id}/historical-price/?date=${addTxForm.date}`,
                );
                if (!res.ok || cancelled) return;
                const data = await res.json();
                if (cancelled || !data?.close) return;
                setAddTxForm((prev) => {
                    if (prev.price_per_share) return prev;
                    return { ...prev, price_per_share: String(data.close) };
                });
            } catch {
                // best effort
            }
        };
        run();
        return () => {
            cancelled = true;
        };
    }, [
        addModalOpen,
        editingAddTxId,
        assets,
        addTxAssetId,
        addTxForm.date,
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

    const handleAddTxSubmit = async () => {
        setAddTxError(null);
        setAddTxLoading(true);
        const taxIsManual =
            addTxForm.transaction_type === "sell" && addTxTaxTouched;
        const result = await submitAddTxFromModal(
            addTxAssetId,
            addTxForm,
            editingAddTxId,
            { taxIsManual },
        );
        setAddTxLoading(false);
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
                setAddTxTaxTouched={setAddTxTaxTouched}
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
                assetTxPeriodMode={assetTxPeriodMode}
                setAssetTxPeriodMode={(mode) =>
                    setAssetTxPeriodMode(mode as "month" | "year")
                }
                archiveBlockedModal={archiveBlockedModal}
                setArchiveBlockedModal={setArchiveBlockedModal}
                hasActiveOverlay={hasActiveOverlay}
                openAddTxModal={openAddTxModal}
            />
        </>
    );
}
