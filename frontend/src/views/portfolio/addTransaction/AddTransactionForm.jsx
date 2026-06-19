import {
  localeFromSeparator,
  parseFlexibleDecimal,
} from "../../../utils/formatters";
import { estimateSellTax } from "../portfolioCalculations";
import SelectedAssetChip from "./SelectedAssetChip";
import TransactionFundingFields from "./TransactionFundingFields";
import TransactionNotesVerification from "./TransactionNotesVerification";
import TransactionTradeFields from "./TransactionTradeFields";
import TransactionTotalPreview from "./TransactionTotalPreview";
import TransactionTypeToggle from "./TransactionTypeToggle";

export default function AddTransactionForm({
  addTxAssetId,
  setAddTxAssetId,
  addTxForm,
  setAddTxForm,
  setAddTxPriceTouched,
  setAddTxTaxTouched,
  editingAddTxId,
  editingAddTxItem,
  investments,
  bankAccounts,
  getAvailableContributionSources,
  T,
  decimalSeparator,
  formatEur,
}) {
  const asset = investments.find(
    (item) => String(item.id) === String(addTxAssetId),
  );
  const parsedShares = parseFlexibleDecimal(addTxForm.shares);
  const parsedPrice = parseFlexibleDecimal(addTxForm.price_per_share);
  const parsedFee = addTxForm.fee ? parseFlexibleDecimal(addTxForm.fee) : 0;
  const parsedTaxAmount = addTxForm.tax_amount
    ? parseFlexibleDecimal(addTxForm.tax_amount)
    : 0;
  const totalValueNumber =
    Number.isFinite(parsedShares) &&
    Number.isFinite(parsedPrice) &&
    parsedShares > 0 &&
    parsedPrice > 0
      ? parsedShares * parsedPrice
      : null;
  const total =
    totalValueNumber !== null
      ? totalValueNumber.toLocaleString(localeFromSeparator(decimalSeparator), {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })
      : null;
  const estimatedTax = estimateSellTax(
    addTxForm,
    asset,
    editingAddTxId,
    editingAddTxItem,
  );

  return (
    <>
      <SelectedAssetChip
        asset={asset}
        setAddTxAssetId={setAddTxAssetId}
        setAddTxForm={setAddTxForm}
        setAddTxPriceTouched={setAddTxPriceTouched}
      />

      <TransactionTypeToggle
        addTxForm={addTxForm}
        setAddTxForm={setAddTxForm}
        T={T}
      />

      <TransactionTradeFields
        addTxForm={addTxForm}
        setAddTxForm={setAddTxForm}
        setAddTxPriceTouched={setAddTxPriceTouched}
        setAddTxTaxTouched={setAddTxTaxTouched}
        asset={asset}
        T={T}
      />

      <TransactionTotalPreview
        addTxForm={addTxForm}
        asset={asset}
        total={total}
        parsedFee={parsedFee}
        parsedTaxAmount={parsedTaxAmount}
        estimatedTax={estimatedTax}
        T={T}
        formatEur={formatEur}
      />

      <TransactionFundingFields
        addTxForm={addTxForm}
        setAddTxForm={setAddTxForm}
        asset={asset}
        bankAccounts={bankAccounts}
        getAvailableContributionSources={getAvailableContributionSources}
        T={T}
      />

      <TransactionNotesVerification
        addTxForm={addTxForm}
        setAddTxForm={setAddTxForm}
        T={T}
      />
    </>
  );
}
