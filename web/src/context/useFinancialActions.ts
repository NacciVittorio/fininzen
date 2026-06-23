import { useAssetActions } from "./useAssetActions";
import { useExpenseActions } from "./useExpenseActions";
import { useTransferActions } from "./useTransferActions";
import type { AssetActionsOptions } from "./useAssetActions";
import type { ExpenseActionsOptions } from "./useExpenseActions";
import type { TransferActionsOptions } from "./useTransferActions";

type FinancialActionsOptions = AssetActionsOptions &
    ExpenseActionsOptions &
    Omit<TransferActionsOptions, "closeExpenseModal">;

export function useFinancialActions(options: FinancialActionsOptions) {
    const expenseActions = useExpenseActions(options);
    const assetActions = useAssetActions(options);
    const transferActions = useTransferActions({
        ...options,
        closeExpenseModal: expenseActions.closeExpenseModal,
    });
    return { ...expenseActions, ...assetActions, ...transferActions };
}
