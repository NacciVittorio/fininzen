import { today } from "../../utils/formatters";
import type { NumericValue } from "../../types";

export const ASSET_TX_BULK_VERIFY_CONFIRM_THRESHOLD = 25;

export type AddTransactionForm = {
    transaction_type: string;
    date: string;
    shares: string;
    price_per_share: string;
    fee: string;
    tax_amount: string;
    notes: string;
    linked_account_id: string;
    contribution_source: string;
    is_verified: boolean;
};

type PortfolioPosition = {
    invested_capital?: NumericValue;
    current_value?: NumericValue;
};

export function createAddTransactionForm(
    defaultVerified = false,
): AddTransactionForm {
    return {
        transaction_type: "buy",
        date: today(),
        shares: "",
        price_per_share: "",
        fee: "",
        tax_amount: "",
        notes: "",
        linked_account_id: "",
        contribution_source: "",
        is_verified: defaultVerified,
    };
}

export function calculatePortfolioTotals(
    investments: readonly PortfolioPosition[],
): { totalValue: number; totalGain: number; totalGainPct: number } {
    const totalInvested = investments.reduce(
        (sum, asset) =>
            sum + Number.parseFloat(String(asset.invested_capital || 0)),
        0,
    );
    const totalValue = investments.reduce(
        (sum, asset) =>
            sum + Number.parseFloat(String(asset.current_value || 0)),
        0,
    );
    const totalGain = totalValue - totalInvested;
    return {
        totalValue,
        totalGain,
        totalGainPct: totalInvested > 0 ? (totalGain / totalInvested) * 100 : 0,
    };
}
