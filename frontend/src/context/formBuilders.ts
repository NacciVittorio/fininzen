/**
 * Factory dei form di default (HIGH-30). Funzioni pure senza stato React:
 * restituiscono un nuovo oggetto-form, opzionalmente sovrascritto da `overrides`.
 * Riferimenti stabili tra i render (erano useCallback con deps vuote).
 */
import { today } from "../utils/formatters";

export type TransactionForm = {
  transaction_type: string;
  date: string;
  shares: string;
  price_per_share: string;
  fee: string;
  tax_amount: string;
  notes: string;
  linked_account_id: string;
  contribution_source: string;
};

export type TransferForm = {
  from_account_id: string;
  to_account_id: string;
  amount: string;
  date: string;
  notes: string;
  is_verified: boolean;
};

export type ExpenseForm = {
  description: string;
  amount: string;
  category: string;
  date: string;
  linked_asset: string;
  is_verified: boolean;
};

export type RecurringForm = {
  description: string;
  amount: string;
  category: string;
  linked_asset: string;
  frequency: string;
  day_of_month: string;
  month_of_year: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
  status: string;
};

export type PacForm = {
  name: string;
  asset: string;
  source_account: string;
  amount: string;
  frequency: string;
  day_of_week: string;
  day_of_month: string;
  anchor_month: string;
  generated_transactions_verified: boolean;
  start_date: string;
  end_date: string;
  is_active: boolean;
  status: string;
};

export const buildTxForm = (
  overrides: Partial<TransactionForm> = {},
): TransactionForm => ({
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

export const buildTransferForm = (
  overrides: Partial<TransferForm> = {},
): TransferForm => ({
  from_account_id: "",
  to_account_id: "",
  amount: "",
  date: today(),
  notes: "",
  is_verified: false,
  ...overrides,
});

export const buildExpenseForm = (
  overrides: Partial<ExpenseForm> = {},
): ExpenseForm => ({
  description: "",
  amount: "",
  category: "",
  date: today(),
  linked_asset: "",
  is_verified: false,
  ...overrides,
});

export const buildRecurringForm = (
  overrides: Partial<RecurringForm> = {},
): RecurringForm => ({
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

export const buildPacForm = (
  overrides: Partial<PacForm> = {},
): PacForm => ({
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
