import { describe, it, expect } from "vitest";
import {
  formatDate,
  today,
  parseCSV,
  makeFormatTick,
  localeFromSeparator,
  makeEurFormatters,
  parseAmount,
  parseFlexibleDecimal,
  isValidAmount,
  filterAmountInput,
} from "../utils/formatters";

// Default IT formatters used by tests that previously imported formatEur*
// directly. The direct exports were removed to force all view code through
// useFormatters() (which is locale-aware via decimalSeparator).
const { formatEur, formatEurFull } = makeEurFormatters("it-IT");

describe("formatEur (it-IT)", () => {
  it("formats integer amounts with EUR symbol", () => {
    const result = formatEur(1234);
    expect(result).toContain("€");
    expect(result).toContain("1");
  });

  it("handles null as zero", () => {
    const result = formatEur(null);
    expect(result).toContain("€");
    expect(result).toContain("0");
  });

  it("handles undefined as zero", () => {
    const result = formatEur(undefined);
    expect(result).toContain("€");
  });

  it("preserves decimal places (regression: 7.5 was displayed as 8)", () => {
    const result = formatEur(7.5);
    expect(result).toMatch(/7[,.]50/);
  });

  it("preserves two decimal places for non-round amounts", () => {
    const result = formatEur(12.99);
    expect(result).toMatch(/12[,.]99/);
  });
});

describe("formatEurFull (it-IT)", () => {
  it("formats with two decimal places", () => {
    const result = formatEurFull(10.5);
    expect(result).toContain("€");
    // Italian locale: 10,50
    expect(result).toMatch(/10[,.]50/);
  });

  it("handles null as zero with two decimals", () => {
    const result = formatEurFull(null);
    expect(result).toContain("€");
    expect(result).toMatch(/0[,.]00/);
  });
});

describe("formatDate", () => {
  it("formats ISO date string to readable form", () => {
    const result = formatDate("2026-04-10");
    expect(result).toContain("2026");
    expect(result).toContain("Apr");
    expect(result).toContain("10");
  });

  it("returns em dash for null", () => {
    expect(formatDate(null)).toBe("—");
  });

  it("returns em dash for empty string", () => {
    expect(formatDate("")).toBe("—");
  });
});

