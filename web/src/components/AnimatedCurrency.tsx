"use client";

import { useState, useEffect, useRef } from "react";
import { useFormatters } from "../utils/useFormatters";

function useReducedMotion() {
    const mql =
        typeof window !== "undefined"
            ? window.matchMedia("(prefers-reduced-motion: reduce)")
            : null;
    const [reduced, setReduced] = useState(() => mql?.matches ?? false);
    useEffect(() => {
        if (!mql) return;
        const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
        mql.addEventListener("change", handler);
        return () => mql.removeEventListener("change", handler);
    }, [mql]);
    return reduced;
}

function easeOut(t: number) {
    return 1 - Math.pow(1 - t, 3);
}

export default function AnimatedCurrency({
    value,
    durationMs = 600,
    className = "mono",
}: {
    value: number | null | undefined;
    durationMs?: number;
    className?: string;
}) {
    const { formatEur } = useFormatters();
    const [displayed, setDisplayed] = useState(value ?? 0);
    const reducedMotion = useReducedMotion();
    const rafRef = useRef<number | null>(null);
    const prevValueRef = useRef(value ?? 0);

    useEffect(() => {
        const target = value ?? 0;
        if (reducedMotion) {
            setDisplayed(target);
            prevValueRef.current = target;
            return;
        }

        const start = prevValueRef.current;
        prevValueRef.current = target;

        if (start === target) return;

        const startTime = performance.now();

        const tick = (now: number) => {
            const elapsed = now - startTime;
            const progress = Math.min(elapsed / durationMs, 1);
            setDisplayed(start + (target - start) * easeOut(progress));
            if (progress < 1) {
                rafRef.current = requestAnimationFrame(tick);
            } else {
                setDisplayed(target);
            }
        };

        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(tick);

        return () => {
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
        };
    }, [value, durationMs, reducedMotion]);

    return <span className={className}>{formatEur(displayed)}</span>;
}
