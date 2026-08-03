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

export const formatDateTime = (d: string | number | Date | null | undefined) =>
    d
        ? new Intl.DateTimeFormat(dateLocale(), {
              day: "2-digit",
              month: "short",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
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

export const filterAmountInput = (
    val: string,
    maxDecimals: number = 2,
): string => {
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
        .slice(0, maxDecimals);
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

// ── Amount expressions (in-field calculator) ────────────────────────────────
// The amount fields accept a small arithmetic expression ("12,50+8,30") on top
// of a plain number. Everything below is pure string/number work shared by the
// two entry paths (typed inline and the operator bar) so the maths exists
// once. It lives in this module — and not in its own file — because it needs
// MONEY_MAX_MAGNITUDE and filterAmountInput, which stay module-private.

export type AmountEvalError =
    "empty" | "syntax" | "divzero" | "overflow" | "negative";

export type AmountEvalResult =
    { ok: true; value: number } | { ok: false; error: AmountEvalError };

const OPERATORS = "+-*/";
const OPERATOR_RE = /[+\-*/]/;
// Keeps the recursion depth of the parser bounded (<= ~20 frames) and stops a
// paste of junk from ever reaching it.
const MAX_EXPRESSION_LENGTH = 40;

// Fold the display glyphs onto ASCII and drop everything that is not part of
// an expression. The field value itself always stays ASCII: rewriting "*" into
// "×" while the user types would move the caret to the end on every keystroke
// (React reassigns `value`, and the browser only restores the caret when the
// new value is identical). The pretty glyphs live on the bar's keys only.
const normalizeOperators = (val: string): string =>
    val
        .replace(/[×xX]/g, "*") // × x X
        .replace(/÷/g, "/") // ÷
        .replace(/[−–—]/g, "-") // − – —
        .replace(/[\s  ]/g, "")
        .replace(/[^0-9,.+\-*/]/g, "");

// Soft filter for a field that may hold an expression. With no operator it
// delegates to filterAmountInput, so a plain number behaves exactly as it did
// before this feature existed (same clamping, same single separator) — that is
// what keeps `page.fill("42.50")` and every existing form untouched.
export const filterAmountExpression = (
    val: string,
    maxDecimals: number = 2,
): string => {
    const norm = normalizeOperators(val);
    if (!OPERATOR_RE.test(norm)) return filterAmountInput(norm, maxDecimals);

    let out = "";
    let sepInLiteral = false;
    for (const ch of norm) {
        if (OPERATORS.includes(ch)) {
            if (out === "") continue; // no leading operator
            if (OPERATORS.includes(out[out.length - 1]!)) {
                out = out.slice(0, -1) + ch; // collapse a run, keep the last
            } else {
                out += ch;
            }
            sepInLiteral = false; // a new literal starts
            continue;
        }
        if (ch === "," || ch === ".") {
            if (sepInLiteral) continue; // one separator per literal
            sepInLiteral = true;
        }
        out += ch;
    }
    return out.slice(0, MAX_EXPRESSION_LENGTH);
};

export const hasAmountOperator = (val: string): boolean =>
    /[+\-*/×÷−]/.test(val);

// Money-safe rounding to `maxDecimals` decimals (default 2). (n * 100) is
// often off by an ulp — 12.50 + 8.30 gives 2079.9999999999995 — which would
// round down to 20.79. toPrecision(12) sits well inside the double's
// significant digits while leaving room for the accumulated error, so it
// repairs the binary noise *before* the half-up rounding.
const roundMoney = (n: number, maxDecimals: number = 2): number => {
    const mult = 10 ** maxDecimals;
    return Math.round(Number((n * mult).toPrecision(12))) / mult;
};

const stripTrailingOperator = (s: string): string =>
    OPERATORS.includes(s[s.length - 1] ?? "") ? s.slice(0, -1) : s;

// Recursive-descent evaluator — no eval, no Function. Grammar:
//   sum    := term (('+'|'-') term)*
//   term   := factor (('*'|'/') factor)*
//   factor := ('+'|'-') factor | number
//   number := digits [(','|'.') digits] | (','|'.') digits
// so "×" and "÷" bind tighter than "+" and "−" (2+3*4 is 14, not 20).
// No `sep` parameter on purpose: inside an expression both "," and "." are
// decimal marks, per literal. Applying the thousands heuristic of
// _normalizeDecimalString here would turn "1.234+1" into 1235 instead of
// 2,234 — unpredictable. That heuristic exists for API prefills, which never
// come through this path, and a plain typed number can't reach 3 decimals
// anyway because filterAmountInput clamps it.
export const evaluateExpression = (
    expr: string,
    maxDecimals: number = 2,
): AmountEvalResult => {
    const s = stripTrailingOperator(normalizeOperators(expr));
    if (!s) return { ok: false, error: "empty" };

    let i = 0;
    let divZero = false;
    const peek = (): string | undefined => s[i];
    const isDigit = (c: string | undefined): boolean =>
        c != null && c >= "0" && c <= "9";

    const parseNumber = (): number | null => {
        const start = i;
        while (isDigit(peek())) i++;
        if (peek() === "," || peek() === ".") {
            i++;
            while (isDigit(peek())) i++;
        }
        const lit = s.slice(start, i);
        if (!lit || lit === "," || lit === ".") return null;
        const n = Number(lit.replace(",", "."));
        return Number.isFinite(n) ? n : null;
    };

    const parseFactor = (): number | null => {
        if (peek() === "+") {
            i++;
            return parseFactor();
        }
        if (peek() === "-") {
            i++;
            const v = parseFactor();
            return v == null ? null : -v;
        }
        return parseNumber();
    };

    const parseTerm = (): number | null => {
        let left = parseFactor();
        if (left == null) return null;
        while (peek() === "*" || peek() === "/") {
            const op = s[i++]!;
            const right = parseFactor();
            if (right == null) return null;
            if (op === "/") {
                if (right === 0) {
                    divZero = true;
                    return null;
                }
                left = left / right;
            } else {
                left = left * right;
            }
        }
        return left;
    };

    const parseSum = (): number | null => {
        let left = parseTerm();
        if (left == null) return null;
        while (peek() === "+" || peek() === "-") {
            const op = s[i++]!;
            const right = parseTerm();
            if (right == null) return null;
            left = op === "+" ? left + right : left - right;
        }
        return left;
    };

    const raw = parseSum();
    if (raw == null)
        return { ok: false, error: divZero ? "divzero" : "syntax" };
    if (i !== s.length) return { ok: false, error: "syntax" }; // trailing junk
    if (!Number.isFinite(raw)) return { ok: false, error: "overflow" };
    const value = roundMoney(raw, maxDecimals);
    if (!Number.isFinite(value) || Math.abs(value) > MONEY_MAX_MAGNITUDE)
        return { ok: false, error: "overflow" };
    // Amounts must be > 0 (isValidAmount). Reporting "negative" here is the
    // first of three guards against a sign flip — see formatResult.
    if (value < 0) return { ok: false, error: "negative" };
    return { ok: true, value };
};

// Render an evaluated result back into a string the amount field can hold.
// Returns "" for anything out of range: a negative would lose its sign inside
// filterAmountInput (which strips "-"), so "10-15" would silently become
// "5,00" and submit as a positive amount. Empty is the only safe answer, and
// callers must have already caught the "negative" error anyway.
export const formatResult = (
    n: number,
    sep: DecimalSeparator = ",",
    maxDecimals: number = 2,
): string => {
    if (!Number.isFinite(n) || n < 0 || n > MONEY_MAX_MAGNITUDE) return "";
    const fixed = n.toFixed(maxDecimals);
    // No Intl.NumberFormat: it would add thousands separators, and
    // filterAmountInput (one separator max) would mangle "1.234,56" into
    // "1.23". The final pass through it guarantees a value the field accepts.
    return filterAmountInput(
        sep === "." ? fixed : fixed.replace(".", ","),
        maxDecimals,
    );
};

// Single entry point shared by the calculator UI and the submit handlers:
// resolve whatever the amount field holds (a plain number or an expression)
// into the canonical field text plus its numeric value.
export const resolveAmountField = (
    val: string,
    sep: DecimalSeparator = ",",
    maxDecimals: number = 2,
):
    | { ok: true; text: string; value: number }
    | { ok: false; error: AmountEvalError } => {
    if (!hasAmountOperator(val)) {
        const n = parseAmount(val, sep);
        if (!Number.isFinite(n))
            return { ok: false, error: val.trim() ? "syntax" : "empty" };
        // Deliberately not reformatted: running "12" through formatResult
        // would rewrite it to "12,00" under the user's fingers on every blur.
        return {
            ok: true,
            text: filterAmountInput(val, maxDecimals),
            value: n,
        };
    }
    const evaluated = evaluateExpression(val, maxDecimals);
    if (!evaluated.ok) return evaluated;
    const text = formatResult(evaluated.value, sep, maxDecimals);
    return text
        ? { ok: true, text, value: evaluated.value }
        : { ok: false, error: "overflow" };
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
