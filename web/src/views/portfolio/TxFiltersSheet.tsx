"use client";

import type { Dispatch, ReactNode, SetStateAction } from "react";
import { BottomSheet, Label, SheetTitle } from "../../components/ui";
import FilterSheetFooter from "../../components/filters/FilterSheetFooter";
import PeriodFilterSection, {
    calendarMonthRange,
} from "../../components/filters/PeriodFilterSection";
import { useFilterDraft } from "../../components/filters/useFilterDraft";
import type { Asset } from "../../api/types";
import type { Translator } from "../../types";
import {
    ALL_ASSET_TX_TYPES,
    nextTypeSelection,
    type AssetTransactionFilters,
    type AssetTransactionFilterType,
} from "../../context/feedDefaults";

function FilterChip({
    active,
    onClick,
    children,
    testId,
}: {
    active: boolean;
    onClick: () => void;
    children: ReactNode;
    testId?: string;
}) {
    return (
        <button
            type="button"
            data-testid={testId}
            onClick={onClick}
            aria-pressed={active}
            className="pressable"
            style={{
                background: active ? "var(--accent-soft)" : "var(--card-inset)",
                color: active ? "var(--accent-deep)" : "var(--fg)",
                border: `1px solid ${active ? "var(--accent-ring)" : "var(--rule)"}`,
                borderRadius: 999,
                padding: "8px 14px",
                fontSize: 13,
                fontWeight: active ? 700 : 500,
                cursor: "pointer",
                fontFamily: "inherit",
            }}
        >
            {children}
        </button>
    );
}

function SheetSection({
    label,
    children,
}: {
    label: ReactNode;
    children: ReactNode;
}) {
    return (
        <div style={{ marginBottom: 18 }}>
            <Label style={{ marginBottom: 8, display: "block" }}>{label}</Label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {children}
            </div>
        </div>
    );
}

export default function TxFiltersSheet({
    open,
    onClose,
    T,
    investments,
    archivedInvestments = [],
    filters,
    setFilters,
}: {
    open: boolean;
    onClose: () => void;
    T: Translator;
    investments: readonly Asset[];
    archivedInvestments?: readonly Asset[];
    filters: AssetTransactionFilters;
    setFilters: Dispatch<SetStateAction<AssetTransactionFilters>>;
}) {
    // Nothing reaches the feed until "Applica" — see useFilterDraft.
    const { draft, setDraft, apply } = useFilterDraft(
        open,
        filters,
        setFilters,
    );

    const reset = () =>
        setDraft((p) => ({
            ...p,
            asset_ids: [],
            types: [...ALL_ASSET_TX_TYPES],
            verified: null,
            date_from: "",
            date_to: "",
            ordering: "-date",
        }));

    return (
        <BottomSheet open={open} onClose={onClose} ariaLabel={T("cf_filters")}>
            <div style={{ padding: "8px 18px 18px" }}>
                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 8,
                    }}
                >
                    <SheetTitle>{T("cf_filters")}</SheetTitle>
                    <button
                        type="button"
                        data-testid="asset-tx-filters-reset"
                        onClick={reset}
                        style={{
                            border: 0,
                            background: "none",
                            color: "var(--accent)",
                            fontSize: 14,
                            fontWeight: 600,
                            cursor: "pointer",
                            fontFamily: "inherit",
                        }}
                    >
                        {T("cf_filters_reset")}
                    </button>
                </div>

                {/* Period first, mirroring the Cash Flow sheet. */}
                <div style={{ marginBottom: 18 }}>
                    <Label style={{ marginBottom: 8, display: "block" }}>
                        {T("period_label")}
                    </Label>
                    <PeriodFilterSection
                        T={T}
                        dateFrom={draft.date_from}
                        dateTo={draft.date_to}
                        monthRange={calendarMonthRange}
                        allChipTestId="asset-tx-period-all"
                        onRangeChange={({ from, to }) =>
                            setDraft((p) => ({
                                ...p,
                                date_from: from,
                                date_to: to,
                            }))
                        }
                    />
                </div>

                <SheetSection label={T("portfolio_tx_filter_all_assets")}>
                    <FilterChip
                        active={!draft.asset_ids?.length}
                        onClick={() =>
                            setDraft((p) => ({ ...p, asset_ids: [] }))
                        }
                    >
                        {T("portfolio_tx_filter_all_assets")}
                    </FilterChip>
                    {investments.map((a) => (
                        <FilterChip
                            key={a.id}
                            active={
                                String(draft.asset_ids?.[0]) === String(a.id)
                            }
                            onClick={() =>
                                setDraft((p) => ({ ...p, asset_ids: [a.id] }))
                            }
                        >
                            {a.name}
                        </FilterChip>
                    ))}
                    {archivedInvestments.map((a) => (
                        <FilterChip
                            key={a.id}
                            active={
                                String(draft.asset_ids?.[0]) === String(a.id)
                            }
                            onClick={() =>
                                setDraft((p) => ({ ...p, asset_ids: [a.id] }))
                            }
                        >
                            {`${a.name} (${T("label_archived")})`}
                        </FilterChip>
                    ))}
                </SheetSection>

                <SheetSection label={T("type_filter_label")}>
                    <FilterChip
                        active={
                            draft.types.length === ALL_ASSET_TX_TYPES.length
                        }
                        onClick={() =>
                            setDraft((p) => ({
                                ...p,
                                types: [...ALL_ASSET_TX_TYPES],
                            }))
                        }
                    >
                        {T("cf_all_types")}
                    </FilterChip>
                    {ALL_ASSET_TX_TYPES.map((type) => (
                        <FilterChip
                            key={type}
                            active={
                                draft.types.includes(type) &&
                                draft.types.length < ALL_ASSET_TX_TYPES.length
                            }
                            onClick={() =>
                                setDraft((p) => ({
                                    ...p,
                                    types: nextTypeSelection(
                                        p.types,
                                        type as AssetTransactionFilterType,
                                        ALL_ASSET_TX_TYPES,
                                    ),
                                }))
                            }
                        >
                            {T(`tx_type_${type}`)}
                        </FilterChip>
                    ))}
                </SheetSection>

                <SheetSection label={T("verified_filter_label")}>
                    {[
                        { val: null, label: T("verified_filter_all") },
                        { val: true, label: T("verified_filter_yes") },
                        { val: false, label: T("verified_filter_no") },
                    ].map(({ val, label }) => (
                        <FilterChip
                            key={String(val)}
                            active={draft.verified === val}
                            onClick={() =>
                                setDraft((p) => ({ ...p, verified: val }))
                            }
                        >
                            {label}
                        </FilterChip>
                    ))}
                </SheetSection>

                <SheetSection label={T("sort_label")}>
                    {[
                        { val: "-date", label: T("sort_date_desc") },
                        { val: "date", label: T("sort_date_asc") },
                        { val: "-amount", label: T("sort_amount_desc") },
                        { val: "amount", label: T("sort_amount_asc") },
                    ].map(({ val, label }) => (
                        <FilterChip
                            key={val}
                            testId={`asset-tx-sort-option-${val}`}
                            active={(draft.ordering || "-date") === val}
                            onClick={() =>
                                setDraft((p) => ({ ...p, ordering: val }))
                            }
                        >
                            {label}
                        </FilterChip>
                    ))}
                </SheetSection>

                <FilterSheetFooter
                    T={T}
                    onCancel={onClose}
                    onApply={() => {
                        apply();
                        onClose();
                    }}
                    applyTestId="asset-tx-filters-apply"
                    cancelTestId="asset-tx-filters-cancel"
                />
            </div>
        </BottomSheet>
    );
}
