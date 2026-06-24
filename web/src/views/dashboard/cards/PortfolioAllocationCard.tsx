"use client";

import { BarRow, PieChart } from "../../../components/Charts";
import type { Dispatch, SetStateAction } from "react";
import type { Asset } from "../../../api/types";
import type {
    PortfolioSummaryResponse,
    PortfolioTypeSummary,
} from "../../../api/portfolio";
import type { NumericValue, Translator } from "../../../types";
import {
    Card,
    CategoryDot,
    Pill,
    SegmentedControl,
} from "../../../components/ui";
import {
    groupRows,
    type AllocationGroup,
    type GroupedRow,
} from "../../../utils/allocationGroups";
import { EmptyCardText, SectionLabel } from "./DashboardCardPrimitives";

type AllocationChartType = "bar" | "pie";
type DeepDiveType = number | string | null;
type PortfolioAllocationCardProps = {
    s: PortfolioSummaryResponse;
    kpiData: { returnRate: NumericValue };
    allocGroup: AllocationGroup;
    setAllocGroup: Dispatch<SetStateAction<AllocationGroup>>;
    allocChartType: AllocationChartType;
    setAllocChartType: Dispatch<SetStateAction<AllocationChartType>>;
    allocationDeepDiveAssets: Asset[];
    setDeepDiveType: Dispatch<SetStateAction<DeepDiveType>>;
    T: Translator;
};

export function PortfolioAllocationCard({
    s,
    kpiData,
    allocGroup,
    setAllocGroup,
    allocChartType,
    setAllocChartType,
    allocationDeepDiveAssets,
    setDeepDiveType,
    T,
}: PortfolioAllocationCardProps) {
    const rr = kpiData.returnRate;
    const rrNum = Number(rr || 0);
    const grouped = groupRows(s.by_type || [], {
        group: allocGroup,
        getIsBank: (t) => t.is_bank_account,
        getValue: (t) => Number(t.total_current || 0),
    });
    const groupTotal = grouped.reduce((sum, g) => sum + g.value, 0);

    return (
        <Card>
            <div
                className="between"
                style={{ marginBottom: 12, flexWrap: "wrap", gap: 8 }}
            >
                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        flexWrap: "wrap",
                    }}
                >
                    <SectionLabel>{T("portfolio_alloc")}</SectionLabel>
                    <Pill tone={rrNum >= 0 ? "success" : "danger"}>
                        <span className="num">
                            {rrNum >= 0 ? "+" : ""}
                            {rrNum.toFixed(1)}%
                        </span>
                        &nbsp;{T("kpi_return_rate")}
                    </Pill>
                </div>
                <SegmentedControl
                    options={[
                        { value: "bar", label: T("chart_bar") },
                        { value: "pie", label: T("chart_pie") },
                    ]}
                    value={allocChartType}
                    onChange={(chartType) => {
                        if (chartType === "bar" || chartType === "pie") {
                            setAllocChartType(chartType);
                        }
                    }}
                />
            </div>
            <div
                style={{
                    marginBottom: 16,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 10,
                    flexWrap: "wrap",
                }}
            >
                <div style={{ display: "flex", minWidth: 0 }}>
                    <SegmentedControl
                        options={[
                            { value: "all", label: T("alloc_group_all") },
                            {
                                value: "investments",
                                label: T("alloc_group_investments"),
                            },
                            {
                                value: "accounts",
                                label: T("alloc_group_accounts"),
                            },
                        ]}
                        value={allocGroup}
                        onChange={(group) => {
                            if (
                                group === "all" ||
                                group === "investments" ||
                                group === "accounts"
                            ) {
                                setAllocGroup(group);
                            }
                        }}
                    />
                </div>
                {grouped.length > 0 && allocationDeepDiveAssets.length > 0 && (
                    <button
                        className="btn btn-g btn-sm pressable"
                        style={{ fontSize: 11, flexShrink: 0 }}
                        onClick={() => setDeepDiveType("all")}
                    >
                        {T("deepdive_open")} ›
                    </button>
                )}
            </div>
            {grouped.length === 0 ? (
                <EmptyCardText>{T("no_data")}</EmptyCardText>
            ) : allocChartType === "pie" ? (
                <AllocationPie
                    grouped={grouped}
                    setDeepDiveType={setDeepDiveType}
                    T={T}
                />
            ) : (
                grouped.map(({ row: t, value: cur, pct: allocPct }, i) => {
                    const inv = Number(t.total_invested || 0);
                    const gainPct = inv ? ((cur - inv) / inv) * 100 : null;
                    return (
                        <div
                            key={i}
                            onClick={() => setDeepDiveType(t.type_id ?? "none")}
                            style={{ cursor: "pointer" }}
                        >
                            <BarRow
                                label={t.type_name || "Unknown"}
                                value={cur}
                                total={groupTotal}
                                color={t.type_color || "var(--accent)"}
                                extra={
                                    gainPct !== null
                                        ? `${gainPct >= 0 ? "+" : ""}${gainPct.toFixed(1)}%  ${allocPct.toFixed(1)}%`
                                        : `${allocPct.toFixed(1)}%`
                                }
                            />
                        </div>
                    );
                })
            )}
        </Card>
    );
}

