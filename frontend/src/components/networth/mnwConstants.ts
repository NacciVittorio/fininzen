import type { Translator } from "../../types";

export const MONTH_NAMES_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

export type VisibleMonth = { year: number; month: number };
export type MonthlySummaryKey =
  | "balance"
  | "nw"
  | "nw_change_abs"
  | "nw_change_pct"
  | "income"
  | "outcome"
  | "cash_saving_abs"
  | "cash_saving_pct";
export type MonthlySummaryRow = {
  key: MonthlySummaryKey;
  label: string;
  isDelta: boolean;
  isPercent: boolean;
};

// Returns array of {year, month} objects covering the last `monthRange` months up to `year`.
export function getVisibleMonths(
  year: number,
  monthRange: number,
): VisibleMonth[] {
  const isCurrentYear = year === new Date().getFullYear();
  const lastMonth = isCurrentYear ? new Date().getMonth() : 11;
  const result: VisibleMonth[] = [];
  for (let i = monthRange - 1; i >= 0; i--) {
    const m = lastMonth - i;
    if (m < 0) result.push({ year: year - 1, month: m + 12 });
    else result.push({ year, month: m });
  }
  return result;
}

export const getSummaryRows = (T: Translator): MonthlySummaryRow[] => [
  {
    key: "balance",
    label: T("monthly_balance"),
    isDelta: false,
    isPercent: false,
  },
  { key: "nw", label: T("monthly_nw"), isDelta: false, isPercent: false },
  {
    key: "nw_change_abs",
    label: T("monthly_nw_change_abs"),
    isDelta: true,
    isPercent: false,
  },
  {
    key: "nw_change_pct",
    label: T("monthly_nw_change_pct"),
    isDelta: true,
    isPercent: true,
  },
  {
    key: "income",
    label: T("monthly_income"),
    isDelta: false,
    isPercent: false,
  },
  {
    key: "outcome",
    label: T("monthly_outcome"),
    isDelta: false,
    isPercent: false,
  },
  {
    key: "cash_saving_abs",
    label: T("monthly_cash_saving"),
    isDelta: true,
    isPercent: false,
  },
  {
    key: "cash_saving_pct",
    label: T("monthly_cash_saving_pct"),
    isDelta: true,
    isPercent: true,
  },
];
