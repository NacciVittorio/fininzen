"use client";

import { useEffect, useId, useRef } from "react";
import type { ReactNode } from "react";

const FOCUSABLE = [
    "a[href]",
    "button:not([disabled])",
    "textarea:not([disabled])",
    'input:not([disabled]):not([type="hidden"])',
    "select:not([disabled])",
    '[tabindex]:not([tabindex="-1"])',
].join(",");

export default function Modal({
    title,
    onClose,
    children,
}: {
    title?: ReactNode;
    onClose?: () => void;
    children?: ReactNode;
}) {
    const innerRef = useRef<HTMLDivElement>(null);
    const onCloseRef = useRef(onClose);
    const titleId = useId();

    useEffect(() => {
        onCloseRef.current = onClose;
    }, [onClose]);

    useEffect(() => {
        const previouslyFocused = document.activeElement as HTMLElement | null;
        // Focus the first focusable element in the modal so screen readers and
        // keyboard users land inside the dialog instead of stranded in the body.
        const first = innerRef.current?.querySelector<HTMLElement>(FOCUSABLE);
        (first || innerRef.current)?.focus({ preventScroll: true });

        return () => {
            if (
                previouslyFocused &&
                typeof previouslyFocused.focus === "function"
            ) {
                previouslyFocused.focus({ preventScroll: true });
            }
        };
    }, []);

    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                onCloseRef.current?.();
                return;
            }
            if (e.key !== "Tab" || !innerRef.current) return;
            // Focus trap: rotate Tab/Shift+Tab between the modal's focusables.
            const nodes =
                innerRef.current.querySelectorAll<HTMLElement>(FOCUSABLE);
            if (nodes.length === 0) {
                e.preventDefault();
                innerRef.current.focus({ preventScroll: true });
                return;
            }
            const first = nodes[0];
            const last = nodes[nodes.length - 1];
            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last?.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first?.focus();
            }
        };
        document.addEventListener("keydown", handler);
        return () => {
            document.removeEventListener("keydown", handler);
        };
    }, []);

    return (
        <div
            style={{
                position: "fixed",
                inset: 0,
                background: "var(--backdrop-strong)",
                backdropFilter: "blur(6px)",
                WebkitBackdropFilter: "blur(6px)",
                zIndex: 1100,
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "center",
                padding:
                    "max(12px, calc(env(safe-area-inset-top) + 12px)) 16px max(12px, calc(env(safe-area-inset-bottom) + 12px))",
                overflowY: "auto",
            }}
            onClick={onClose}
        >
            <div
                ref={innerRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={title ? titleId : undefined}
                tabIndex={-1}
                style={{
                    background: "var(--card)",
                    color: "var(--fg)",
                    border: "1px solid var(--rule)",
                    borderRadius: 20,
                    boxShadow: "var(--shadow-modal)",
                    padding: 28,
                    width: "100%",
                    maxWidth: "min(440px, calc(100vw - 32px))",
                    maxHeight:
                        "calc(100dvh - 24px - env(safe-area-inset-top) - env(safe-area-inset-bottom))",
                    overflowY: "auto",
                    WebkitOverflowScrolling: "touch",
                    flexShrink: 0,
                }}
                className="modal-inner"
                onClick={(e) => e.stopPropagation()}
            >
                {title && (
                    <div
                        id={titleId}
                        style={{
                            fontSize: 17,
                            fontWeight: 600,
                            marginBottom: 20,
                            color: "var(--fg)",
                        }}
                    >
                        {title}
                    </div>
                )}
                {children}
            </div>
        </div>
    );
}
