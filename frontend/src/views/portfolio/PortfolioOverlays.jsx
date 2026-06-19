import { Icon, SpeedDialFab } from "../../components/ui";
import AddTransactionSheet from "./AddTransactionSheet";
import ArchiveBlockedSheet from "./ArchiveBlockedSheet";
import AssetFormSheet from "./AssetFormSheet";
import AssetTxBulkActions from "./AssetTxBulkActions";
import RealizeAssetSheet from "./RealizeAssetSheet";
import TxDeleteConfirmSheet from "./TxDeleteConfirmSheet";
import TxFiltersSheet from "./TxFiltersSheet";

export default function PortfolioOverlays(props) {
  const {
    T,
    hasActiveOverlay,
    openAssetAdd,
    openAddTxModal,
    txFiltersSheetOpen,
    setTxFiltersSheetOpen,
    assetTxFilters,
    setAssetTxFilters,
  } = props;

  return (
    <>
      <AddTransactionSheet {...props} />
      <AssetFormSheet {...props} />
      <RealizeAssetSheet {...props} />
      <TxDeleteConfirmSheet {...props} />
      <AssetTxBulkActions {...props} />
      <TxFiltersSheet
        open={txFiltersSheetOpen}
        onClose={() => setTxFiltersSheetOpen(false)}
        T={T}
        investments={props.investments}
        archivedInvestments={props.archivedInvestments}
        filters={assetTxFilters}
        setFilters={setAssetTxFilters}
        toggleType={props.toggleAssetTxType}
        periodMode={props.assetTxPeriodMode}
        setPeriodMode={props.setAssetTxPeriodMode}
      />
      <ArchiveBlockedSheet {...props} />
      <SpeedDialFab
        mainLabel={T("btn_add_investment")}
        hidden={hasActiveOverlay}
        actions={[
          {
            icon: <Icon name="investments" size={18} />,
            label: T("add_modal_mode_asset"),
            testId: "portfolio-fab-add-asset",
            onClick: openAssetAdd,
          },
          {
            icon: <Icon name="transfer" size={18} />,
            label: T("add_modal_mode_transaction"),
            testId: "portfolio-fab-add-transaction",
            onClick: openAddTxModal,
          },
        ]}
      />
    </>
  );
}
