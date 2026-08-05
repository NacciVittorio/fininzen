"use client";

import { useEffect, useRef, useState } from "react";
import type { PointerEvent, ReactNode } from "react";
import { createPortal } from "react-dom";
import { lockBodyScroll, unlockBodyScroll } from "./scrollLock";

// Reusable iOS-style bottom sheet: slides up from the bottom over a dimmed
// backdrop, with a drag-handle, safe-area padding, Escape-to-close, body
// scroll-lock, and drag-to-dismiss gesture on the handle.
//
// `header` and `footer` are optional pinned slots that stay put while only the
// children scroll — tall forms would otherwise bury their title and their
// Cancel/Save row below the fold. Sheets that pass neither render exactly as
// before.
type BottomSheetProps = {
    open?: boolean;
    onClose?: () => void;
    children?: ReactNode;
    header?: ReactNode;
    footer?: ReactNode;
    maxHeight?: number | string;
    ariaLabel?: string;
    panelClassName?: string;
};

export default function BottomSheet({
    open,
    onClose,
    children,
    header,
    footer,
    maxHeight = "88dvh",
    ariaLabel,
    panelClassName,
}: BottomSheetProps) {
    // mounted keeps the node alive through the close animation; shown drives the
    // enter/leave transition one frame after mount so the slide-up plays.
    const [mounted, setMounted] = useState(open);
    const [shown, setShown] = useState(false);

    // Drag-to-dismiss state
    const dragStartY = useRef<number | null>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    const onCloseRef = useRef(onClose);
    const previouslyFocusedRef = useRef<HTMLElement | null>(null);
    const [dragY, setDragY] = useState(0);

    useEffect(() => {
        onCloseRef.current = onClose;
    }, [onClose]);

    useEffect(() => {
        if (open) {
            setMounted(true);
            setDragY(0);
            let raf2: number;
            const raf1 = requestAnimationFrame(() => {
                raf2 = requestAnimationFrame(() => setShown(true));
            });
            return () => {
                cancelAnimationFrame(raf1);
                if (raf2) cancelAnimationFrame(raf2);
            };
        }
        setShown(false);
        const t = setTimeout(() => setMounted(false), 280);
        return () => clearTimeout(t);
    }, [open]);

    useEffect(() => {
        if (!mounted) return;
        previouslyFocusedRef.current =
            document.activeElement as HTMLElement | null;
        const focusableSelector = [
            "a[href]",
            "button:not([disabled])",
            "input:not([disabled])",
            "select:not([disabled])",
            "textarea:not([disabled])",
            '[tabindex]:not([tabindex="-1"])',
        ].join(",");
        const focusables = (): HTMLElement[] =>
            panelRef.current
                ? [
                      ...panelRef.current.querySelectorAll<HTMLElement>(
                          focusableSelector,
                      ),
                  ].filter(
                      (el) =>
                          !el.hasAttribute("disabled") &&
                          !el.getAttribute("aria-hidden"),
                  )
                : [];
        const focusFirst = () => {
            const items = focusables();
            // Auto-focusing a text field on open can trigger side effects
            // tied to "the user started editing" (e.g. AmountCalculator's
            // operator bar, or an OS keyboard popping up) even though this
            // is only the dialog's a11y initial focus, not real user intent
            // — prefer a non-text-entry focusable (a button, a link), and
            // only fall back to the first field if nothing else qualifies.
            const first =
                items.find(
                    (el) =>
                        !["INPUT", "TEXTAREA", "SELECT"].includes(
                            el.tagName,
                        ),
                ) ??
                items[0] ??
                panelRef.current;
            first?.focus({ preventScroll: true });
        };
        focusFirst();
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                onCloseRef.current?.();
                return;
            }
            if (e.key !== "Tab") return;
            const items = focusables();
            if (!items.length) {
                e.preventDefault();
                panelRef.current?.focus({ preventScroll: true });
                return;
            }
            const first = items[0];
            const last = items[items.length - 1];
            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last?.focus({ preventScroll: true });
            } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first?.focus({ preventScroll: true });
            }
        };
        document.addEventListener("keydown", onKey);
        lockBodyScroll();
        return () => {
            document.removeEventListener("keydown", onKey);
            unlockBodyScroll();
            const previous = previouslyFocusedRef.current;
            if (previous && typeof previous.focus === "function") {
                previous.focus({ preventScroll: true });
            }
        };
    }, [mounted]);

    // ── drag handle gesture handlers ──────────────────────────────────────────

    const onHandlePointerDown = (e: PointerEvent<HTMLDivElement>) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        dragStartY.current = e.clientY;
    };

    const onHandlePointerMove = (e: PointerEvent<HTMLDivElement>) => {
        if (dragStartY.current == null) return;
        const dy = Math.max(0, e.clientY - dragStartY.current);
        setDragY(dy);
    };

    const onHandlePointerUp = () => {
        if (dragStartY.current == null) return;
        dragStartY.current = null;
        if (dragY > 80) {
            onCloseRef.current?.();
        } else {
            setDragY(0);
        }
    };

    if (!mounted) return null;

    const isDragging = dragStartY.current != null;
    const sheetTranslate: number | string = shown ? dragY : "100%";
    const sheetTransition = isDragging
        ? "none"
        : "transform 0.3s cubic-bezier(.32,.72,0,1)";

    const sheet = (
        <div
            style={{
                position: "fixed",
                inset: 0,
                zIndex: 1100,
                display: "flex",
                flexDirection: "column",
                justifyContent: "flex-end",
            }}
        >
            <div
                aria-hidden="true"
                onClick={() => onCloseRef.current?.()}
                style={{
                    position: "absolute",
                    inset: 0,
                    background: "var(--backdrop-strong)",
                    opacity: shown ? Math.max(0, 1 - dragY / 200) : 0,
                    transition: isDragging ? "none" : "opacity 0.28s ease",
                    backdropFilter: "blur(2px)",
                    WebkitBackdropFilter: "blur(2px)",
                }}
            />
            <div
                ref={panelRef}
                role="dialog"
                aria-modal="true"
                aria-label={ariaLabel}
                tabIndex={-1}
                className={
                    panelClassName
                        ? `bottom-sheet__panel ${panelClassName}`
                        : "bottom-sheet__panel"
                }
                onClick={(e) => e.stopPropagation()}
                style={{
                    position: "relative",
                    background: "var(--card)",
                    color: "var(--fg)",
                    borderTopLeftRadius: 24,
                    borderTopRightRadius: 24,
                    borderTop: "1px solid var(--rule)",
                    maxHeight,
                    display: "flex",
                    flexDirection: "column",
                    transform: `translateY(${typeof sheetTranslate === "number" ? sheetTranslate + "px" : sheetTranslate})`,
                    transition: sheetTransition,
                    boxShadow: "var(--shadow-deep)",
                    // --amount-bar-h is set on <html> by AmountCalculator's
                    // operator bar, which docks above the OS keyboard —
                    // i.e. exactly over a sheet's pinned Cancel/Save row.
                    // Padding by its height makes room instead of overlapping;
                    // the 0px fallback leaves every other sheet unchanged.
                    paddingBottom:
                        "calc(max(20px, env(safe-area-inset-bottom)) + var(--amount-bar-h, 0px))",
                }}
            >
                {/* Drag handle — touch/pointer target for dismiss gesture */}
                <div
                    onPointerDown={onHandlePointerDown}
                    onPointerMove={onHandlePointerMove}
                    onPointerUp={onHandlePointerUp}
                    onPointerCancel={onHandlePointerUp}
                    style={{
                        display: "flex",
                        justifyContent: "center",
                        padding: "10px 0 4px",
                        flexShrink: 0,
                        cursor: "grab",
                        touchAction: "none",
                    }}
                >
                    <div
                        style={{
                            width: 38,
                            height: 5,
                            borderRadius: 99,
                            background: "var(--rule)",
                            transition: isDragging
                                ? "none"
                                : "background 0.15s",
                        }}
                    />
                </div>
                {header != null && (
                    <div
                        style={{
                            flexShrink: 0,
                            padding: "0 18px 10px",
                            borderBottom: "1px solid var(--rule)",
                        }}
                    >
                        {header}
                    </div>
                )}
                {/* `flex: 1 1 auto` + `minHeight: 0` lets this shrink so the
                    pinned slots survive the panel's maxHeight clamp; with short
                    content the panel still sizes to its children. */}
                <div
                    style={{
                        flex: "1 1 auto",
                        minHeight: 0,
                        overflowY: "auto",
                        WebkitOverflowScrolling: "touch",
                    }}
                >
                    {children}
                </div>
                {footer != null && (
                    <div
                        style={{
                            flexShrink: 0,
                            padding: "12px 18px 0",
                            borderTop: "1px solid var(--rule)",
                        }}
                    >
                        {footer}
                    </div>
                )}
            </div>
        </div>
    );

    // Render into document.body so the fixed-position overlay is anchored to the
    // viewport, not to any ancestor that establishes a containing block (e.g. a
    // PullToRefresh wrapper applying `transform`). Safari pins position:fixed to
    // the nearest transformed ancestor, which left the sheet off-screen.
    return typeof document !== "undefined"
        ? createPortal(sheet, document.body)
        : sheet;
}
