"use client";

import {
    useCallback,
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
} from "react";
import { createPortal } from "react-dom";
import {
    filterAmountExpression,
    hasAmountOperator,
    resolveAmountField,
} from "../utils/formatters";
import type { AmountEvalError, DecimalSeparator } from "../utils/formatters";
import type { Translator } from "../types";
import type { CSSProperties, ReactNode } from "react";

// Amount field that also accepts a small arithmetic expression, two ways:
//   1. typed inline ("12,50+8,30") and resolved with Enter or on blur;
//   2. composed with the operator bar that docks above the OS keyboard, the
//      only way to reach the operators on a phone, where inputMode="decimal"
//      has none.
// Both paths run the same evaluator from utils/formatters, so the maths (and
// its rounding and its guards) exists once.
//
// The field itself carries no buttons: the bar is the whole of the extra
// chrome, and it exists only while the field has focus on a narrow viewport.
//
// Currently wired into the three CashFlow movement forms and the Portfolio
// add-transaction sheet; PacModal and RecurringExpenseModal use the same field
// shape and could adopt it as-is.

const ERROR_KEY: Record<AmountEvalError, string> = {
    empty: "calc_err_syntax",
    syntax: "calc_err_syntax",
    divzero: "calc_err_divzero",
    overflow: "calc_err_overflow",
    negative: "calc_err_negative",
};

// The suffix ("EUR") is the only thing inside the field, pinned right.
const SUFFIX_WIDTH = 34;
const SUFFIX_RIGHT = 12;

const MOBILE_BREAKPOINT = 640;
const BAR_HEIGHT = 48;
const BAR_Z_INDEX = 1300; // above BottomSheet (1100), like Select's portal
// Published on <html> while the bar is up and read by BottomSheet's panel
// padding: docked above the keyboard, the bar lands exactly where a sheet's
// Cancel/Save row is and would otherwise bury it.
const BAR_HEIGHT_VAR = "--amount-bar-h";

export type AmountCalculatorProps = {
    id?: string;
    value: string;
    onChange: (next: string) => void;
    decimalSeparator: DecimalSeparator;
    T: Translator;
    placeholder?: string;
    /** Rendered inside the field, pinned right (e.g. "EUR"). */
    suffix?: ReactNode;
    /** Clears the parent form's submit error on the first keystroke. */
    onFocusClearError?: () => void;
    disabled?: boolean;
    "data-testid"?: string;
};

// ── Operator bar ───────────────────────────────────────────────────────────
// Only the keys the OS decimal pad is missing. Digits and the decimal
// separator are deliberately absent: the native pad already has them, and it
// is faster and more familiar than anything rendered here.

type BarAction =
    { type: "insert"; ch: string } | { type: "backspace" } | { type: "equals" };

type BarKey = {
    id: string;
    label: string;
    ariaKey: string;
    action: BarAction;
    tone: "operator" | "utility";
};

// Unicode glyphs on the keys, ASCII into the field — normalizeOperators would
// fold "×" to "*" anyway, but keeping the field ASCII means what the user sees
// typed is what the parser reads.
const BAR_KEYS: BarKey[] = [
    {
        id: "plus",
        label: "+",
        ariaKey: "calc_op_add",
        action: { type: "insert", ch: "+" },
        tone: "operator",
    },
    {
        id: "minus",
        label: "−",
        ariaKey: "calc_op_sub",
        action: { type: "insert", ch: "-" },
        tone: "operator",
    },
    {
        id: "mul",
        label: "×",
        ariaKey: "calc_op_mul",
        action: { type: "insert", ch: "*" },
        tone: "operator",
    },
    {
        id: "div",
        label: "÷",
        ariaKey: "calc_op_div",
        action: { type: "insert", ch: "/" },
        tone: "operator",
    },
    {
        id: "back",
        label: "⌫",
        ariaKey: "calc_backspace",
        action: { type: "backspace" },
        tone: "utility",
    },
    {
        id: "equals",
        label: "=",
        ariaKey: "calc_equals",
        action: { type: "equals" },
        tone: "operator",
    },
];

