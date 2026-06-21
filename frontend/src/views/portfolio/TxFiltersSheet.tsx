import type { Dispatch, ReactNode, SetStateAction } from "react";
import {
    BottomSheet,
    Label,
    MonthPicker,
    SheetTitle,
} from "../../components/ui";
import type { Asset } from "../../api/types";
import type { Translator } from "../../types";
import {
    ALL_ASSET_TX_TYPES,
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
    toggleType,
    periodMode,
    setPeriodMode,
}: {
    open: boolean;
    onClose: () => void;
    T: Translator;
    investments: readonly Asset[];
    archivedInvestments?: readonly Asset[];
    filters: AssetTransactionFilters;
    setFilters: Dispatch<SetStateAction<AssetTransactionFilters>>;
    toggleType: (type: AssetTransactionFilterType) => void;
    periodMode: "month" | "year";
    setPeriodMode: (mode: string) => void;
}) {
    const reset = () =>
        setFilters((p) => ({
            ...p,
            asset_ids: [],
            types: ALL_ASSET_TX_TYPES,
            verified: null,
            date_from: "",
            date_to: "",
            ordering: "-date",
        }));

    return (
        <BottomSheet open={open} onClose={onClose} ariaLabel={T("cf_filters")}>
            <div style={{ padding: "8px 18px 18px" }}>
                <SheetTitle>{T("cf_filters")}</SheetTitle>

                <SheetSection label={T("portfolio_tx_filter_all_assets")}>
                    <FilterChip
                        active={!filters.asset_ids?.length}
                        onClick={() =>
                            setFilters((p) => ({ ...p, asset_ids: [] }))
                        }
                    >
                        {T("portfolio_tx_filter_all_assets")}
                    </FilterChip>
                    {investments.map((a) => (
                        <FilterChip
                            key={a.id}
                            active={
                                String(filters.asset_ids?.[0]) === String(a.id)
                            }
                            onClick={() =>
                                setFilters((p) => ({ ...p, asset_ids: [a.id] }))
                            }
                        >
                            {a.name}
                        </FilterChip>
                    ))}
                    {archivedInvestments.map((a) => (
                        <FilterChip
                            key={a.id}
                            active={
                                String(filters.asset_ids?.[0]) === String(a.id)
                            }
                            onClick={() =>
                                setFilters((p) => ({ ...p, asset_ids: [a.id] }))
                            }
                        >
                            {`${a.name} (${T("label_archived")})`}
                        </FilterChip>
                    ))}
                </SheetSection>

                <SheetSection label={T("type_filter_label")}>
                    <FilterChip
                        active={
                            filters.types.length === ALL_ASSET_TX_TYPES.length
                        }
                        onClick={() =>
                            setFilters((p) => ({
                                ...p,
                                types: ALL_ASSET_TX_TYPES,
                            }))
                        }
                    >
                        {T("cf_all_types")}
                    </FilterChip>
                    {ALL_ASSET_TX_TYPES.map((type) => (
                        <FilterChip
                            key={type}
                            active={
                                filters.types.includes(type) &&
                                filters.types.length < ALL_ASSET_TX_TYPES.length
                            }
                            onClick={() => toggleType(type)}
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
                            active={filters.verified === val}
                            onClick={() =>
                                setFilters((p) => ({ ...p, verified: val }))
                            }
                        >
                            {label}
                        </FilterChip>
                    ))}
                </SheetSection>

                <div style={{ marginBottom: 18 }}>
                    <Label style={{ marginBottom: 8, display: "block" }}>
                        {T("period_label")}
                    </Label>
                    <div style={{ marginBottom: 10 }}>
                        <FilterChip
                            active={!filters.date_from}
                            onClick={() =>
                                setFilters((p) => ({
                                    ...p,
                                    date_from: "",
                                    date_to: "",
                                }))
                            }
                        >
                            {T("time_all")}
                        </FilterChip>
                    </div>
                    <MonthPicker
                        month={
                            filters.date_from
                                ? new Date(filters.date_from).getMonth() + 1
                                : new Date().getMonth() + 1
                        }
                        year={
                            filters.date_from
                                ? new Date(filters.date_from).getFullYear()
                                : new Date().getFullYear()
                        }
                        viewMode={periodMode}
                        onChange={({ month, year }) => {
                            if (month) {
                                const from = `${year}-${String(month).padStart(2, "0")}-01`;
                                const lastDay = new Date(
                                    year,
                                    month,
                                    0,
                                ).getDate();
                                const to = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
                                setFilters((p) => ({
                                    ...p,
                                    date_from: from,
                                    date_to: to,
                                }));
                            } else {
                                setFilters((p) => ({
                                    ...p,
                                    date_from: `${year}-01-01`,
                                    date_to: `${year}-12-31`,
                                }));
                            }
                        }}
                        onViewModeChange={setPeriodMode}
                    />
                </div>

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
                            active={(filters.ordering || "-date") === val}
                            onClick={() =>
                                setFilters((p) => ({ ...p, ordering: val }))
                            }
                        >
                            {label}
                        </FilterChip>
                    ))}
                </SheetSection>

                <div
                    style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 8,
                        marginTop: 4,
                    }}
                >
                    <button className="btn btn-g pressable" onClick={reset}>
                        {T("cf_filters_reset", "Reset")}
                    </button>
                    <button className="btn btn-p pressable" onClick={onClose}>
                        {T("btn_close", "OK")}
                    </button>
                </div>
            </div>
        </BottomSheet>
    );
}
