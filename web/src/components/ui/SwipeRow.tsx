"use client";

import { useEffect, useRef, useState } from "react";
import type {
    AriaAttributes,
    AriaRole,
    CSSProperties,
    PointerEvent,
    ReactNode,
} from "react";

const ACTION_W = 74; // width of each revealed action button
const THRESHOLD = 56; // drag past this to latch the row open

const actionStyle = (bg: string): CSSProperties => ({
    width: ACTION_W,
    border: 0,
    background: bg,
    color: "#fff",
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    fontFamily: "inherit",
});

type RowId = string | number | null;

export type SwipeAction = {
    key?: string | number;
    testId?: string;
    onPress: () => void;
    background: string;
    icon?: ReactNode;
    label?: ReactNode;
};

type SwipeRowProps = {
    rowId?: RowId;
    openRowId?: RowId;
    onRequestOpen?: (id: RowId) => void;
    actions?: SwipeAction[];
    leftActions?: SwipeAction[];
    threshold?: number;
    disabled?: boolean;
    onTap?: () => void;
    style?: CSSProperties;
    rowStyle?: CSSProperties;
    rowClassName?: string;
    ariaLabel?: string;
    role?: AriaRole;
    ariaChecked?: AriaAttributes["aria-checked"];
    children?: ReactNode;
};

// Generic swipeable list row (extracted from the Cash Flow row pattern).
// Bidirectional (Pointer Events, degrades to tap→detail on desktop):
//   • left-swipe reveals `actions` on the right edge
//   • right-swipe reveals `leftActions` on the left edge
// tap fires onTap unless the pointer moved. The parent owns the "only one row
// open" state via openRowId/onRequestOpen; this row tracks which side is open
// internally. data-swipe-row="true" is mandatory: App's tab-swipe handler
// ignores gestures that originate inside it.
export default function SwipeRow({
    rowId,
    openRowId,
    onRequestOpen,
    actions = [],
    leftActions = [],
    threshold = THRESHOLD,
    disabled = false,
    onTap,
    style,
    rowStyle,
    rowClassName = "",
    ariaLabel,
    role = "button",
    ariaChecked,
    children,
}: SwipeRowProps) {
    const startX = useRef<number | null>(null);
    const [dx, setDx] = useState(0);
    const [openSide, setOpenSide] = useState<"left" | "right" | null>(null);
    const swipeOpen = openRowId != null && openRowId === rowId;
    const hasRight = actions.length > 0;
    const hasLeft = leftActions.length > 0;
    const canSwipe = !disabled && (hasRight || hasLeft);
    const rightW = actions.length * ACTION_W;
    const leftW = leftActions.length * ACTION_W;

    const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
        if (!canSwipe) return;
        startX.current = e.clientX;
    };
    const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
        if (startX.current == null) return;
        // Negative dx = swiping left (reveal right actions); positive = swiping
        // right (reveal left actions). Clamp to whichever side has actions.
        const raw = e.clientX - startX.current;
        const d = Math.max(-rightW, Math.min(leftW, raw));
        setDx(d);
    };
    const endSwipe = () => {
        if (startX.current == null) return;
        if (dx <= -threshold && hasRight) {
            setOpenSide("right");
            onRequestOpen?.(rowId ?? null);
        } else if (dx >= threshold && hasLeft) {
            setOpenSide("left");
            onRequestOpen?.(rowId ?? null);
        } else if (swipeOpen) {
            onRequestOpen?.(null);
            setDx(0);
        } else {
            setDx(0);
        }
        startX.current = null;
    };
    useEffect(() => {
        if (!swipeOpen) {
            setDx(0);
            setOpenSide(null);
        }
    }, [swipeOpen]);
    const offset = swipeOpen ? (openSide === "left" ? leftW : -rightW) : dx;

    const handleClick = () => {
        if (swipeOpen) {
            onRequestOpen?.(null);
            return;
        }
        if (Math.abs(dx) < 5) onTap?.();
    };

    const renderActions = (list: SwipeAction[]) =>
        list.map((a) => (
            <button
                key={a.key}
                type="button"
                data-testid={a.testId}
                onClick={() => {
                    a.onPress();
                    onRequestOpen?.(null);
                }}
                style={actionStyle(a.background)}
            >
                {a.icon}
                {a.label}
            </button>
        ));

    return (
        <div
            data-swipe-row="true"
            style={{ position: "relative", overflow: "hidden", ...style }}
        >
            {!disabled && hasRight && (
                <div
                    style={{
                        position: "absolute",
                        top: 0,
                        right: 0,
                        bottom: 0,
                        display: "flex",
                    }}
                >
                    {renderActions(actions)}
                </div>
            )}

            {!disabled && hasLeft && (
                <div
                    style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        bottom: 0,
                        display: "flex",
                    }}
                >
                    {renderActions(leftActions)}
                </div>
            )}

            <div
                className={rowClassName}
                role={role}
                tabIndex={0}
                aria-label={ariaLabel}
                aria-checked={ariaChecked}
                onKeyDown={(ev) => {
                    if (ev.key === " " || ev.key === "Enter") {
                        ev.preventDefault();
                        onTap?.();
                    }
                }}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={endSwipe}
                onPointerCancel={endSwipe}
                onPointerLeave={endSwipe}
                onClick={handleClick}
                style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    background: "var(--card)",
                    transform: `translateX(${canSwipe ? offset : 0}px)`,
                    transition:
                        startX.current == null
                            ? "transform 0.26s cubic-bezier(.32,.72,0,1)"
                            : "none",
                    cursor: "pointer",
                    touchAction: "pan-y",
                    position: "relative",
                    ...rowStyle,
                }}
            >
                {children}
            </div>
        </div>
    );
}
