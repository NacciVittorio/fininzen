"use client";

import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
import type { Category } from "../../../api/types";
import type { ExpenseSummaryResponse } from "../../../api/expenses";
import type { AppContextValue } from "../../../context/AppContext";
import type { NumericValue, Translator } from "../../../types";
import { PieChart } from "../../../components/Charts";
import CategoryDeepDiveSheet from "../../../components/CategoryDeepDiveSheet";
import {
    CategoryDot,
    Card,
    Icon,
    MonthPager,
    SegmentedControl,
} from "../../../components/ui";
import {
    accountingMonthDateRange,
    accountingMonthDisplay,
    currentAccountingMonth,
} from "../../../context/appContextHelpers";
import {
    buildCategoryRollup,
    type CategoryRollupParent,
} from "../../../context/derivedDataModel";
import type { CashflowItemType } from "../../../context/feedTypes";
import { EmptyCardText, SectionLabel } from "./DashboardCardPrimitives";

type CashflowDirection = "expense" | "income";
type DonutRow = {
    name: string;
    total: number;
    color: string;
    catId: number | string | null;
    hasChildren: boolean;
    parent: CategoryRollupParent | null;
};

// The chart palette exposes only 5 hued tokens (--chart-6 is a neutral grey),
// so with more categories than that we cycle the five and, from the second lap
// on, desaturate each toward the card background so repeats stay distinguishable
// instead of resolving to an undefined var() (black fill).
const CHART_FALLBACKS = [
    "var(--chart-1)",
    "var(--chart-2)",
    "var(--chart-3)",
    "var(--chart-4)",
    "var(--chart-5)",
];
function fallbackColor(i: number): string {
    const base =
        CHART_FALLBACKS[i % CHART_FALLBACKS.length] ?? "var(--chart-1)";
    const lap = Math.floor(i / CHART_FALLBACKS.length);
    return lap === 0
        ? base
        : `color-mix(in oklab, ${base} ${Math.max(35, 100 - lap * 25)}%, var(--card))`;
}
type CashflowCategoryCardProps = {
    expSummary: ExpenseSummaryResponse | null;
    categories: Category[];
    cardCashflowDir: CashflowDirection;
    setCardCashflowDir: Dispatch<SetStateAction<CashflowDirection>>;
    filterMonth: number;
    filterYear: number;
    accountingMonthStartDay: number;
    setFilterMonth: AppContextValue["setFilterMonth"];
    setFilterYear: AppContextValue["setFilterYear"];
    setCfFilters: AppContextValue["setCfFilters"];
    setTab: AppContextValue["setTab"];
    pieHover: number | null;
    setPieHover: AppContextValue["setPieHover"];
    T: Translator;
    formatEur: (value: NumericValue) => string;
};

