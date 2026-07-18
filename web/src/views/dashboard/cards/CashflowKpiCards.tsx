"use client";

import { KpiCard, KpiStrip } from "../../../components/ui";
import type { NumericValue, Translator } from "../../../types";

type CashflowKpiCardsProps = {
    kpiData: {
        monthlyInc: NumericValue;
        monthlyExp: NumericValue;
    };
    T: Translator;
    formatEur: (value: NumericValue) => string;
};

// The dashboard hero is net worth, so spending needs its own prominent number
// here: on mobile a full-width "spent this month" card leads, with income,
// month balance and savings rate as a supporting compact strip beneath it.
// On wide desktop (≥1200) the strip dissolves and all four render as one
// uniform 4-up row (see .cash-kpis in styles.css).
export function CashflowKpiCards({
    kpiData,
    T,
    formatEur,
}: CashflowKpiCardsProps) {
    const inc = Number(kpiData.monthlyInc || 0);
    const exp = Number(kpiData.monthlyExp || 0);
    const balance = inc - exp;
    const savingsRate = inc > 0 ? (balance / inc) * 100 : null;

    return (
        <div className="cash-kpis">
            <KpiCard
                label={T("kpi_spent_this_month")}
                tone="danger"
                value={<span className="num">{formatEur(exp)}</span>}
            />
            <KpiStrip columns={3}>
                <KpiCard
                    compact
                    label={T("kpi_monthly_income")}
                    tone="positive"
                    value={<span className="num">{formatEur(inc)}</span>}
                />
                <KpiCard
                    compact
                    label={T("kpi_month_balance")}
                    tone={balance >= 0 ? "positive" : "danger"}
                    value={
                        <span className="num">
                            {balance >= 0 ? "+" : ""}
                            {formatEur(balance)}
                        </span>
                    }
                />
                <KpiCard
                    compact
                    label={T("kpi_savings_rate")}
                    tone={
                        savingsRate == null
                            ? "neutral"
                            : savingsRate >= 0
                              ? "positive"
                              : "danger"
                    }
                    value={
                        <span className="num">
                            {savingsRate == null
                                ? "—"
                                : `${savingsRate.toFixed(1)}%`}
                        </span>
                    }
                />
            </KpiStrip>
        </div>
    );
}
