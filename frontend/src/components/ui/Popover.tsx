import { useEffect, useRef } from "react";
import type { ReactNode, RefObject } from "react";

type PopoverProps = {
    open?: boolean;
    onClose?: () => void;
    anchorRef?: RefObject<HTMLElement | null>;
    children?: ReactNode;
    align?: "start" | "end" | "center";
    offset?: number;
    minWidth?: number;
    maxWidth?: number;
    zIndex?: number;
};

export default function Popover({
    open,
    onClose,
    anchorRef,
    children,
    align = "start",
    offset = 8,
    minWidth = 240,
    maxWidth = 360,
    zIndex = 340,
}: PopoverProps) {
    const ref = useRef<HTMLDivElement>(null);
    const onCloseRef = useRef(onClose);
    useEffect(() => {
        onCloseRef.current = onClose;
    });

    // Click-outside + Escape — stable listener (onClose via ref, not dep)
    useEffect(() => {
        if (!open) return;
        const handleClick = (e: MouseEvent) => {
            const target = e.target as Node;
            if (ref.current?.contains(target)) return;
            if (anchorRef?.current?.contains(target)) return;
            onCloseRef.current?.();
        };
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") onCloseRef.current?.();
        };
        document.addEventListener("mousedown", handleClick);
        document.addEventListener("keydown", handleKey);
        return () => {
            document.removeEventListener("mousedown", handleClick);
            document.removeEventListener("keydown", handleKey);
        };
    }, [open, anchorRef]);

    // Positioning — clamp width to viewport
    useEffect(() => {
        if (!open || !anchorRef?.current || !ref.current) return;
        const positionPanel = () => {
            const anchor = anchorRef?.current;
            const panel = ref.current;
            if (!anchor || !panel) return;
            const rect = anchor.getBoundingClientRect();
            const vv = window.visualViewport;
            const vw = vv?.width || window.innerWidth;
            const vh = vv?.height || window.innerHeight;
            const vvTop = vv?.offsetTop || 0;
            const margin = 8;
            const topLimit = vvTop + margin;
            const bottomLimit = vvTop + vh - margin;

            const effectiveMaxWidth = Math.min(maxWidth, vw - 2 * margin);
            panel.style.maxWidth = `${effectiveMaxWidth}px`;

            const panelW = panel.offsetWidth;
            const panelH = panel.offsetHeight;

            let top = rect.bottom + offset;
            let left: number;
            if (align === "end") {
                left = rect.right - panelW;
            } else if (align === "center") {
                left = rect.left + rect.width / 2 - panelW / 2;
            } else {
                left = rect.left;
            }
            if (left + panelW > vw - margin) left = vw - margin - panelW;
            if (left < margin) left = margin;
            if (top + panelH > bottomLimit) {
                const above = rect.top - offset - panelH;
                if (above >= topLimit) top = above;
            }
            if (top < topLimit) top = topLimit;
            if (top + panelH > bottomLimit)
                top = Math.max(topLimit, bottomLimit - panelH);
            panel.style.top = `${Math.round(top)}px`;
            panel.style.left = `${Math.round(left)}px`;
        };
        positionPanel();
        window.addEventListener("resize", positionPanel);
        window.addEventListener("scroll", positionPanel, true);
        return () => {
            window.removeEventListener("resize", positionPanel);
            window.removeEventListener("scroll", positionPanel, true);
        };
    }, [open, anchorRef, align, offset, maxWidth]);

    // Focus trap
    useEffect(() => {
        if (!open || !ref.current) return;
        const el = ref.current;
        const sel =
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
        const focusables = () => [...el.querySelectorAll<HTMLElement>(sel)];
        const first = focusables()[0];
        first?.focus();
        const trap = (e: KeyboardEvent) => {
            if (e.key !== "Tab") return;
            const items = focusables();
            const last = items[items.length - 1];
            if (e.shiftKey) {
                if (document.activeElement === items[0]) {
                    e.preventDefault();
                    last?.focus();
                }
            } else {
                if (document.activeElement === last) {
                    e.preventDefault();
                    items[0]?.focus();
                }
            }
        };
        el.addEventListener("keydown", trap);
        return () => el.removeEventListener("keydown", trap);
    }, [open]);

    if (!open) return null;

    return (
        <div
            ref={ref}
            role="dialog"
            aria-modal="true"
            style={{
                position: "fixed",
                zIndex,
                minWidth,
                maxWidth,
                background: "var(--card)",
                color: "var(--fg)",
                border: "1px solid var(--rule)",
                borderRadius: 14,
                boxShadow: "var(--shadow-deep)",
                padding: 12,
            }}
        >
            {children}
        </div>
    );
}