describe("today", () => {
  it("returns an ISO date string", () => {
    expect(today()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("returns the current date", () => {
    const expected = new Date().toISOString().slice(0, 10);
    expect(today()).toBe(expected);
  });
});

describe("makeFormatTick", () => {
  it("regression: small daily range shows decimal k labels (was all showing same value)", () => {
    // Wealth at 125k, daily change 100€ → range ~220€ after 10% padding
    const fmt = makeFormatTick(220);
    expect(fmt(124800)).toBe("124.80k");
    expect(fmt(125000)).toBe("125.00k");
    expect(fmt(125200)).toBe("125.20k");
    // All three must be distinct — the core regression check
    expect(new Set([fmt(124800), fmt(125000), fmt(125200)]).size).toBe(3);
  });

  it("uses 1 decimal for medium range (5k–50k)", () => {
    const fmt = makeFormatTick(20_000);
    expect(fmt(110_000)).toBe("110.0k");
    expect(fmt(125_000)).toBe("125.0k");
  });

  it("uses 0 decimals for large range (≥ 50k)", () => {
    const fmt = makeFormatTick(100_000);
    expect(fmt(100_000)).toBe("100k");
    expect(fmt(125_000)).toBe("125k");
  });

  it("formats millions with adaptive decimals", () => {
    const fmtSmall = makeFormatTick(200_000);
    expect(fmtSmall(1_250_000)).toBe("1.25M");

    const fmtLarge = makeFormatTick(10_000_000);
    expect(fmtLarge(1_000_000)).toBe("1M");
  });

  it("formats sub-thousand values", () => {
    const fmt = makeFormatTick(50);
    expect(fmt(500)).toBe("500");
  });
});

describe("localeFromSeparator", () => {
  it('maps "." to en-US', () => {
    expect(localeFromSeparator(".")).toBe("en-US");
  });

  it('maps "," to it-IT', () => {
    expect(localeFromSeparator(",")).toBe("it-IT");
  });

  it("defaults unknown value to it-IT", () => {
    expect(localeFromSeparator("x")).toBe("it-IT");
  });
});

describe("makeEurFormatters", () => {
  it("it-IT: uses comma as decimal separator", () => {
    const { formatEur } = makeEurFormatters("it-IT");
    const result = formatEur(1234.56);
    expect(result).toContain(",");
    expect(result).toContain("€");
  });

  it("en-US: uses period as decimal separator", () => {
    const { formatEur } = makeEurFormatters("en-US");
    const result = formatEur(1234.56);
    expect(result).toContain(".");
    expect(result).toContain("€");
  });

  it("formatEurFull always has 2 decimal places", () => {
    const { formatEurFull } = makeEurFormatters("en-US");
    const result = formatEurFull(10);
    expect(result).toMatch(/10\.00/);
  });

  it("formatEurCompact uses compact notation", () => {
    const { formatEurCompact } = makeEurFormatters("en-US");
    const result = formatEurCompact(1_500_000);
    expect(result).toMatch(/1\.5M|1,5M/);
  });

  it("handles null as zero", () => {
    const { formatEur } = makeEurFormatters("en-US");
    const result = formatEur(null);
    expect(result).toContain("0");
    expect(result).toContain("€");
  });
});

describe("filterAmountInput", () => {
  it("passes through digits", () => {
    expect(filterAmountInput("123")).toBe("123");
  });

  it("passes through dot-decimal", () => {
    expect(filterAmountInput("12.50")).toBe("12.50");
  });

  it("passes through comma-decimal", () => {
    expect(filterAmountInput("12,50")).toBe("12,50");
  });

  it("strips letters", () => {
    expect(filterAmountInput("12abc")).toBe("12");
  });

  it("strips all letters leaving only numeric chars", () => {
    expect(filterAmountInput("abc")).toBe("");
  });

  it("strips spaces", () => {
    expect(filterAmountInput("1 2")).toBe("12");
  });

  it("strips minus sign", () => {
    expect(filterAmountInput("-5")).toBe("5");
  });

  it("allows only the first dot — removes subsequent dots", () => {
    expect(filterAmountInput("1.2.3")).toBe("1.23");
  });

  it("allows only the first comma — removes subsequent commas", () => {
    expect(filterAmountInput("1,,2")).toBe("1,2");
  });

  it("allows only the first separator when mixing , and .", () => {
    expect(filterAmountInput("1,2.3")).toBe("1,23");
  });

  it("limits decimal digits to 2 with dot separator", () => {
    expect(filterAmountInput("12.3456")).toBe("12.34");
  });

  it("limits decimal digits to 2 with comma separator", () => {
    expect(filterAmountInput("12,3456")).toBe("12,34");
  });
});

describe("parseAmount", () => {
  it("parses dot-decimal string (IT default sep)", () => {
    // IT default: "12.50" interprets "." as thousands → 1250 / actually parses 1250
    // Legacy behavior: with default sep="," and only one "." it returns 12.5 because
    // "12.50".replace(/\./g,"") → "1250" then parseFloat → 1250. Confirmed: we now
    // require the caller to pass sep="." for US-style strings.
    expect(parseAmount("12.50", ".")).toBe(12.5);
  });

  it("normalizes comma to dot and parses (IT)", () => {
    expect(parseAmount("12,50", ",")).toBe(12.5);
  });

  it("parses integer string", () => {
    expect(parseAmount("100")).toBe(100);
  });

  it("returns NaN for empty string", () => {
    expect(parseAmount("")).toBeNaN();
  });

  it("returns NaN for null", () => {
    expect(parseAmount(null)).toBeNaN();
  });

  it("returns NaN for non-numeric string", () => {
    expect(parseAmount("abc")).toBeNaN();
  });

  it("accepts numeric value directly", () => {
    expect(parseAmount(42.5)).toBe(42.5);
  });

  // ── AUDIT M9 — locale-aware parsing ─────────────────────────────────────
  it("strips dots as thousands separators when sep=','", () => {
    expect(parseAmount("1.000,50", ",")).toBe(1000.5);
  });

  it("treats single dot as decimal when sep=',' and no comma is present", () => {
    expect(parseAmount("40.00", ",")).toBe(40);
  });

  it("strips commas as thousands separators when sep='.'", () => {
    expect(parseAmount("1,000.50", ".")).toBe(1000.5);
  });

  it("handles plain integer with thousands sep in IT", () => {
    expect(parseAmount("1.234.567", ",")).toBe(1234567);
  });

  it("default sep is ',' (IT) for backward compat", () => {
    // No sep param → behaves as if sep=","
    expect(parseAmount("1.000,50")).toBe(1000.5);
  });
});

describe("parseFlexibleDecimal", () => {
  it("parses comma-decimal shares", () => {
    expect(parseFlexibleDecimal("12,29")).toBe(12.29);
  });

  it("keeps single dot as decimal for market prices", () => {
    expect(parseFlexibleDecimal("35.924")).toBe(35.924);
  });

  it("parses Italian thousands and decimals", () => {
    expect(parseFlexibleDecimal("1.234,56")).toBe(1234.56);
  });

  it("parses US thousands and decimals", () => {
    expect(parseFlexibleDecimal("1,234.56")).toBe(1234.56);
  });

  it("matches the investment transaction total preview example", () => {
    const shares = parseFlexibleDecimal("12,29");
    const price = parseFlexibleDecimal("35.924");
    const total = (shares * price).toLocaleString(localeFromSeparator(","), {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

    expect(total).toBe("441,51");
  });
});

describe("isValidAmount", () => {
  it("returns true for valid positive dot-decimal (US sep)", () => {
    expect(isValidAmount("12.50", ".")).toBe(true);
  });

  it("returns true for valid positive comma-decimal (IT sep)", () => {
    expect(isValidAmount("12,50", ",")).toBe(true);
  });

  it("returns false for zero", () => {
    expect(isValidAmount("0")).toBe(false);
  });

  it("returns false for negative", () => {
    expect(isValidAmount("-5")).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isValidAmount("")).toBe(false);
  });

  it("returns false for non-numeric string", () => {
    expect(isValidAmount("abc")).toBe(false);
  });

  it("returns false for null", () => {
    expect(isValidAmount(null)).toBe(false);
  });
});

describe("parseCSV", () => {
  it("returns headers and rows for valid CSV", () => {
    const result = parseCSV(
      "date;description;amount\n2026-01-01;Pizza;12",
      ";",
    );
    expect(result).not.toBeNull();
    expect(result.headers).toEqual(["date", "description", "amount"]);
    expect(result.rows).toEqual([["2026-01-01", "Pizza", "12"]]);
  });

  it("returns null for single-line input (no data rows)", () => {
    expect(parseCSV("just headers", ";")).toBeNull();
  });

  it("strips outer quotes from headers", () => {
    // clean() trims outer whitespace then removes leading/trailing quotes
    const result = parseCSV('"date";"desc"\n2026-01-01;Pizza', ";");
    expect(result.headers[0]).toBe("date");
    expect(result.headers[1]).toBe("desc");
  });

  it("handles comma separator", () => {
    const result = parseCSV("a,b\n1,2", ",");
    expect(result.headers).toEqual(["a", "b"]);
    expect(result.rows[0]).toEqual(["1", "2"]);
  });

  it("returns null for empty string", () => {
    expect(parseCSV("", ";")).toBeNull();
  });

  it("keeps the separator inside a quoted field (MED-29)", () => {
    const result = parseCSV('date;note\n2026-01-01;"Doe; John"', ";");
    expect(result.rows[0]).toEqual(["2026-01-01", "Doe; John"]);
  });

  it("unescapes doubled quotes inside a quoted field", () => {
    const result = parseCSV('a\n"say ""hi"""', ";");
    expect(result.rows[0]).toEqual(['say "hi"']);
  });

  it("tolerates CRLF line endings", () => {
    const result = parseCSV("a;b\r\n1;2", ";");
    expect(result.headers).toEqual(["a", "b"]);
    expect(result.rows[0]).toEqual(["1", "2"]);
  });
});
