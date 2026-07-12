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
// here: a full-width "spent this month" card leads, with income and the month
// balance as a supporting two-up strip beneath it.
export function CashflowKpiCards({
    kpiData,
    T,
    formatEur,
}: CashflowKpiCardsProps) {
    const inc = Number(kpiData.monthlyInc || 0);
    const exp = Number(kpiData.monthlyExp || 0);
    const balance = inc - exp;

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <KpiCard
                label={T("kpi_spent_this_month")}
                tone="danger"
                value={<span className="num">{formatEur(exp)}</span>}
            />
            <KpiStrip columns={2}>
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
            </KpiStrip>
        </div>
    );
}
