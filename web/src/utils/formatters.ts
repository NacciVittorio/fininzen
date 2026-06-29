import type { NumericValue } from "../types";

export type DecimalSeparator = "," | "." | null;
export type DecimalInput = string | number | null | undefined;

export const localeFromSeparator = (sep: DecimalSeparator): string =>
    sep === "." ? "en-US" : "it-IT";

const dateLocale = () => {
    try {
        return localStorage.getItem("lang") === "it" ? "it-IT" : "en-GB";
    } catch {
        return "en-GB";
    }
};

export function makeEurFormatters(locale: string): {
    formatEur: (value: NumericValue) => string;
    formatEurFull: (value: NumericValue) => string;
    formatEurCompact: (value: NumericValue) => string;
} {
    const fmt = new Intl.NumberFormat(locale, {
        style: "currency",
        currency: "EUR",
    });
    const fmtFull = new Intl.NumberFormat(locale, {
        style: "currency",
        currency: "EUR",
        minimumFractionDigits: 2,
    });
    const fmtCompact = new Intl.NumberFormat(locale, {
        style: "currency",
        currency: "EUR",
        notation: "compact",
        maximumFractionDigits: 1,
    });
    return {
        formatEur: (n) => fmt.format(Number(n ?? 0)),
        formatEurFull: (n) => fmtFull.format(Number(n ?? 0)),
        formatEurCompact: (n) => fmtCompact.format(Number(n ?? 0)),
    };
}

export const formatDate = (d: string | number | Date | null | undefined) =>
    d
        ? new Intl.DateTimeFormat(dateLocale(), {
              day: "2-digit",
              month: "short",
              year: "numeric",
          }).format(new Date(d))
        : "—";

export const today = () => new Date().toISOString().slice(0, 10);

export const currentYear = new Date().getFullYear();
export const currentMonth = new Date().getMonth() + 1;

export const makeFormatTick =
    (range: number) =>
    (v: number): string => {
        if (Math.abs(v) >= 1_000_000) {
            const dec = range < 500_000 ? 2 : range < 5_000_000 ? 1 : 0;
            return `${(v / 1_000_000).toFixed(dec)}M`;
        }
        if (Math.abs(v) >= 1_000) {
            const dec = range < 5_000 ? 2 : range < 50_000 ? 1 : 0;
            return `${(v / 1_000).toFixed(dec)}k`;
        }
        return `${v.toFixed(range < 10 ? 2 : 0)}`;
    };

export const filterAmountInput = (val: string): string => {
    const stripped = val.replace(/[^0-9,.]/g, "");
    let sepFound = false;
    const normalized = stripped
        .split("")
        .filter((ch) => {
            if (ch === "," || ch === ".") {
                if (sepFound) return false;
                sepFound = true;
            }
            return true;
        })
        .join("");
    const sepIndex = Math.max(normalized.indexOf(","), normalized.indexOf("."));
    if (sepIndex < 0) return normalized;
    const intPart = normalized.slice(0, sepIndex);
    const sep = normalized[sepIndex];
    const decPart = normalized
        .slice(sepIndex + 1)
        .replace(/[,.]/g, "")
        .slice(0, 2);
    return `${intPart}${sep}${decPart}`;
};

// CRIT-04 — Money parsing
// ─────────────────────────
// We do NOT add decimal.js as a dependency (would change package-lock).
// Instead the contract is:
//   `parseAmount` / `parseFlexibleDecimal` keep returning Number for the
//     display layer (Intl.NumberFormat, chart axes — usage where the small
//     IEEE-754 rounding is irrelevant).
//   `parseMoneyToString` returns a normalized decimal STRING (e.g. "1234.56")
//     suitable to send to the backend without going through Number, so a value
//     like "0.1 + 0.2" never reaches the server as 0.30000000000000004.
// All money-bound fetches should use parseMoneyToString — `parseAmount` stays
// for UX validation and chart formatting only.

const MONEY_MAX_MAGNITUDE = 1e12; // hard cap: anything past 10^12 EUR is junk

