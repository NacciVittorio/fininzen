"use client";

import {
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useReducer,
    useRef,
    useState,
} from "react";
import { createPortal } from "react-dom";
import Icon from "./ui/Icons";
import {
    evaluateExpression,
    filterAmountExpression,
    filterAmountInput,
    formatResult,
    hasAmountOperator,
    resolveAmountField,
} from "../utils/formatters";
import type { AmountEvalError, DecimalSeparator } from "../utils/formatters";
import type { Translator } from "../types";
import type {
    CSSProperties,
    KeyboardEvent as ReactKeyboardEvent,
    ReactNode,
    RefObject,
} from "react";

// Amount field that also accepts a small arithmetic expression, two ways:
//   1. typed inline ("12,50+8,30") and resolved with "=" / Enter / blur;
//   2. composed on an on-screen keypad — the only way to reach the operators
//      on mobile, where inputMode="decimal" has none.
// Both paths run the same evaluator from utils/formatters, so the maths (and
// its rounding and its guards) exists once.
//
// Currently wired into the three CashFlow movement forms; PacModal and
// RecurringExpenseModal use the same field shape and could adopt it as-is.

const ERROR_KEY: Record<AmountEvalError, string> = {
    empty: "calc_err_syntax",
    syntax: "calc_err_syntax",
    divzero: "calc_err_divzero",
    overflow: "calc_err_overflow",
    negative: "calc_err_negative",
};

// The in-field controls sit inside a 42px-tall .inp, so they cannot be 44px:
// the keypad keys are where the fat-finger target size applies.
const EQ_SIZE = 32;
const TRIGGER_SIZE = 36;
const CLUSTER_RIGHT = 8;
const CLUSTER_GAP = 2;
const SUFFIX_WIDTH = 34;
const PADDING_RIGHT_BASE =
    CLUSTER_RIGHT + EQ_SIZE + CLUSTER_GAP + TRIGGER_SIZE + 8;

const MOBILE_BREAKPOINT = 640;
const PAD_MIN_WIDTH = 260;
// Rough keypad height, used only to decide whether to flip above the field.
const PAD_EST_HEIGHT = 400;
const PAD_Z_INDEX = 1300; // above BottomSheet (1100), like Select's portal
const PAD_BACKDROP_Z_INDEX = PAD_Z_INDEX - 1;

export type AmountCalculatorProps = {
    id?: string;
    value: string;
    onChange: (next: string) => void;
    decimalSeparator: DecimalSeparator;
    T: Translator;
    placeholder?: string;
    /** Rendered inside the field, right of the controls (e.g. "EUR"). */
    suffix?: ReactNode;
    /** Clears the parent form's submit error on the first keystroke. */
    onFocusClearError?: () => void;
    disabled?: boolean;
    "data-testid"?: string;
};

// ── Keypad state ───────────────────────────────────────────────────────────
// The pad edits an expression string, not the accumulator/pending/entry triple
// of a classic calculator. That shares every line of maths with the inline
// path and gets operator precedence for free (an immediate-execution pad gets
// 2+3×4 wrong).

type PadState = { expr: string; error: AmountEvalError | null };

type PadAction =
    | { type: "append"; ch: string }
    | { type: "backspace" }
    | { type: "clearEntry" }
    | { type: "clearAll" }
    | { type: "equals" };

// The separator is captured in the closure rather than carried on every
// action, so the key table below stays a plain data structure.
const makeReducer =
    (sep: DecimalSeparator) =>
    (state: PadState, action: PadAction): PadState => {
        switch (action.type) {
            case "append":
                // filterAmountExpression is the only validator, so the pad can
                // never produce a string the inline field could not.
                return {
                    expr: filterAmountExpression(state.expr + action.ch),
                    error: null,
                };
            case "backspace":
                return { expr: state.expr.slice(0, -1), error: null };
            case "clearEntry": {
                // Drop the literal being typed, keep the operator before it.
                const cut = state.expr.search(/[+\-*/][^+\-*/]*$/);
                return {
                    expr: cut < 0 ? "" : state.expr.slice(0, cut + 1),
                    error: null,
                };
            }
            case "clearAll":
                return { expr: "", error: null };
            case "equals": {
                const result = evaluateExpression(state.expr);
                if (!result.ok) return { ...state, error: result.error };
                // Keep the result in the display so it can be operated on
                // further.
                return { expr: formatResult(result.value, sep), error: null };
            }
        }
    };

type PadKey = {
    id: string;
    label: string;
    ariaKey?: string;
    action: PadAction;
    tone: "digit" | "operator" | "utility";
};

