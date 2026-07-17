"use client";

import type { ComponentProps, ReactNode } from "react";
import InvSummaryCard from "../../components/portfolio/InvSummaryCard";
import PrivacyValue from "../../components/PrivacyValue";
import {
    Icon,
    LargeTitleHeader,
    Pill,
    PullToRefresh,
} from "../../components/ui";
import type { NumericValue, Translator } from "../../types";
import AllocationTargetsPanel from "./AllocationTargetsPanel";
import AssetTransactionsSection from "./AssetTransactionsSection";
import InvestmentAssetGroups from "./InvestmentAssetGroups";

// Like PortfolioOverlays, this is a pass-through composite: it forwards one
// props bag to the typed section components. Its props are the intersection of
// those sections' props plus the values it reads directly for the header/KPIs.
type PortfolioContentProps = ComponentProps<typeof InvestmentAssetGroups> &
    ComponentProps<typeof AllocationTargetsPanel> &
    ComponentProps<typeof AssetTransactionsSection> & {
        T: Translator;
        masked: (
            scope: string,
            value: string,
            revealControl?: boolean,
        ) => ReactNode;
        formatEur: (value: NumericValue) => string;
        totalValue: number;
        totalGain: number;
        totalGainPct: number;
        refreshPrices: () => void;
        refreshing: boolean;
        refreshMsg?: string | null;
        monthlyInvestmentStats: ComponentProps<typeof InvSummaryCard>["stats"];
        invStatsMonth: number;
        invStatsYear: number;
        setInvStatsMonth: (month: number) => void;
        setInvStatsYear: (year: number) => void;
        handlePullRefresh: ComponentProps<typeof PullToRefresh>["onRefresh"];
    };

export default function PortfolioContent(props: PortfolioContentProps) {
    const {
        T,
        masked,
        formatEur,
        totalValue,
        totalGain,
        totalGainPct,
        refreshPrices,
        refreshing,
        refreshMsg,
        monthlyInvestmentStats,
        invStatsMonth,
        invStatsYear,
        setInvStatsMonth,
        setInvStatsYear,
        handlePullRefresh,
    } = props;

    // Mirrors AllocationTargetsPanel's own render guard: when the panel is
    // null, the summary card takes the full grid row instead of leaving an
    // empty half beside it on desktop.
    const hasAllocationTargets = props.allocationData.some(
        (row) => row.target_pct !== null,
    );

    return (
        <PullToRefresh onRefresh={handlePullRefresh}>
            <div>
                <LargeTitleHeader
                    eyebrow={T("tab_investments")}
                    title={
                        <span className="app-net-worth hero-number">
                            {masked("total_value", formatEur(totalValue), true)}
                        </span>
                    }
                    compactTitle={T("tab_investments")}
                    compactValue={masked("total_value", formatEur(totalValue))}
                    actions={
                        <>
                            {totalValue > 0 && (
                                <Pill
                                    tone={totalGain >= 0 ? "success" : "danger"}
                                >
                                    <PrivacyValue
                                        scope="investments"
                                        field="total_gain"
                                    >
                                        <span className="num">
                                            {`${totalGain >= 0 ? "+" : ""}${formatEur(totalGain)} · ${totalGainPct >= 0 ? "+" : ""}${totalGainPct.toFixed(2)}%`}
                                        </span>
                                    </PrivacyValue>
                                </Pill>
                            )}
                            <button
                                className="btn btn-ghost pressable"
                                style={{
                                    whiteSpace: "nowrap",
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: 8,
                                }}
                                onClick={refreshPrices}
                                disabled={refreshing}
                            >
                                <Icon name="refresh" size={16} />
                                {refreshing
                                    ? T("refreshing")
                                    : T("refresh_prices")}
                            </button>
                        </>
                    }
                />
                {refreshMsg && (
                    <div
                        style={{
                            fontSize: 12,
                            color: "var(--success)",
                            marginBottom: 10,
                            padding: "6px 12px",
                            background: "var(--success-soft)",
                            borderRadius: 8,
                            border: "1px solid var(--success-soft)",
                        }}
                    >
                        ✓ {refreshMsg}
                    </div>
                )}
                {/* On the ≥1200px grid, dense flow pulls the allocation panel
                    (cell b) up beside the summary; DOM order stays the mobile
                    stacking order. */}
                <div className="pf-grid">
                    <div
                        className={
                            hasAllocationTargets
                                ? "pf-cell--a"
                                : "pf-cell--full"
                        }
                    >
                        <InvSummaryCard
                            stats={monthlyInvestmentStats}
                            month={invStatsMonth}
                            year={invStatsYear}
                            onChangeMonth={({ month, year }) => {
                                setInvStatsMonth(month);
                                setInvStatsYear(year);
                            }}
                        />
                    </div>
                    <div className="pf-cell--full">
                        <InvestmentAssetGroups {...props} />
                    </div>
                    {hasAllocationTargets && (
                        <div className="pf-cell--b">
                            <AllocationTargetsPanel {...props} />
                        </div>
                    )}
                    <div className="pf-cell--full">
                        <AssetTransactionsSection {...props} />
                    </div>
                </div>
            </div>
        </PullToRefresh>
    );
}
