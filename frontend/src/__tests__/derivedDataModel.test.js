import { describe, expect, it } from "vitest";
import {
  buildKpiData,
  buildMonthlyTrend,
  filterExpensesByCategories,
  getAvailableMonths,
  groupAssets,
} from "../context/derivedDataModel";

describe("derived data model", () => {
  it("includes expenses belonging to a selected parent category", () => {
    const expenses = [
      { id: 1, category: 11 },
      { id: 2, category: 20 },
    ];
    const categories = [
      { id: 10, parent: null },
      { id: 11, parent: 10 },
      { id: 20, parent: null },
    ];

    expect(filterExpensesByCategories(expenses, [10], categories)).toEqual([
      expenses[0],
    ]);
  });

  it("groups active and archived bank and investment assets", () => {
    const groups = groupAssets([
      { id: 1, investment_type_detail: { is_bank_account: true } },
      {
        id: 2,
        is_archived: true,
        investment_type_detail: { is_bank_account: true },
      },
      { id: 3, investment_type_detail: { is_bank_account: false } },
      {
        id: 4,
        is_archived: true,
        investment_type_detail: { is_bank_account: false },
      },
    ]);

    expect(groups.bankAccounts.map(({ id }) => id)).toEqual([1]);
    expect(groups.archivedBankAccounts.map(({ id }) => id)).toEqual([2]);
    expect(groups.investments.map(({ id }) => id)).toEqual([3]);
    expect(groups.archivedInvestments.map(({ id }) => id)).toEqual([4]);
  });

  it("uses the current month when the current year has no entries", () => {
    expect(getAvailableMonths([], 2026, 2026, 6)).toEqual([6]);
  });

  it("calculates income, expenses and portfolio ratios", () => {
    expect(
      buildKpiData(
        {
          by_category: [
            { category__category_type: "expense", total: "200" },
            { category__category_type: "income", total: "500" },
          ],
        },
        { total_invested: 1000, total_gain: 100, total_current: 2000 },
      ),
    ).toEqual({
      monthlyExp: 200,
      monthlyInc: 500,
      returnRate: 10,
      expenseRatio: 10,
    });
  });

  it("builds a stable twelve-month trend", () => {
    const labels = Array.from({ length: 12 }, (_, index) => `M${index + 1}`);
    const trend = buildMonthlyTrend(
      [
        { date: "2026-06-01", amount: "10.50" },
        { date: "2026-06-15", amount: "2.50" },
      ],
      labels,
      new Date(2026, 5, 20),
    );

    expect(trend).toHaveLength(12);
    expect(trend.at(-1)).toEqual({ month: "M6", value: 13 });
  });
});
