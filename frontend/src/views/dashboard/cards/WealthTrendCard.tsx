import { MultiLineChart } from "../../../components/Charts";
import type { CSSProperties } from "react";
import type { InvestmentType } from "../../../api/types";
import type { PortfolioHistoryPoint } from "../../../api/portfolio";
import type { AppContextValue } from "../../../context/AppContext";
import type {
    WealthMetric,
    WealthTimeRange,
} from "../../../context/appContextHelpers";
import type { Translator } from "../../../types";
import { Card, CategoryDot, SegmentedControl } from "../../../components/ui";
import { WEALTH_RANGES, buildWealthTrendModel } from "../wealthTrendModel";
import { EmptyCardText, SectionLabel } from "./DashboardCardPrimitives";

type WealthTrendCardProps = {
    portfolioHistory: PortfolioHistoryPoint[];
    investmentTypes: InvestmentType[];
    wealthTimeRange: WealthTimeRange;
    setWealthTimeRange: AppContextValue["setWealthTimeRange"];
    wealthRangeOffset: number;
    setWealthRangeOffset: AppContextValue["setWealthRangeOffset"];
    wealthMetrics: WealthMetric[];
    toggleWealthMetric: AppContextValue["toggleWealthMetric"];
    fireGoal: number | null;
    MONTHS: string[];
    T: Translator;
};

export function WealthTrendCard({
    portfolioHistory,
    investmentTypes,
    wealthTimeRange,
    setWealthTimeRange,
    wealthRangeOffset,
    setWealthRangeOffset,
    wealthMetrics,
    toggleWealthMetric,
    fireGoal,
    MONTHS,
    T,
}: WealthTrendCardProps) {
    const {
        metrics,
        activeSeries,
        chartHasData,
        goalLineValue,
        isShortRange,
        periodLabel,
    } = buildWealthTrendModel({
        portfolioHistory,
        investmentTypes,
        wealthTimeRange,
        wealthMetrics,
        fireGoal,
        MONTHS,
        T,
    });

    const pagerBtnStyle = (disabled: boolean): CSSProperties => ({
        background: "var(--card-inset)",
        border: "1px solid var(--rule)",
        color: disabled ? "var(--fg-faint)" : "var(--fg-soft)",
        borderRadius: 999,
        width: 32,
        height: 32,
        cursor: disabled ? "not-allowed" : "pointer",
        fontSize: 14,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
    });

    return (
        <Card>
            <div style={{ marginBottom: 12 }}>
                <div
                    className="between"
                    style={{ marginBottom: 10, flexWrap: "wrap", gap: 8 }}
                >
                    <SectionLabel>{T("dash_wealth_trend")}</SectionLabel>
                    <SegmentedControl
                        options={WEALTH_RANGES}
                        value={wealthTimeRange}
                        onChange={setWealthTimeRange}
                    />
                </div>
                {!isShortRange && (
                    <div className="between" style={{ marginBottom: 8 }}>
                        <div
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 6,
                            }}
                        >
                            <button
                                onClick={() =>
                                    setWealthRangeOffset(wealthRangeOffset + 1)
                                }
                                className="touch-target pressable"
                                aria-label="Previous period"
                                style={pagerBtnStyle(false)}
                            >
                                ‹
                            </button>
                            <span
                                className="num"
                                style={{
                                    fontSize: 11,
                                    color: "var(--fg-soft)",
                                    minWidth: 160,
                                    textAlign: "center",
                                }}
                            >
                                {periodLabel || "—"}
                            </span>
                            <button
                                disabled={wealthRangeOffset === 0}
                                onClick={() =>
                                    setWealthRangeOffset(
                                        Math.max(0, wealthRangeOffset - 1),
                                    )
                                }
                                className="touch-target pressable"
                                aria-label="Next period"
                                style={pagerBtnStyle(wealthRangeOffset === 0)}
                            >
                                ›
                            </button>
                        </div>
                    </div>
                )}
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {metrics
                        .filter((m) => m.id !== "goal" || fireGoal)
                        .map((m) => {
                            const active = wealthMetrics.includes(m.id);
                            return (
                                <button
                                    key={m.id}
                                    onClick={() => toggleWealthMetric(m.id)}
                                    aria-pressed={active}
                                    className="pressable"
                                    style={{
                                        background: active
                                            ? "var(--accent-soft)"
                                            : "var(--card-inset)",
                                        border: `1px solid ${active ? "var(--accent-ring)" : "var(--rule)"}`,
                                        color: active
                                            ? "var(--fg)"
                                            : "var(--fg-soft)",
                                        borderRadius: 20,
                                        padding: "5px 12px",
                                        fontSize: 11,
                                        fontWeight: 600,
                                        cursor: "pointer",
                                        fontFamily: "inherit",
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 6,
                                    }}
                                >
                                    <CategoryDot
                                        color={
                                            active ? m.color : "var(--fg-faint)"
                                        }
                                        size={7}
                                    />
                                    {m.label}
                                </button>
                            );
                        })}
                </div>
            </div>
            {portfolioHistory.length > 1 ? (
                chartHasData ? (
                    <MultiLineChart
                        series={activeSeries}
                        height={200}
                        goalLine={goalLineValue}
                        goalLabel={T("chart_goal_label")}
                    />
                ) : (
                    <EmptyCardText>{T("wm_no_chart_data")}</EmptyCardText>
                )
            ) : (
                <EmptyCardText>
                    No data yet — refresh prices to start tracking
                </EmptyCardText>
            )}
        </Card>
    );
}