function buildKeys(sep: DecimalSeparator): PadKey[] {
    const sepChar = sep === "." ? "." : ",";
    const digit = (d: string): PadKey => ({
        id: d,
        label: d,
        action: { type: "append", ch: d },
        tone: "digit",
    });
    const operator = (
        id: string,
        label: string,
        ch: string,
        ariaKey: string,
    ): PadKey => ({
        id,
        label,
        ariaKey,
        action: { type: "append", ch },
        tone: "operator",
    });
    return [
        {
            id: "ac",
            label: "AC",
            ariaKey: "calc_clear_all",
            action: { type: "clearAll" },
            tone: "utility",
        },
        {
            id: "c",
            label: "C",
            ariaKey: "calc_clear_entry",
            action: { type: "clearEntry" },
            tone: "utility",
        },
        {
            id: "back",
            label: "⌫",
            ariaKey: "calc_backspace",
            action: { type: "backspace" },
            tone: "utility",
        },
        operator("div", "÷", "/", "calc_op_div"),
        digit("7"),
        digit("8"),
        digit("9"),
        operator("mul", "×", "*", "calc_op_mul"),
        digit("4"),
        digit("5"),
        digit("6"),
        operator("minus", "−", "-", "calc_op_sub"),
        digit("1"),
        digit("2"),
        digit("3"),
        operator("plus", "+", "+", "calc_op_add"),
        digit("0"),
        {
            id: "sep",
            label: sepChar,
            ariaKey: "calc_decimal_sep",
            action: { type: "append", ch: sepChar },
            tone: "digit",
        },
        {
            id: "equals",
            label: "=",
            ariaKey: "calc_equals",
            action: { type: "equals" },
            tone: "operator",
        },
    ];
}

