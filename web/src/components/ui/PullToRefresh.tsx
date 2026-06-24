"use client";

import { useRef, useState } from "react";
import type { ReactNode, TouchEvent } from "react";

const THRESHOLD = 70; // px of pull before triggering refresh
const MAX_PULL = 100; // cap visual travel

type PullToRefreshProps = {
    onRefresh?: () => void | Promise<void>;
    children?: ReactNode;
    disabled?: boolean;
};

export default function PullToRefresh({
    onRefresh,
    children,
    disabled,
}: PullToRefreshProps) {
    const startY = useRef<number | null>(null);
    const [pullY, setPullY] = useState(0);
    const [refreshing, setRefreshing] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    const onTouchStart = (e: TouchEvent<HTMLDivElement>) => {
        if (disabled || refreshing) return;
        // The page scrolls via the window (the container has no fixed height):
        // only start a pull when we're at the very top.
        const scrollTop = containerRef.current?.scrollTop ?? 0;
        const winScrolled = typeof window !== "undefined" && window.scrollY > 0;
        if (scrollTop > 0 || winScrolled) return;
        const touch = e.touches[0];
        if (!touch) return;
        startY.current = touch.clientY;
    };

    const onTouchMove = (e: TouchEvent<HTMLDivElement>) => {
        if (startY.current == null || disabled || refreshing) return;
        const touch = e.touches[0];
        if (!touch) return;
        const dy = Math.max(0, touch.clientY - startY.current);
        const capped = Math.min(MAX_PULL, dy * 0.55); // resistance factor
        if (capped > 0) {
            setPullY(capped);
            // Prevent default page scroll only when we're actually pulling
            if (dy > 8) e.preventDefault();
        }
    };

    const onTouchEnd = async () => {
        if (startY.current == null) return;
        startY.current = null;
        if (pullY >= THRESHOLD) {
            setRefreshing(true);
            setPullY(THRESHOLD * 0.6);
            try {
                await onRefresh?.();
            } finally {
                setRefreshing(false);
                setPullY(0);
            }
        } else {
            setPullY(0);
        }
    };

    // iOS fires touchcancel (not touchend) when the system takes over the
    // gesture; without resetting here startY stays set and later touchmoves
    // keep calling preventDefault, freezing page scroll.
    const onTouchCancel = () => {
        startY.current = null;
        setPullY(0);
    };

    const progress = Math.min(1, pullY / THRESHOLD);
    const indicatorVisible = pullY > 8 || refreshing;

    return (
        <div
            ref={containerRef}
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
            onTouchCancel={onTouchCancel}
            style={{ position: "relative" }}
        >
            {/* Pull indicator */}
            <div
                aria-hidden="true"
                style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    right: 0,
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                    height: pullY || (refreshing ? THRESHOLD * 0.6 : 0),
                    overflow: "hidden",
                    transition:
                        startY.current == null ? "height 0.25s ease" : "none",
                    pointerEvents: "none",
                }}
            >
                {indicatorVisible && (
                    <div
                        style={{
                            width: 28,
                            height: 28,
                            borderRadius: "50%",
                            border: "2.5px solid var(--accent-ring)",
                            borderTopColor: "var(--accent)",
                            opacity: progress,
                            transform: `rotate(${refreshing ? 0 : progress * 270}deg)`,
                            animation: refreshing
                                ? "ptr-spin 0.7s linear infinite"
                                : "none",
                            transition: refreshing
                                ? "none"
                                : "transform 0.05s linear, opacity 0.15s",
                        }}
                    />
                )}
            </div>

            {/* Main content pushed down by pull distance. At rest the transform is
          removed entirely: even translateY(0) creates a containing block that
          re-anchors position:fixed descendants and traps their z-index. */}
            <div
                style={{
                    transform: pullY ? `translateY(${pullY}px)` : "none",
                    transition:
                        startY.current == null
                            ? "transform 0.25s ease"
                            : "none",
                }}
            >
                {children}
            </div>

            <style>{`@keyframes ptr-spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}