function OperatorBar({
    T,
    onAction,
}: {
    T: Translator;
    onAction: (action: BarAction) => void;
}) {
    const [bottom, setBottom] = useState(0);

    // Dock to the bottom edge of the *visual* viewport. Anchoring the bar's
    // bottom — rather than computing a top from its height — is what makes one
    // formula work on both systems: on iOS innerHeight stays full while
    // visualViewport.height shrinks, so this resolves to the keyboard's height;
    // on Android, with interactive-widget=resizes-content in layout.tsx,
    // innerHeight shrinks along with the keyboard and this resolves to ~0.
    // Either way the bar sits right on top of the keys.
    useLayoutEffect(() => {
        const position = () => {
            const vv = window.visualViewport;
            if (!vv) {
                setBottom(0);
                return;
            }
            setBottom(
                Math.max(
                    0,
                    Math.round(window.innerHeight - (vv.offsetTop + vv.height)),
                ),
            );
        };

        position();
        window.addEventListener("resize", position);
        window.addEventListener("scroll", position, true);
        window.visualViewport?.addEventListener("resize", position);
        window.visualViewport?.addEventListener("scroll", position);
        return () => {
            window.removeEventListener("resize", position);
            window.removeEventListener("scroll", position, true);
            window.visualViewport?.removeEventListener("resize", position);
            window.visualViewport?.removeEventListener("scroll", position);
        };
    }, []);

    useEffect(() => {
        const root = document.documentElement;
        root.style.setProperty(BAR_HEIGHT_VAR, `${BAR_HEIGHT}px`);
        return () => {
            root.style.removeProperty(BAR_HEIGHT_VAR);
        };
    }, []);

    const keyStyle = (tone: BarKey["tone"]): CSSProperties => ({
        flex: 1,
        border: "none",
        background: "transparent",
        color: tone === "operator" ? "var(--accent)" : "var(--fg-soft)",
        fontSize: 20,
        fontFamily: "inherit",
        cursor: "pointer",
    });

    const bar = (
        <div
            role="toolbar"
            aria-label={T("calc_title")}
            data-testid="amount-operator-bar"
            style={{
                position: "fixed",
                left: 0,
                right: 0,
                bottom,
                zIndex: BAR_Z_INDEX,
                height: BAR_HEIGHT,
                display: "flex",
                alignItems: "stretch",
                background: "var(--card)",
                borderTop: "1px solid var(--rule)",
                boxShadow: "var(--shadow-deep)",
            }}
        >
            {BAR_KEYS.map((key) => (
                <button
                    key={key.id}
                    type="button"
                    data-testid={`calc-bar-${key.id}`}
                    aria-label={T(key.ariaKey)}
                    // The bar is portalled outside BottomSheet's panel, so in
                    // the tab order it would fight the sheet's own Tab trap.
                    // It is also a touch-only affordance: a hardware keyboard
                    // already has every one of these keys.
                    tabIndex={-1}
                    // Without this the input blurs on press, the OS keyboard
                    // drops, and the bar rides down with it.
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => onAction(key.action)}
                    style={keyStyle(key.tone)}
                >
                    {key.label}
                </button>
            ))}
        </div>
    );

    return typeof document !== "undefined"
        ? createPortal(bar, document.body)
        : null;
}

