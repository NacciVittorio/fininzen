import type { ReactNode } from "react";
import { useApp } from "../../context/useApp";
import { useFormatters } from "../../utils/useFormatters";
import type { NumericValue } from "../../types";
import PrivacyValue from "../PrivacyValue";
import MonthPager from "../ui/MonthPager";

type InvStats = {
    invested?: NumericValue;
    realized?: { gain?: NumericValue } | null;
    unrealized?: { gain?: NumericValue; gain_pct?: NumericValue } | null;
    post_tax?: { gain?: NumericValue } | null;
};

// Monthly investment summary card. Graphically mirrors CfSummaryCard (same card
// chrome, big headline number, tile row), but the data is its own: invested in
// the month, realized P&L from sells (cash only), unrealized gain (cash + %),
// and an idealistic post-tax figure (computed asset-by-asset on the backend,
// shown here as a single aggregate value). Month is navigated independently from
// the Cash Flow tab via the dedicated invStats month/year state.
function Tile({
    dotColor,
    label,
    value,
    caption,
}: {
    dotColor: string;
    label: ReactNode;
    value: ReactNode;
    caption?: ReactNode;
}) {
    return (
        <div style={{ flex: 1, padding: "8px 10px", minWidth: 0 }}>
            <span
                style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: 12.5,
                    color: "var(--fg-soft)",
                    fontWeight: 600,
                }}
            >
                <span
                    aria-hidden="true"
                    style={{
                        width: 8,
                        height: 8,
                        borderRadius: 99,
                        background: dotColor,
                        flexShrink: 0,
                    }}
                />
                {label}
            </span>
            <span
                style={{
                    display: "block",
                    fontSize: 17,
                    fontWeight: 700,
                    color: "var(--fg)",
                    marginTop: 2,
                    fontVariantNumeric: "tabular-nums",
                }}
            >
                {value}
            </span>
            {caption != null && (
                <span
                    style={{
                        display: "block",
                        fontSize: 12,
                        fontWeight: 600,
                        color: "var(--fg-soft)",
                        marginTop: 1,
                        fontVariantNumeric: "tabular-nums",
                    }}
                >
                    {caption}
                </span>
            )}
        </div>
    );
}

export default function InvSummaryCard({
    stats,
    month,
    year,
    onChangeMonth,
}: {
    stats: InvStats | null;
    month: number;
    year: number;
    onChangeMonth: (next: { month: number; year: number }) => void;
}) {
    const { T } = useApp();
    const { formatEur } = useFormatters();
    if (!stats) return null;

    const invested = parseFloat(String(stats.invested || 0));
    const realGain = parseFloat(String(stats.realized?.gain || 0));
    const unrealGain = parseFloat(String(stats.unrealized?.gain || 0));
    const unrealPct = parseFloat(String(stats.unrealized?.gain_pct || 0));
    const postTaxGain = parseFloat(String(stats.post_tax?.gain || 0));

    const signed = (v: number) => `${v >= 0 ? "+" : ""}${formatEur(v)}`;

    return (
        <div
            style={{
                background: "var(--card)",
                border: "1px solid var(--rule)",
                borderRadius: "var(--r-card)",
                boxShadow: "var(--shadow-soft)",
                padding: "16px 18px 15px",
                marginBottom: 14,
            }}
        >
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 10,
                }}
            >
                <div
                    style={{
                        fontSize: 13,
                        color: "var(--fg-soft)",
                        fontWeight: 600,
                    }}
                >
                    {T("investment_kpi_label")}
                </div>
                <MonthPager
                    month={month}
                    year={year}
                    onChange={onChangeMonth}
                />
            </div>

            <div style={{ marginTop: 2 }}>
                <span
                    style={{
                        fontSize: 32,
                        fontWeight: 800,
                        letterSpacing: "-0.01em",
                        color: "var(--fg)",
                        fontVariantNumeric: "tabular-nums",
                    }}
                >
                    <PrivacyValue
                        scope="investments"
                        field="invested"
                        revealControl
                    >
                        {formatEur(invested)}
                    </PrivacyValue>
                </span>
                <div
                    style={{
                        fontSize: 12,
                        color: "var(--fg-soft)",
                        marginTop: 1,
                    }}
                >
                    {T("kpi_invested")}
                </div>
            </div>

            <div
                style={{
                    display: "flex",
                    gap: 6,
                    marginTop: 12,
                    borderTop: "1px solid var(--rule)",
                    paddingTop: 6,
                }}
            >
                <Tile
                    dotColor={
                        realGain >= 0 ? "var(--success)" : "var(--danger)"
                    }
                    label={T("kpi_realized_return")}
                    value={
                        <PrivacyValue scope="investments" field="realized_gain">
                            {signed(realGain)}
                        </PrivacyValue>
                    }
                />
                <Tile
                    dotColor={
                        unrealGain >= 0 ? "var(--success)" : "var(--danger)"
                    }
                    label={T("kpi_unrealized_return")}
                    value={
                        <PrivacyValue
                            scope="investments"
                            field="unrealized_gain"
                        >
                            {signed(unrealGain)}
                        </PrivacyValue>
                    }
                    caption={`${unrealPct >= 0 ? "+" : ""}${unrealPct.toFixed(1)}%`}
                />
                <Tile
                    dotColor={
                        postTaxGain >= 0 ? "var(--success)" : "var(--danger)"
                    }
                    label={T("kpi_post_tax_return")}
                    value={
                        <PrivacyValue scope="investments" field="post_tax_gain">
                            {signed(postTaxGain)}
                        </PrivacyValue>
                    }
                />
            </div>
        </div>
    );
}
