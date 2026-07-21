"use client";

import { useState } from "react";
import type { NumericValue, Translator } from "../types";
import type { CategoryRollupParent } from "../context/derivedDataModel";
import { PieChart } from "./Charts";
import { BottomSheet, CategoryDot, SheetTitle } from "./ui";

type FormatEur = (value: NumericValue) => string;

// Drill-down sheet: breaks a single top-level (parent) Cash Flow category into
// its child categories for the current accounting month. Mirrors the layout of
// InvestmentDeepDiveSheet (BottomSheet + SheetTitle + donut + per-row list).
// Tapping a child opens the Cash Flow feed filtered to that child; the footer
// filters by the whole parent subtree.
type CategoryDeepDiveSheetProps = {
    open: boolean;
    onClose: () => void;
    parent: CategoryRollupParent | null;
    monthLabel: string;
    dir: "expense" | "income";
    formatEur: FormatEur;
    T: Translator;
    onChildClick: (catId: number | string | null) => void;
    onViewAll: () => void;
};

export default function CategoryDeepDiveSheet({
    open,
    onClose,
    parent,
    monthLabel,
    dir,
    formatEur,
    T,
    onChildClick,
    onViewAll,
}: CategoryDeepDiveSheetProps) {
    // Local hover state — not the shared context `pieHover`, which drives the
    // card's own donut behind this sheet.
    const [hover, setHover] = useState<number | null>(null);

    const isIncome = dir === "income";
    const children = parent?.children ?? [];
    const total = children.reduce((sum, c) => sum + c.total, 0);

    return (
        <BottomSheet
            open={open}
            onClose={onClose}
            ariaLabel={parent?.name ?? T("cash_flow_category")}
        >
            <div style={{ padding: "8px 18px 18px" }}>
                <SheetTitle>
                    {parent ? `${parent.name} · ${monthLabel}` : monthLabel}
                </SheetTitle>

                {parent && children.length > 0 ? (
                    <>
                        <div
                            style={{
                                display: "flex",
                                justifyContent: "center",
                                marginBottom: 8,
                            }}
                        >
                            <PieChart
                                data={children.map((c, i) => ({
                                    category__id: c.isGeneral
                                        ? "__general__"
                                        : (c.catId ?? `child-${i}`),
                                    total: c.total,
                                    category__color: c.color,
                                    category__name: c.name,
                                }))}
                                size={180}
                                hoveredIndex={hover}
                                onHoverChange={setHover}
                                tLabel={T("total_label") || "total"}
                                tPctOfTotal={T("pct_of_total")}
                            />
                        </div>
                        <div>
                            {children.map((c, i) => {
                                const isActive = hover === i;
                                const pct =
                                    total > 0 ? (c.total / total) * 100 : 0;
                                return (
                                    <div
                                        key={
                                            c.isGeneral
                                                ? "__general__"
                                                : (c.catId ?? `child-${i}`)
                                        }
                                        className="between"
                                        onMouseEnter={() => setHover(i)}
                                        onMouseLeave={() => setHover(null)}
                                        onClick={() => onChildClick(c.catId)}
                                        style={{
                                            width: "100%",
                                            padding: "9px 2px",
                                            borderBottom:
                                                i < children.length - 1
                                                    ? "1px solid var(--rule)"
                                                    : "none",
                                            cursor: "pointer",
                                            opacity:
                                                hover !== null && !isActive
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
                                            <CategoryDot color={c.color} />
                                            <span
                                                style={{
                                                    fontSize: 13,
                                                    whiteSpace: "nowrap",
                                                    overflow: "hidden",
                                                    textOverflow: "ellipsis",
                                                }}
                                            >
                                                {c.name}
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
                                                {formatEur(c.total)}
                                            </span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                        <button
                            type="button"
                            onClick={onViewAll}
                            style={{
                                marginTop: 16,
                                width: "100%",
                                padding: "11px 12px",
                                borderRadius: 10,
                                border: "1px solid var(--rule)",
                                background: "transparent",
                                color: "var(--fg)",
                                fontSize: 13,
                                fontWeight: 600,
                                cursor: "pointer",
                            }}
                        >
                            {T("cf_view_all_in_cashflow")}
                        </button>
                    </>
                ) : (
                    <div
                        style={{
                            textAlign: "center",
                            color: "var(--fg-faint)",
                            fontSize: 13,
                            padding: "24px 0",
                        }}
                    >
                        {isIncome
                            ? T("no_income_month")
                            : T("no_expenses_month")}
                    </div>
                )}
            </div>
        </BottomSheet>
    );
}
