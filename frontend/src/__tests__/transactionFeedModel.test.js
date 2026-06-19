import { describe, expect, it } from "vitest";
import {
  countCashflowFilters,
  decorateDatedItems,
  getCashflowPeriod,
  getCashflowTotals,
} from "../views/transactionFeedModel";

describe("transaction feed model", () => {
  const translate = (key) => key;
  const months = [
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
  ];

  it("decorates month and day boundaries", () => {
    const decorated = decorateDatedItems(
      [
        { id: 1, date: "2026-06-19" },
        { id: 2, date: "2026-06-19" },
        { id: 3, date: "2026-05-31" },
      ],
      months,
      translate,
      new Date("2026-06-19T12:00:00Z"),
    );

    expect(decorated[0]).toMatchObject({
      showMonthDivider: true,
      showDayDivider: true,
      monthLabel: "Jun 2026",
      dayLabel: "divider_today",
    });
    expect(decorated[1]).toMatchObject({
      showMonthDivider: false,
      showDayDivider: false,
    });
    expect(decorated[2].showMonthDivider).toBe(true);
  });

  it("uses verified rows when a server summary is unavailable", () => {
    expect(
      getCashflowTotals([
        { type: "income", amount: "100", is_verified: true },
        { type: "outcome", amount: "30", is_verified: true },
        { type: "outcome", amount: "90", is_verified: false },
      ]),
    ).toEqual({ income: 100, outcome: 30, net: 70 });
  });

  it("prefers authoritative server totals", () => {
    expect(getCashflowTotals([], { income: "50", outcome: "20" })).toEqual({
      income: 50,
      outcome: 20,
      net: 30,
    });
  });

  it("recognizes all, year and month periods", () => {
    expect(getCashflowPeriod({})).toEqual({ kind: "all" });
    expect(
      getCashflowPeriod({ date_from: "2026-01-01", date_to: "2026-12-31" }),
    ).toEqual({ kind: "year", year: 2026 });
    expect(
      getCashflowPeriod({ date_from: "2026-06-01", date_to: "2026-06-30" }),
    ).toEqual({ kind: "month", month: 6, year: 2026 });
  });

  it("counts filters independently from the period", () => {
    expect(
      countCashflowFilters({
        types: ["income"],
        verified: false,
        account_ids: [1],
        category_ids: [],
        ordering: "amount",
        date_from: "2026-01-01",
      }),
    ).toBe(4);
  });
});