type AllocationPieProps = {
    grouped: GroupedRow<PortfolioTypeSummary>[];
    setDeepDiveType: Dispatch<SetStateAction<DeepDiveType>>;
    T: Translator;
};

function AllocationPie({ grouped, setDeepDiveType, T }: AllocationPieProps) {
    return (
        <div
            className="mob-col mob-wrap"
            style={{
                display: "flex",
                gap: 20,
                alignItems: "flex-start",
                flexWrap: "wrap",
                justifyContent: "center",
            }}
        >
            <PieChart
                data={grouped.map(({ row: t }) => ({
                    total: t.total_current,
                    category__color: t.type_color || "var(--accent)",
                    category__name: t.type_name || "Unknown",
                }))}
                size={200}
                tLabel={T("portfolio_alloc")}
                tPctOfTotal="%"
            />
            <div style={{ flex: "1 1 260px", minWidth: 0, width: "100%" }}>
                {grouped.map(({ row: t, value: cur, pct: allocPct }, i) => {
                    const inv = Number(t.total_invested || 0);
                    const gainPct = inv ? ((cur - inv) / inv) * 100 : 0;
                    return (
                        <div
                            key={i}
                            onClick={() => setDeepDiveType(t.type_id ?? "none")}
                            style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                width: "100%",
                                padding: "8px 0",
                                cursor: "pointer",
                                borderBottom:
                                    i < grouped.length - 1
                                        ? "1px solid var(--rule)"
                                        : "none",
                            }}
                        >
                            <div
                                className="row"
                                style={{
                                    gap: 8,
                                    alignItems: "center",
                                    minWidth: 0,
                                }}
                            >
                                <CategoryDot
                                    color={t.type_color || "var(--accent)"}
                                />
                                <span
                                    style={{
                                        fontSize: 13,
                                        whiteSpace: "nowrap",
                                        overflow: "hidden",
                                        textOverflow: "ellipsis",
                                    }}
                                >
                                    {t.type_name}
                                </span>
                            </div>
                            <div
                                style={{
                                    display: "flex",
                                    gap: 10,
                                    alignItems: "center",
                                    flexShrink: 0,
                                    marginLeft: 12,
                                }}
                            >
                                <span
                                    className="num"
                                    style={{
                                        fontSize: 11,
                                        color: "var(--fg-soft)",
                                    }}
                                >
                                    {allocPct.toFixed(1)}%
                                </span>
                                <span
                                    className="num"
                                    style={{
                                        fontSize: 12,
                                        fontWeight: 600,
                                        color:
                                            gainPct >= 0
                                                ? "var(--success)"
                                                : "var(--danger)",
                                        minWidth: 52,
                                        textAlign: "right",
                                    }}
                                >
                                    {gainPct >= 0 ? "+" : ""}
                                    {gainPct.toFixed(1)}%
                                </span>
                                <span
                                    aria-hidden="true"
                                    style={{
                                        color: "var(--fg-faint)",
                                        fontSize: 15,
                                    }}
                                >
                                    ›
                                </span>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