export function CashflowCategoryCard({
    expSummary,
    categories,
    cardCashflowDir,
    setCardCashflowDir,
    filterMonth,
    filterYear,
    accountingMonthStartDay,
    setFilterMonth,
    setFilterYear,
    setCfFilters,
    setTab,
    pieHover,
    setPieHover,
    T,
    formatEur,
}: CashflowCategoryCardProps) {
    // Roll the flat by_category summary up to top-level parents (see
    // buildCategoryRollup); the card lists parents by default and each parent
    // carries its child breakdown for the deep-dive sheet.
    const parentRows = useMemo(
        () =>
            buildCategoryRollup(
                expSummary?.by_category ?? [],
                categories,
                cardCashflowDir,
                T("cat_general"),
            ),
        [expSummary, categories, cardCashflowDir, T],
    );

    const donutRows = useMemo<DonutRow[]>(
        () =>
            // Every parent category gets its own slice/row (parentRows is already
            // sorted desc by total) — no top-N cap, no aggregated "Other" bucket.
            parentRows.map((p, i) => ({
                name: p.name,
                total: p.total,
                // Fall back to the cycling chart palette when the category has no
                // color of its own.
                color:
                    p.color && p.color !== "var(--fg-faint)"
                        ? p.color
                        : fallbackColor(i),
                catId: p.catId,
                hasChildren: p.hasChildren,
                parent: p,
            })),
        [parentRows],
    );
    const donutTotal = donutRows.reduce((sum, r) => sum + r.total, 0);

    // The pager's "can't go past the current month" boundary must follow the
    // accounting month (not the calendar month) so it matches the summary window.
    const currentAccounting = currentAccountingMonth(accountingMonthStartDay);

    // Parent whose child breakdown is open in the deep-dive sheet (null = closed).
    const [deepDiveParent, setDeepDiveParent] =
        useState<CategoryRollupParent | null>(null);
    const displayMonth = accountingMonthDisplay(
        filterYear,
        filterMonth,
        accountingMonthStartDay,
    );
    const monthLabel = `${T(`month_${displayMonth.month}`)} ${displayMonth.year}`;

    // Drill down: open the Cash Flow feed pre-filtered to this category for the
    // month the card is currently showing. The feed is driven by cfFilters
    // (date range + category), so set that — filterCat is not wired to the list.
    const openCategoryInCashflow = (catId: number | string | null) => {
        const { from, to } = accountingMonthDateRange(
            filterYear,
            filterMonth,
            accountingMonthStartDay,
        );
        const types: CashflowItemType[] =
            cardCashflowDir === "income" ? ["income"] : ["outcome"];
        setCfFilters((prev) => ({
            ...prev,
            category_ids: catId ? [catId] : [],
            date_from: from,
            date_to: to,
            types,
        }));
        setTab("expenses");
    };

    return (
        <>
            <Card>
                <div
                    className="between"
                    style={{ marginBottom: 12, flexWrap: "wrap", gap: 8 }}
                >
                    <SectionLabel>{T("cash_flow_category")}</SectionLabel>
                    <MonthPager
                        month={filterMonth}
                        year={filterYear}
                        onChange={({ month, year }) => {
                            setFilterMonth(month);
                            setFilterYear(year);
                        }}
                        disableForward={
                            filterYear === currentAccounting.year &&
                            filterMonth >= currentAccounting.month
                        }
                        minWidth={110}
                        labelMode="accounting"
                    />
                </div>
                <div style={{ marginBottom: 14, display: "flex" }}>
                    <SegmentedControl
                        options={[
                            { value: "expense", label: T("cf_outcome") },
                            { value: "income", label: T("cf_income") },
                        ]}
                        value={cardCashflowDir}
                        onChange={(direction) => {
                            if (
                                direction === "expense" ||
                                direction === "income"
                            ) {
                                setCardCashflowDir(direction);
                            }
                        }}
                    />
                </div>
                {donutRows.length > 0 ? (
                    <div
                        className="mob-col mob-wrap"
                        style={{
                            display: "flex",
                            gap: 20,
                            alignItems: "center",
                            flexWrap: "wrap",
                            justifyContent: "center",
                            // centers within the stretched desktop card; 0 in block flow
                            marginBlock: "auto",
                        }}
                    >
                        <PieChart
                            data={donutRows.map((r, i) => ({
                                // Stable, unique slice key (two categories can share a
                                // name); also the handle onSliceClick resolves back to
                                // its row below.
                                category__id: r.catId ?? `cat-${i}`,
                                total: r.total,
                                category__color: r.color,
                                category__name: r.name,
                            }))}
                            size={200}
                            hoveredIndex={pieHover}
                            onHoverChange={setPieHover}
                            tLabel={T("total_label") || "total"}
                            tPctOfTotal={T("pct_of_total")}
                            onSliceClick={(slice) => {
                                // Match on the id we set above — robust when two
                                // categories share a display name.
                                const row = donutRows.find(
                                    (r, i) =>
                                        (r.catId ?? `cat-${i}`) ===
                                        slice.category__id,
                                );
                                if (!row) return;
                                openCategoryInCashflow(row.catId);
                            }}
                        />
                        <div
                            style={{
                                flex: "1 1 260px",
                                minWidth: 0,
                                width: "100%",
                                // Cap the list height so a long category list scrolls
                                // inside the card instead of stretching the dashboard
                                // grid row; contain the scroll to this pane.
                                maxHeight: 340,
                                overflowY: "auto",
                                overscrollBehavior: "contain",
                            }}
                        >
                            {donutRows.map((r, i) => {
                                const isActive = pieHover === i;
                                const isIncome = cardCashflowDir === "income";
                                const pct =
                                    donutTotal > 0
                                        ? (r.total / donutTotal) * 100
                                        : 0;
                                return (
                                    <div
                                        key={r.catId ?? `cat-${i}`}
                                        className="between"
                                        onMouseEnter={() => setPieHover(i)}
                                        onMouseLeave={() => setPieHover(null)}
                                        onClick={() =>
                                            openCategoryInCashflow(r.catId)
                                        }
                                        style={{
                                            width: "100%",
                                            padding: "9px 2px",
                                            borderBottom:
                                                i < donutRows.length - 1
                                                    ? "1px solid var(--rule)"
                                                    : "none",
                                            cursor: "pointer",
                                            opacity:
                                                pieHover !== null && !isActive
                                                    ? 0.45
                                                    : 1,
                                            transition: "opacity 0.15s",
                                        }}
                                    >
                                        <div
                                            className="row"
                                            style={{
                                                alignItems: "center",
                                                gap: 8,
                                                minWidth: 0,
                                            }}
                                        >
                                            <CategoryDot color={r.color} />
                                            <span
                                                style={{
                                                    fontSize: 13,
                                                    whiteSpace: "nowrap",
                                                    overflow: "hidden",
                                                    textOverflow: "ellipsis",
                                                }}
                                            >
                                                {r.name}
                                            </span>
                                        </div>
                                        <div
                                            style={{
                                                display: "flex",
                                                alignItems: "center",
                                                gap: 10,
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
                                                {pct.toFixed(1)}%
                                            </span>
                                            <span
                                                className="num"
                                                style={{
                                                    fontSize: 13,
                                                    fontWeight: 600,
                                                    color: isIncome
                                                        ? "var(--success)"
                                                        : "var(--danger)",
                                                }}
                                            >
                                                {isIncome ? "+" : "-"}
                                                {formatEur(r.total)}
                                            </span>
                                            {/* Fixed-width slot so amounts stay
                                                column-aligned whether or not a
                                                row has a drill-down chevron. */}
                                            <span
                                                style={{
                                                    width: 16,
                                                    display: "inline-flex",
                                                    justifyContent: "flex-end",
                                                    flexShrink: 0,
                                                }}
                                            >
                                                {r.hasChildren && (
                                                    <button
                                                        type="button"
                                                        aria-label={T(
                                                            "cf_category_breakdown",
                                                        )}
                                                        onClick={(e) => {
                                                            // Don't also trigger the row's
                                                            // navigate-to-cashflow handler.
                                                            e.stopPropagation();
                                                            setDeepDiveParent(
                                                                r.parent,
                                                            );
                                                        }}
                                                        style={{
                                                            display:
                                                                "inline-flex",
                                                            alignItems:
                                                                "center",
                                                            justifyContent:
                                                                "center",
                                                            padding: 2,
                                                            border: "none",
                                                            background:
                                                                "transparent",
                                                            color: "var(--fg-soft)",
                                                            cursor: "pointer",
                                                            lineHeight: 0,
                                                        }}
                                                    >
                                                        <span
                                                            style={{
                                                                display:
                                                                    "inline-flex",
                                                                transform:
                                                                    "rotate(-90deg)",
                                                            }}
                                                        >
                                                            <Icon
                                                                name="chevronDown"
                                                                size={14}
                                                            />
                                                        </span>
                                                    </button>
                                                )}
                                            </span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ) : (
                    <EmptyCardText>
                        {cardCashflowDir === "income"
                            ? T("no_income_month")
                            : T("no_expenses_month")}
                    </EmptyCardText>
                )}
            </Card>
            <CategoryDeepDiveSheet
                open={deepDiveParent !== null}
                onClose={() => setDeepDiveParent(null)}
                parent={deepDiveParent}
                monthLabel={monthLabel}
                dir={cardCashflowDir}
                formatEur={formatEur}
                T={T}
                onChildClick={(catId) => {
                    openCategoryInCashflow(catId);
                    setDeepDiveParent(null);
                }}
                onViewAll={() => {
                    openCategoryInCashflow(deepDiveParent?.catId ?? null);
                    setDeepDiveParent(null);
                }}
            />
        </>
    );
}