function CalculatorPad({
    anchorRef,
    seed,
    decimalSeparator,
    T,
    onApply,
    onClose,
}: {
    anchorRef: RefObject<HTMLDivElement | null>;
    seed: string;
    decimalSeparator: DecimalSeparator;
    T: Translator;
    onApply: (text: string) => void;
    onClose: () => void;
}) {
    const panelRef = useRef<HTMLDivElement | null>(null);
    const reducer = useMemo(
        () => makeReducer(decimalSeparator),
        [decimalSeparator],
    );
    const [state, dispatch] = useReducer(reducer, {
        expr: filterAmountExpression(seed),
        error: null,
    });
    const [style, setStyle] = useState<CSSProperties>({
        position: "fixed",
        left: -9999,
        top: -9999,
        zIndex: PAD_Z_INDEX,
    });

    const keys = useMemo(() => buildKeys(decimalSeparator), [decimalSeparator]);
    const preview = useMemo(
        () => (state.expr ? evaluateExpression(state.expr) : null),
        [state.expr],
    );

    // Position: docked to the bottom of the viewport on phones (the pad is
    // ~400px tall and rarely fits above or below a field inside a sheet), and
    // anchored to the field on desktop — same viewport-aware maths as Select.
    useLayoutEffect(() => {
        const position = () => {
            const vv = window.visualViewport;
            const viewportWidth = vv?.width || window.innerWidth;
            const viewportHeight = vv?.height || window.innerHeight;
            const viewportTop = vv?.offsetTop || 0;
            const margin = 8;

            if (viewportWidth < MOBILE_BREAKPOINT) {
                setStyle({
                    position: "fixed",
                    left: margin,
                    right: margin,
                    bottom: `max(${margin}px, env(safe-area-inset-bottom))`,
                    zIndex: PAD_Z_INDEX,
                });
                return;
            }

            const anchor = anchorRef.current;
            if (!anchor) return;
            const rect = anchor.getBoundingClientRect();
            const width = Math.round(
                Math.max(
                    PAD_MIN_WIDTH,
                    Math.min(rect.width, viewportWidth - 2 * margin),
                ),
            );
            const bottomSpace =
                viewportTop + viewportHeight - rect.bottom - margin;
            const topSpace = rect.top - viewportTop - margin;
            const openAbove =
                bottomSpace < PAD_EST_HEIGHT && topSpace > bottomSpace;
            const left = Math.min(
                Math.max(rect.left, margin),
                Math.max(margin, viewportWidth - width - margin),
            );
            const base: CSSProperties = {
                position: "fixed",
                left: Math.round(left),
                width,
                zIndex: PAD_Z_INDEX,
            };
            setStyle(
                openAbove
                    ? {
                          ...base,
                          bottom: Math.round(
                              window.innerHeight - (rect.top - 4),
                          ),
                      }
                    : {
                          ...base,
                          top: Math.max(
                              viewportTop + margin,
                              Math.round(rect.bottom + 4),
                          ),
                      },
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
    }, [anchorRef]);

    // Escape, in the CAPTURE phase: BottomSheet listens on document in the
    // bubble phase and would otherwise close the whole sheet. Stopping the
    // dispatch here means it never sees the event.
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== "Escape") return;
            e.preventDefault();
            e.stopImmediatePropagation();
            onClose();
        };
        document.addEventListener("keydown", onKey, true);
        return () => document.removeEventListener("keydown", onKey, true);
    }, [onClose]);

    // Focus the first key on open. The caller has already blurred the input,
    // so the OS keyboard is down and the pad is fully visible.
    useEffect(() => {
        panelRef.current?.querySelector<HTMLElement>("button")?.focus();
    }, []);

    // Tab trap local to the panel. It cannot fight BottomSheet's own trap:
    // the pad is portalled outside the sheet's panelRef, so the sheet never
    // sees its own first/last element focused while the pad is open.
    const onPanelKeyDown = (e: ReactKeyboardEvent) => {
        if (e.key !== "Tab" || !panelRef.current) return;
        const focusables = [
            ...panelRef.current.querySelectorAll<HTMLElement>(
                "button:not([disabled])",
            ),
        ];
        if (focusables.length === 0) return;
        const first = focusables[0]!;
        const last = focusables[focusables.length - 1]!;
        if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
        }
    };

    const applyDisabled = !preview?.ok;
    const apply = () => {
        if (!preview?.ok) return;
        // A plain number keeps the text the user typed ("12" stays "12");
        // only a computed result is normalised to two decimals.
        onApply(
            hasAmountOperator(state.expr)
                ? formatResult(preview.value, decimalSeparator)
                : filterAmountInput(state.expr),
        );
    };

    const keyStyle = (tone: PadKey["tone"]): CSSProperties => ({
        minHeight: "var(--btn-min)",
        borderRadius: "var(--r-input)",
        border: "1px solid var(--rule)",
        background: tone === "operator" ? "transparent" : "var(--card-inset)",
        color:
            tone === "operator"
                ? "var(--accent)"
                : tone === "utility"
                  ? "var(--fg-soft)"
                  : "var(--fg)",
        fontSize: 18,
        fontFamily: "inherit",
        cursor: "pointer",
    });

    const pad = (
        <>
            {/* The pad's own backdrop. Without it a tap outside would reach
                BottomSheet's backdrop and close the whole sheet, losing the
                form. It also replaces the document-level mousedown listener
                that Select uses for click-outside. */}
            <div
                onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onClose();
                }}
                onClick={(e) => e.stopPropagation()}
                style={{
                    position: "fixed",
                    inset: 0,
                    zIndex: PAD_BACKDROP_Z_INDEX,
                    background: "transparent",
                }}
            />
            <div
                ref={panelRef}
                role="dialog"
                aria-modal="true"
                aria-label={T("calc_title")}
                data-testid="amount-calculator-pad"
                onKeyDown={onPanelKeyDown}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
                style={{
                    ...style,
                    background: "var(--card)",
                    border: "1px solid var(--rule)",
                    borderRadius: 14,
                    boxShadow: "var(--shadow-deep)",
                    padding: 12,
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                }}
            >
                <div
                    style={{
                        background: "var(--card-inset)",
                        border: "1px solid var(--rule)",
                        borderRadius: "var(--r-input)",
                        padding: "8px 12px",
                        minHeight: 52,
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "flex-end",
                        justifyContent: "center",
                        gap: 2,
                    }}
                >
                    <div
                        data-testid="calc-display"
                        style={{
                            fontFamily: "var(--font-mono)",
                            fontSize: 18,
                            color: "var(--fg)",
                            wordBreak: "break-all",
                            textAlign: "right",
                        }}
                    >
                        {state.expr || "0"}
                    </div>
                    <div
                        data-testid="calc-preview"
                        style={{
                            fontSize: 13,
                            color: state.error
                                ? "var(--danger)"
                                : "var(--fg-soft)",
                        }}
                    >
                        {state.error
                            ? T(ERROR_KEY[state.error])
                            : preview?.ok
                              ? `= ${formatResult(preview.value, decimalSeparator)}`
                              : preview
                                ? T(ERROR_KEY[preview.error])
                                : ""}
                    </div>
                </div>

                <div
                    style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(4, 1fr)",
                        gap: 8,
                    }}
                >
                    {keys.map((key) => (
                        <button
                            key={key.id}
                            type="button"
                            data-testid={`calc-key-${key.id}`}
                            aria-label={
                                key.ariaKey ? T(key.ariaKey) : undefined
                            }
                            onClick={() => dispatch(key.action)}
                            style={keyStyle(key.tone)}
                        >
                            {key.label}
                        </button>
                    ))}
                </div>

                <button
                    type="button"
                    data-testid="calc-apply"
                    disabled={applyDisabled}
                    onClick={apply}
                    style={{
                        minHeight: "var(--btn-min)",
                        borderRadius: "var(--r-input)",
                        border: "1px solid var(--accent)",
                        background: applyDisabled
                            ? "var(--card-inset)"
                            : "var(--accent)",
                        color: applyDisabled ? "var(--fg-soft)" : "#fff",
                        borderColor: applyDisabled
                            ? "var(--rule)"
                            : "var(--accent)",
                        fontSize: 16,
                        fontFamily: "inherit",
                        fontWeight: 600,
                        cursor: applyDisabled ? "default" : "pointer",
                    }}
                >
                    {T("calc_apply")}
                </button>
            </div>
        </>
    );

    return typeof document !== "undefined"
        ? createPortal(pad, document.body)
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
    const fieldRef = useRef<HTMLDivElement | null>(null);
    const inputRef = useRef<HTMLInputElement | null>(null);
    const triggerRef = useRef<HTMLButtonElement | null>(null);
    const [padOpen, setPadOpen] = useState(false);
    const [error, setError] = useState<AmountEvalError | null>(null);

    const showEquals = hasAmountOperator(value);

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

    const closePad = useCallback(() => {
        setPadOpen(false);
        // Back to the trigger, not the input: refocusing the input would raise
        // the OS keyboard again right after applying a value.
        triggerRef.current?.focus();
    }, []);

    const paddingRight = PADDING_RIGHT_BASE + (suffix ? SUFFIX_WIDTH : 0);

    const controlStyle: CSSProperties = {
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "transparent",
        border: "none",
        padding: 0,
        cursor: "pointer",
        color: "var(--fg-soft)",
    };

    return (
        <div>
            <div ref={fieldRef} style={{ position: "relative" }}>
                <input
                    ref={inputRef}
                    id={id}
                    className="inp"
                    type="text"
                    // "none" while the pad is open so the OS keyboard does not
                    // fight it for screen space.
                    inputMode={padOpen ? "none" : "decimal"}
                    placeholder={placeholder}
                    data-testid={testId}
                    disabled={disabled}
                    style={{ paddingRight }}
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
                    onBlur={(event) => {
                        if (
                            event.relatedTarget instanceof Element &&
                            event.relatedTarget.closest(
                                '[data-testid="amount-calculator-pad"]',
                            )
                        )
                            return;
                        if (hasAmountOperator(value)) commit();
                    }}
                />
                <div
                    style={{
                        position: "absolute",
                        right: CLUSTER_RIGHT,
                        top: "50%",
                        transform: "translateY(-50%)",
                        display: "flex",
                        alignItems: "center",
                        gap: CLUSTER_GAP,
                    }}
                >
                    {/* Kept mounted and merely hidden so paddingRight never
                        changes mid-typing (which would reflow the text under
                        the user's fingers). */}
                    <button
                        type="button"
                        data-testid="amount-equals"
                        aria-label={T("calc_equals")}
                        aria-hidden={!showEquals}
                        tabIndex={showEquals ? 0 : -1}
                        // Without this the input blurs first, commits, and the
                        // click lands on a button that is already hidden.
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={commit}
                        style={{
                            ...controlStyle,
                            width: EQ_SIZE,
                            height: EQ_SIZE,
                            color: "var(--accent)",
                            fontSize: 18,
                            fontFamily: "inherit",
                            visibility: showEquals ? "visible" : "hidden",
                            pointerEvents: showEquals ? "auto" : "none",
                        }}
                    >
                        =
                    </button>
                    <button
                        ref={triggerRef}
                        type="button"
                        data-testid="amount-calc-trigger"
                        aria-label={T("calc_open")}
                        aria-haspopup="dialog"
                        aria-expanded={padOpen}
                        disabled={disabled}
                        // Same reason as above: a blur-commit here would open
                        // the pad already seeded with the result.
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => {
                            inputRef.current?.blur();
                            setError(null);
                            setPadOpen(true);
                        }}
                        style={{
                            ...controlStyle,
                            width: TRIGGER_SIZE,
                            height: TRIGGER_SIZE,
                        }}
                    >
                        <Icon name="calculator" size={18} />
                    </button>
                    {suffix != null && (
                        <span
                            style={{
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
            {padOpen && (
                <CalculatorPad
                    anchorRef={fieldRef}
                    seed={value}
                    decimalSeparator={decimalSeparator}
                    T={T}
                    onApply={(text) => {
                        onFocusClearError?.();
                        setError(null);
                        onChange(text);
                        closePad();
                    }}
                    onClose={closePad}
                />
            )}
        </div>
    );
}
