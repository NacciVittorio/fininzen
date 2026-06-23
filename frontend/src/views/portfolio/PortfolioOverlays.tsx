import type { ComponentProps, Dispatch, SetStateAction } from "react";
import { Icon, SpeedDialFab } from "../../components/ui";
import type { Asset } from "../../api/types";
import type { Translator } from "../../types";
import type {
    AssetTransactionFilters,
    AssetTransactionFilterType,
} from "../../context/feedDefaults";
import AddTransactionSheet from "./AddTransactionSheet";
import ArchiveBlockedSheet from "./ArchiveBlockedSheet";
import AssetFormSheet from "./AssetFormSheet";
import AssetTxBulkActions from "./AssetTxBulkActions";
import RealizeAssetSheet from "./RealizeAssetSheet";
import TxDeleteConfirmSheet from "./TxDeleteConfirmSheet";
import TxFiltersSheet from "./TxFiltersSheet";

// PortfolioOverlays distributes one shared props bag across every portfolio
// sheet. Typing it as the intersection of each child's props makes the
// {...props} spreads type-check against each sheet's strict contract while the
// (untyped) PortfolioView parent supplies the concrete values.
type PortfolioOverlaysProps = ComponentProps<typeof AddTransactionSheet> &
    ComponentProps<typeof AssetFormSheet> &
    ComponentProps<typeof RealizeAssetSheet> &
    ComponentProps<typeof TxDeleteConfirmSheet> &
    ComponentProps<typeof AssetTxBulkActions> &
    ComponentProps<typeof ArchiveBlockedSheet> & {
        T: Translator;
        hasActiveOverlay: boolean;
        openAssetAdd: () => void;
        openAddTxModal: () => void;
        txFiltersSheetOpen: boolean;
        setTxFiltersSheetOpen: (open: boolean) => void;
        assetTxFilters: AssetTransactionFilters;
        setAssetTxFilters: Dispatch<SetStateAction<AssetTransactionFilters>>;
        investments: readonly Asset[];
        archivedInvestments?: readonly Asset[];
        toggleAssetTxType: (type: AssetTransactionFilterType) => void;
        assetTxPeriodMode: "month" | "year";
        setAssetTxPeriodMode: (mode: string) => void;
    };

export default function PortfolioOverlays(props: PortfolioOverlaysProps) {
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
