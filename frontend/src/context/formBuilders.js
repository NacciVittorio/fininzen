/**
 * Factory dei form di default (HIGH-30). Funzioni pure senza stato React:
 * restituiscono un nuovo oggetto-form, opzionalmente sovrascritto da `overrides`.
 * Riferimenti stabili tra i render (erano useCallback con deps vuote).
 */
import { today } from "../utils/formatters";

export const buildTxForm = (overrides = {}) => ({
  transaction_type: "buy",
  date: today(),
  shares: "",
  price_per_share: "",
  fee: "",
  tax_amount: "",
  notes: "",
  linked_account_id: "",
  contribution_source: "",
  ...overrides,
});

export const buildTransferForm = (overrides = {}) => ({
  from_account_id: "",
  to_account_id: "",
  amount: "",
  date: today(),
  notes: "",
  is_verified: false,
  ...overrides,
});

export const buildExpenseForm = (overrides = {}) => ({
  description: "",
  amount: "",
  category: "",
  date: today(),
  linked_asset: "",
  is_verified: false,
  ...overrides,
});

export const buildRecurringForm = (overrides = {}) => ({
  description: "",
  amount: "",
  category: "",
  linked_asset: "",
  frequency: "MONTHLY",
  day_of_month: "1",
  month_of_year: "",
  start_date: today(),
  end_date: "",
  is_active: true,
  status: "ACTIVE",
  ...overrides,
});

export const buildPacForm = (overrides = {}) => ({
  name: "",
  asset: "",
  source_account: "",
  amount: "",
  frequency: "MONTHLY",
  day_of_week: "1",
  day_of_month: "1",
  anchor_month: "",
  generated_transactions_verified: false,
  start_date: today(),
  end_date: "",
  is_active: true,
  status: "ACTIVE",
  ...overrides,
});
