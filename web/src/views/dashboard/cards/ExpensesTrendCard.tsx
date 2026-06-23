"use client";

import { BarTrendChart } from "../../../components/Charts";
import { Card, SegmentedControl } from "../../../components/ui";
import { EmptyCardText, SectionLabel } from "./DashboardCardPrimitives";
import type { Dispatch, SetStateAction } from "react";
import type { Translator } from "../../../types";

type TrendDirection = "expense" | "income";
type TrendPoint = { month: string; value: number };
type ExpensesTrendCardProps = {
    trendDir: TrendDirection;
    setTrendDir: Dispatch<SetStateAction<TrendDirection>>;
    monthlyTrend: TrendPoint[];
    monthlyIncomeTrend: TrendPoint[];
    T: Translator;
};

export function ExpensesTrendCard({
    trendDir,
    setTrendDir,
    monthlyTrend,
    monthlyIncomeTrend,
    T,
}: ExpensesTrendCardProps) {
    const isIncome = trendDir === "income";
    const data = isIncome ? monthlyIncomeTrend : monthlyTrend;

    return (
        <Card>
            <div
                className="between"
                style={{ marginBottom: 12, flexWrap: "wrap", gap: 8 }}
            >
                <SectionLabel>
                    {isIncome
                        ? T("dash_income_trend")
                        : T("dash_expenses_trend")}
                </SectionLabel>
                <SegmentedControl
                    options={[
                        { value: "expense", label: T("cf_outcome") },
                        { value: "income", label: T("cf_income") },
                    ]}
                    value={trendDir}
                    onChange={(direction) => {
                        if (direction === "expense" || direction === "income") {
                            setTrendDir(direction);
                        }
                    }}
                />
            </div>
            {data.length > 0 ? (
                <BarTrendChart
                    data={data}
                    height={140}
                    color={isIncome ? "var(--chart-2)" : "var(--chart-1)"}
                />
            ) : (
                <EmptyCardText>No data</EmptyCardText>
            )}
        </Card>
    );
}
