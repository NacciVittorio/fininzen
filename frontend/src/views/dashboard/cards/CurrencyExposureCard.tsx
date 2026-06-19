import { PieChart } from "../../../components/Charts";
import { Card, CategoryDot } from "../../../components/ui";
import { EmptyCardText, SectionLabel } from "./DashboardCardPrimitives";
import type { PortfolioCurrencySummary } from "../../../api/portfolio";
import type { NumericValue, Translator } from "../../../types";

type CurrencyExposureCardProps = {
    rows: PortfolioCurrencySummary[];
    T: Translator;
    formatEur: (value: NumericValue) => string;
};

export function CurrencyExposureCard({
    rows,
    T,
    formatEur,
}: CurrencyExposureCardProps) {
    const colorFor = (i: number) => `var(--chart-${(i % 6) + 1})`;

    return (
        <Card>
            <SectionLabel>{T("dash_currency_exposure")}</SectionLabel>
            {rows.length > 0 ? (
                <div
                    className="mob-col mob-wrap"
                    style={{
                        display: "flex",
                        gap: 20,
                        alignItems: "center",
                        flexWrap: "wrap",
                        marginTop: 12,
                    }}
                >
                    <PieChart
                        data={rows.map((r, i) => ({
                            total: Number(r.total_eur || 0),
                            category__color: colorFor(i),
                            category__name: r.currency,
                        }))}
                        size={200}
                        tLabel={T("dash_currency_exposure")}
                        tPctOfTotal="%"
                    />
                    <div style={{ flex: 1, minWidth: 240 }}>
                        {rows.map((r, i) => (
                            <div
                                key={r.currency}
                                style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    alignItems: "center",
                                    padding: "8px 0",
                                    borderBottom:
                                        i < rows.length - 1
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
                                    <CategoryDot color={colorFor(i)} />
                                    <span
                                        style={{
                                            fontSize: 13,
                                            whiteSpace: "nowrap",
                                        }}
                                    >
                                        {r.currency}
                                    </span>
                                </div>
                                <div
                                    style={{
                                        display: "flex",
                                        gap: 10,
                                        alignItems: "center",
                                        flexShrink: 0,
                                    }}
                                >
                                    <span
                                        className="num"
                                        style={{
                                            fontSize: 12,
                                            color: "var(--fg-soft)",
                                        }}
                                    >
                                        {formatEur(r.total_eur)}
                                    </span>
                                    <span
                                        className="num"
                                        style={{
                                            fontSize: 12,
                                            fontWeight: 600,
                                            color: "var(--fg)",
                                            minWidth: 52,
                                            textAlign: "right",
                                        }}
                                    >
                                        {(r.percent || 0).toFixed(1)}%
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            ) : (
                <EmptyCardText>{T("no_data")}</EmptyCardText>
            )}
        </Card>
    );
}
