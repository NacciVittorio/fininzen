import { useMemo, type Dispatch, type SetStateAction } from "react";
import type { Category } from "../../../api/types";
import type { ExpenseSummaryResponse } from "../../../api/expenses";
import type { AppContextValue } from "../../../context/AppContext";
import type { NumericValue, Translator } from "../../../types";
import { PieChart } from "../../../components/Charts";
import {
    CategoryDot,
    Card,
    MonthPager,
    SegmentedControl,
} from "../../../components/ui";
import { currentMonth, currentYear } from "../../../utils/formatters";
import { EmptyCardText, SectionLabel } from "./DashboardCardPrimitives";

type CashflowDirection = "expense" | "income";
type CashflowCategoryCardProps = {
    expSummary: ExpenseSummaryResponse | null;
    categories: Category[];
    cardCashflowDir: CashflowDirection;
    setCardCashflowDir: Dispatch<SetStateAction<CashflowDirection>>;
    filterMonth: number;
    filterYear: number;
    setFilterMonth: AppContextValue["setFilterMonth"];
    setFilterYear: AppContextValue["setFilterYear"];
    setFilterCat: AppContextValue["setFilterCat"];
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
    setFilterMonth,
    setFilterYear,
    setFilterCat,
    setTab,
    pieHover,
    setPieHover,
    T,
    formatEur,
}: CashflowCategoryCardProps) {
    const cardCashflowRows = useMemo(() => {
        const rows = expSummary?.by_category || [];
        if (cardCashflowDir === "income") {
            return rows.filter((c) => c.category__category_type === "income");
        }
        return rows.filter(
            (c) =>
                !c.category__category_type ||
                c.category__category_type === "expense",
        );
    }, [expSummary, cardCashflowDir]);

    const donutRows = useMemo(() => {
        const sorted = [...cardCashflowRows].sort(
            (a, b) => Number(b.total || 0) - Number(a.total || 0),
        );
        const top = sorted.slice(0, 5).map((c, i) => ({
            name: c.category__name || "—",
            total: Number(c.total || 0),
            color: c.category__color || `var(--chart-${i + 1})`,
            catId:
                categories.find(
                    (cat) => cat.id && cat.name === c.category__name,
                )?.id ?? null,
            isOther: false,
        }));
        const rest = sorted.slice(5);
        if (rest.length > 0) {
            top.push({
                name: T("dash_other"),
                total: rest.reduce((sum, c) => sum + Number(c.total || 0), 0),
                color: "var(--chart-6)",
                catId: null,
                isOther: true,
            });
        }
        return top;
    }, [cardCashflowRows, categories, T]);
    const donutTotal = donutRows.reduce((sum, r) => sum + r.total, 0);

    return (
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
                        filterYear === currentYear &&
                        filterMonth >= currentMonth
                    }
                    minWidth={110}
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
                        if (direction === "expense" || direction === "income") {
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
                    }}
                >
                    <PieChart
                        data={donutRows.map((r) => ({
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
                            const row = donutRows.find(
                                (r) => r.name === slice.category__name,
                            );
                            if (!row || row.isOther) return;
                            if (row.catId) setFilterCat([String(row.catId)]);
                            setTab("expenses");
                        }}
                    />
                    <div
                        style={{
                            flex: "1 1 260px",
                            minWidth: 0,
                            width: "100%",
                        }}
                    >
                        {donutRows.map((r, i) => {
                            const isActive = pieHover === i;
                            const isIncome = cardCashflowDir === "income";
                            const pct =
                                donutTotal > 0
                                    ? (r.total / donutTotal) * 100
                                    : 0;
                            const clickable = !r.isOther;
                            return (
                                <div
                                    key={i}
                                    className="between"
                                    onMouseEnter={() => setPieHover(i)}
                                    onMouseLeave={() => setPieHover(null)}
                                    onClick={
                                        clickable
                                            ? () => {
                                                  if (r.catId)
                                                      setFilterCat([
                                                          String(r.catId),
                                                      ]);
                                                  setTab("expenses");
                                              }
                                            : undefined
                                    }
                                    style={{
                                        width: "100%",
                                        padding: "9px 2px",
                                        borderBottom:
                                            i < donutRows.length - 1
                                                ? "1px solid var(--rule)"
                                                : "none",
                                        cursor: clickable
                                            ? "pointer"
                                            : "default",
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
    );
}