export default function AmountCalculator({
    id,
    value,
    onChange,
    decimalSeparator,
    T,
    placeholder,
    suffix,
    onFocusClearError,
    disabled,
    "data-testid": testId,
}: AmountCalculatorProps) {
    const inputRef = useRef<HTMLInputElement | null>(null);
    const pendingCaret = useRef<number | null>(null);
    const [focused, setFocused] = useState(false);
    const [narrow, setNarrow] = useState(false);
    const [error, setError] = useState<AmountEvalError | null>(null);

    // The bar exists to make up for an OS keyboard without operators, so it is
    // gated on viewport width rather than on (pointer: coarse): the Playwright
    // suite runs at 390×844 without hasTouch, and a coarse-pointer gate would
    // make the bar untestable.
    useEffect(() => {
        const query = window.matchMedia(
            `(max-width: ${MOBILE_BREAKPOINT - 1}px)`,
        );
        const sync = () => setNarrow(query.matches);
        sync();
        query.addEventListener("change", sync);
        return () => query.removeEventListener("change", sync);
    }, []);

    // Resolve the field into a plain amount. On failure the text is left
    // exactly as typed — never rewritten into something that looks valid.
    const commit = useCallback(() => {
        if (!value.trim()) return;
        const resolved = resolveAmountField(value, decimalSeparator);
        if (!resolved.ok) {
            setError(resolved.error);
            return;
        }
        setError(null);
        if (resolved.text !== value) onChange(resolved.text);
    }, [value, decimalSeparator, onChange]);

    // The value is owned by the parent, so without this the caret would jump to
    // the end of the text after every bar key.
    useLayoutEffect(() => {
        const caret = pendingCaret.current;
        if (caret == null) return;
        pendingCaret.current = null;
        inputRef.current?.setSelectionRange(caret, caret);
    }, [value]);

    const replaceRange = (from: number, to: number, chunk: string) => {
        const next = filterAmountExpression(
            value.slice(0, from) + chunk + value.slice(to),
        );
        // filterAmountExpression is the only validator, so the bar can never
        // produce a string the inline field could not — which also means it can
        // drop the chunk (a second operator in a row, a third decimal). Derive
        // the caret from how much the string actually grew, not from
        // chunk.length.
        const kept = next.length - (value.length - (to - from));
        pendingCaret.current = Math.min(next.length, Math.max(0, from + kept));
        onFocusClearError?.();
        setError(null);
        onChange(next);
    };

    const onBarAction = (action: BarAction) => {
        if (action.type === "equals") {
            commit();
            return;
        }
        const input = inputRef.current;
        if (!input) return;
        const start = input.selectionStart ?? value.length;
        const end = input.selectionEnd ?? start;
        if (action.type === "insert") {
            replaceRange(start, end, action.ch);
            return;
        }
        // Backspace with nothing selected eats the character before the caret.
        replaceRange(start === end ? Math.max(0, start - 1) : start, end, "");
    };

    return (
        <div>
            <div style={{ position: "relative" }}>
                <input
                    ref={inputRef}
                    id={id}
                    className="inp"
                    type="text"
                    // Not type="number": it would reject "+", "*" and "/"
                    // outright, and the whole point of the field is that they
                    // can be typed.
                    inputMode="decimal"
                    placeholder={placeholder}
                    data-testid={testId}
                    disabled={disabled}
                    style={{
                        paddingRight: suffix
                            ? SUFFIX_WIDTH + SUFFIX_RIGHT
                            : undefined,
                    }}
                    value={value}
                    onChange={(event) => {
                        onFocusClearError?.();
                        setError(null);
                        onChange(filterAmountExpression(event.target.value));
                    }}
                    onKeyDown={(event) => {
                        if (event.key !== "Enter") return;
                        event.preventDefault(); // never let it submit the form
                        commit();
                    }}
                    onFocus={() => setFocused(true)}
                    onBlur={(event) => {
                        // Belt and braces: the bar's keys are tabIndex={-1} and
                        // preventDefault their mousedown, so focus should never
                        // land there — but if it ever does, the bar is still
                        // being used and the field is not really leaving focus.
                        if (
                            event.relatedTarget instanceof Element &&
                            event.relatedTarget.closest(
                                '[data-testid="amount-operator-bar"]',
                            )
                        )
                            return;
                        setFocused(false);
                        if (hasAmountOperator(value)) commit();
                    }}
                />
                {suffix != null && (
                    <span
                        style={{
                            position: "absolute",
                            right: SUFFIX_RIGHT,
                            top: "50%",
                            transform: "translateY(-50%)",
                            color: "var(--fg-soft)",
                            fontFamily: "var(--font-mono)",
                            fontSize: 13,
                            pointerEvents: "none",
                        }}
                    >
                        {suffix}
                    </span>
                )}
            </div>
            {error && (
                <div
                    data-testid="amount-error"
                    style={{
                        fontSize: 12,
                        color: "var(--danger)",
                        marginTop: 6,
                    }}
                >
                    {T(ERROR_KEY[error])}
                </div>
            )}
            {focused && narrow && <OperatorBar T={T} onAction={onBarAction} />}
        </div>
    );
}
