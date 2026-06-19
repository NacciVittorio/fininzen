import { parseFlexibleDecimal } from "../../utils/formatters";
import type { NumericValue } from "../../types";

type SellForm = {
  transaction_type: string;
  shares: string;
  price_per_share: string;
  fee: string;
};

type TaxAsset = {
  effective_tax_rate?: NumericValue;
  shares?: NumericValue;
  tax_cost_basis?: NumericValue;
  invested_capital?: NumericValue;
  investment_type_detail?: { tax_rate?: NumericValue } | null;
};

type EditingTransaction = {
  shares?: NumericValue;
  tax_cost_basis?: NumericValue;
  asset?: TaxAsset | null;
};

// Estimated realized tax on a SELL, computed from the asset's current effective
// rate. Mirrors services.realized_tax_for_sell for the UI preview.
export function estimateSellTax(
  form: SellForm,
  asset?: TaxAsset | null,
  editingId?: number | string | null,
  editingItem?: EditingTransaction | null,
): number {
  if (form.transaction_type !== "sell") return 0;
  const shares = parseFlexibleDecimal(form.shares);
  const price = parseFlexibleDecimal(form.price_per_share);
  const fee = form.fee ? parseFlexibleDecimal(form.fee) : 0;
  if (
    !Number.isFinite(shares) ||
    !Number.isFinite(price) ||
    !Number.isFinite(fee) ||
    shares <= 0 ||
    price <= 0
  ) {
    return 0;
  }
  const rate = Number.parseFloat(
    String(
      asset?.effective_tax_rate ??
        editingItem?.asset?.effective_tax_rate ??
        asset?.investment_type_detail?.tax_rate ??
        0,
    ),
  );
  if (!(rate > 0)) return 0;
  const editingShares = Number.parseFloat(String(editingItem?.shares || 0));
  const editingTaxCostBasis = Number.parseFloat(
    String(editingItem?.tax_cost_basis || 0),
  );
  const assetShares = Number.parseFloat(String(asset?.shares || 0));
  const assetTaxCostBasis = Number.parseFloat(
    String(asset?.tax_cost_basis ?? asset?.invested_capital ?? 0),
  );
  const taxCostPerShare =
    editingId && Number.isFinite(editingShares) && editingShares > 0
      ? editingTaxCostBasis / editingShares
      : assetShares > 0 && Number.isFinite(assetTaxCostBasis)
        ? assetTaxCostBasis / assetShares
        : 0;
  const total = shares * price;
  return Math.max(total - shares * taxCostPerShare - fee, 0) * rate;
}
