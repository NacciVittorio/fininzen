import AssetCard from "../../components/AssetCard";
import { CategoryDot, GroupedList, Icon } from "../../components/ui";

export default function InvestmentAssetGroups({
  investments,
  investmentTypes,
  archivedInvestments,
  archivedInvExpanded,
  setArchivedInvExpanded,
  handleArchiveInvestment,
  handleUnarchiveInvestment,
  deleteAsset,
  openAssetEdit,
  openAdjustBalance,
  openRealizeAsset,
  openAssetAdd,
  T,
  totalValue,
  priceRefreshCounter,
  apiFetch,
  isValueHidden,
  openSwipeId,
  setOpenSwipeId,
  masked,
  formatEur,
}) {
  const untypedInvestments = investments.filter(
    (a) => !a.investment_type_detail,
  );

  return (
    <>
      {investments.length === 0 && (
        <div
          style={{
            textAlign: "center",
            padding: "64px 24px",
            color: "var(--fg-soft)",
          }}
        >
          <div
            style={{
              display: "inline-flex",
              marginBottom: 16,
              opacity: 0.42,
              color: "var(--fg-soft)",
            }}
          >
            <Icon name="investments" size={44} strokeWidth={1.8} />
          </div>
          <div
            style={{
              fontSize: 16,
              fontWeight: 600,
              color: "var(--fg)",
              marginBottom: 8,
            }}
          >
            {T("portfolio_empty_title", "No investments yet")}
          </div>
          <div
            style={{
              fontSize: 13,
              marginBottom: 24,
              maxWidth: 280,
              margin: "0 auto 24px",
            }}
          >
            {T(
              "portfolio_empty_body",
              "Add your first asset to start tracking your portfolio.",
            )}
          </div>
          <button className="btn btn-primary" onClick={() => openAssetAdd()}>
            + {T("add_modal_mode_asset")}
          </button>
        </div>
      )}

      {investmentTypes
        .filter(
          (t) =>
            !t.is_bank_account &&
            investments.some((a) => a.investment_type_detail?.id === t.id),
        )
        .map((t) => {
          const typeAssets = investments.filter(
            (a) => a.investment_type_detail?.id === t.id,
          );
          const typeCurrent = typeAssets.reduce(
            (sum, a) => sum + parseFloat(a.current_value || 0),
            0,
          );
          return (
            <GroupedList
              key={t.id}
              title={
                <span
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 7,
                    justifyContent: "space-between",
                  }}
                >
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 7,
                    }}
                  >
                    <CategoryDot color={t.color || "var(--accent)"} size={7} />
                    {t.name}
                  </span>
                  <span className="num" style={{ letterSpacing: 0 }}>
                    {masked("asset_values", formatEur(typeCurrent))}
                  </span>
                </span>
              }
            >
              {typeAssets.map((a, i) => (
                <AssetCard
                  key={a.id}
                  a={a}
                  onArchive={handleArchiveInvestment}
                  onDelete={deleteAsset}
                  onEdit={openAssetEdit}
                  onAdjust={openAdjustBalance}
                  onRealize={openRealizeAsset}
                  T={T}
                  totalPortfolioValue={totalValue}
                  priceRefreshCounter={priceRefreshCounter}
                  apiFetch={apiFetch}
                  isValueHidden={isValueHidden}
                  openSwipeId={openSwipeId}
                  onRequestSwipeOpen={setOpenSwipeId}
                  isLast={i === typeAssets.length - 1}
                />
              ))}
            </GroupedList>
          );
        })}

      {untypedInvestments.length > 0 && (
        <GroupedList>
          {untypedInvestments.map((a, i, arr) => (
            <AssetCard
              key={a.id}
              a={a}
              onArchive={handleArchiveInvestment}
              onDelete={deleteAsset}
              onEdit={openAssetEdit}
              onAdjust={openAdjustBalance}
              onRealize={openRealizeAsset}
              T={T}
              totalPortfolioValue={totalValue}
              priceRefreshCounter={priceRefreshCounter}
              apiFetch={apiFetch}
              isValueHidden={isValueHidden}
              openSwipeId={openSwipeId}
              onRequestSwipeOpen={setOpenSwipeId}
              isLast={i === arr.length - 1}
            />
          ))}
        </GroupedList>
      )}

      {archivedInvestments.length > 0 && (
        <GroupedList style={{ marginTop: 24 }}>
          <GroupedList.Item
            label={`${T("label_archived_investments")} (${archivedInvestments.length})`}
            icon={<Icon name="archive" size={16} />}
            onClick={() => setArchivedInvExpanded((p) => !p)}
            action={
              <span
                aria-hidden="true"
                style={{
                  display: "inline-block",
                  color: "var(--fg-faint)",
                  fontSize: 17,
                  transform: archivedInvExpanded
                    ? "rotate(90deg)"
                    : "rotate(0deg)",
                  transition: "transform 0.18s ease",
                }}
              >
                ›
              </span>
            }
          />
          {archivedInvExpanded &&
            archivedInvestments.map((a, i) => (
              <AssetCard
                key={a.id}
                a={a}
                onUnarchive={handleUnarchiveInvestment}
                T={T}
                totalPortfolioValue={0}
                priceRefreshCounter={0}
                apiFetch={apiFetch}
                isValueHidden={isValueHidden}
                openSwipeId={openSwipeId}
                onRequestSwipeOpen={setOpenSwipeId}
                isLast={i === archivedInvestments.length - 1}
              />
            ))}
        </GroupedList>
      )}
    </>
  );
}
