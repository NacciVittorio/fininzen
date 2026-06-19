import InvSummaryCard from "../../components/portfolio/InvSummaryCard";
import PrivacyValue from "../../components/PrivacyValue";
import {
  Icon,
  LargeTitleHeader,
  Pill,
  PullToRefresh,
} from "../../components/ui";
import AllocationTargetsPanel from "./AllocationTargetsPanel";
import AssetTransactionsSection from "./AssetTransactionsSection";
import InvestmentAssetGroups from "./InvestmentAssetGroups";

export default function PortfolioContent(props) {
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
                <Pill tone={totalGain >= 0 ? "success" : "danger"}>
                  <PrivacyValue scope="investments" field="total_gain">
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
                {refreshing ? T("refreshing") : T("refresh_prices")}
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
        <InvSummaryCard
          stats={monthlyInvestmentStats}
          month={invStatsMonth}
          year={invStatsYear}
          onChangeMonth={({ month, year }) => {
            setInvStatsMonth(month);
            setInvStatsYear(year);
          }}
        />
        <InvestmentAssetGroups {...props} />
        <AllocationTargetsPanel {...props} />
        <AssetTransactionsSection {...props} />
      </div>
    </PullToRefresh>
  );
}
