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

export function CashflowKpiCards({
    kpiData,
    T,
    formatEur,
}: CashflowKpiCardsProps) {
    const inc = Number(kpiData.monthlyInc || 0);
    const exp = Number(kpiData.monthlyExp || 0);
    const balance = inc - exp;

    return (
        <KpiStrip columns={3}>
            <KpiCard
                compact
                label={T("kpi_monthly_income")}
                tone="positive"
                value={<span className="num">{formatEur(inc)}</span>}
            />
            <KpiCard
                compact
                label={T("monthly_expenses")}
                tone="danger"
                value={<span className="num">{formatEur(exp)}</span>}
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
    );
}