// Internal: take "1.234,56" or "1,234.56" or "1234.56" and return the decimal
// string "1234.56" (or null if the input is not a finite, in-range number).
// Pure string manipulation — no parseFloat round-trip — so the original
// precision survives untouched.
function _normalizeDecimalString(
    value: DecimalInput,
    sep: DecimalSeparator,
): string | null {
    if (value == null || value === "") return null;
    if (typeof value === "number") {
        if (!Number.isFinite(value)) return null;
        if (Math.abs(value) > MONEY_MAX_MAGNITUDE) return null;
        return String(value);
    }
    let s = String(value).trim().replace(/\s+/g, "").replace(/'/g, "");
    if (!s) return null;
    let sign = "";
    if (s[0] === "+" || s[0] === "-") {
        sign = s[0] === "-" ? "-" : "";
        s = s.slice(1);
    }
    const lastComma = s.lastIndexOf(",");
    const lastDot = s.lastIndexOf(".");
    let decSep;
    if (lastComma >= 0 && lastDot >= 0) {
        decSep = lastComma > lastDot ? "," : ".";
    } else if (lastComma >= 0 && lastDot < 0) {
        decSep = sep === "." ? null : ",";
    } else if (lastDot >= 0 && lastComma < 0) {
        // When the user's locale uses "," and the only separator is ".", the dot
        // is treated as thousands UNLESS the suffix looks like a decimal fraction
        // (1-2 digits after the dot) — that keeps API prefills like "40.00" working.
        if (sep === ",") {
            decSep = /\.\d{1,2}$/.test(s) ? "." : null;
        } else {
            decSep = ".";
        }
    } else {
        decSep = null;
    }
    if (decSep) {
        const thouSep = decSep === "," ? "." : ",";
        s = s.split(thouSep).join("");
        if (decSep === ",") s = s.replace(",", ".");
    } else {
        // No decimal sep at all — strip both as thousands separators.
        s = s.replace(/[.,]/g, "");
    }
    if (!/^\d+(\.\d+)?$/.test(s)) return null;
    if (s === "" || s === ".") return null;
    // Magnitude guard: trim any leading zeros, then bound on string length to
    // avoid the IEEE-754 round-trip for the bound check.
    const intPart = s.split(".")[0]!.replace(/^0+/, "") || "0";
    if (intPart.length > 13) return null; // > 10^12
    return sign + s;
}

// parseAmount: convert user-typed number into a JS Number.
// `sep` is the user's decimal separator ("," for IT, "." for US/UK).
// CRIT-04: the parser is rewritten to share _normalizeDecimalString so the
// edge case parseAmount("1.234", ",") now returns 1234 (was 1.234).
export const parseAmount = (
    val: DecimalInput,
    sep: DecimalSeparator = ",",
): number => {
    if (val === "" || val == null) return NaN;
    if (typeof val === "number") return val;
    const normalized = _normalizeDecimalString(val, sep);
    if (normalized == null) return NaN;
    const n = Number(normalized);
    return Number.isFinite(n) ? n : NaN;
};

// parseFlexibleDecimal: heuristics-based decimal parser used by the CSV
// importer where the user's separator is not known up-front. Delegates to
// _normalizeDecimalString with sep=null so the decision is made on a per-input
// basis (last-comma vs last-dot).
export const parseFlexibleDecimal = (value: DecimalInput): number => {
    if (value == null || value === "") return NaN;
    if (typeof value === "number") return value;
    const normalized = _normalizeDecimalString(value, null);
    if (normalized == null) return NaN;
    const n = Number(normalized);
    return Number.isFinite(n) ? n : NaN;
};

// parseMoneyToString: returns the canonical decimal string (e.g. "1234.56") or
// null on invalid input — to be used when sending a money field to the backend
// so the original precision is preserved (no parseFloat round-trip).
export const parseMoneyToString = (
    val: DecimalInput,
    sep: DecimalSeparator = ",",
): string | null => _normalizeDecimalString(val, sep);

export const isValidAmount = (
    val: DecimalInput,
    sep: DecimalSeparator = ",",
): boolean => {
    const n = parseAmount(val, sep);
    return Number.isFinite(n) && n > 0;
};

// Split one CSV line into trimmed fields, honoring RFC-4180 quoting: a quoted
// field may contain the separator, and a doubled "" is an escaped quote. Bank
// exports routinely quote descriptions that contain the delimiter, so the old
// naive line.split(sep) shredded those rows (MED-29).
function splitCsvLine(line: string, sep: string): string[] {
    const fields: string[] = [];
    let field = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (inQuotes) {
            if (ch === '"') {
                if (line[i + 1] === '"') {
                    field += '"';
                    i++; // consume the escaped quote
                } else {
                    inQuotes = false;
                }
            } else {
                field += ch;
            }
        } else if (ch === '"') {
            inQuotes = true;
        } else if (ch === sep) {
            fields.push(field);
            field = "";
        } else {
            field += ch;
        }
    }
    fields.push(field);
    return fields.map((s) => s.trim());
}

export type ParsedCsv = { headers: string[]; rows: string[][] };

export function parseCSV(text: string, sep: string): ParsedCsv | null {
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) return null;
    const headers = splitCsvLine(lines[0]!, sep);
    const rows = lines.slice(1).map((l) => splitCsvLine(l, sep));
    return { headers, rows };
}
