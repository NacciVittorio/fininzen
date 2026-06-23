"use client";

import type { CSSProperties } from "react";
import { useFormatters } from "../../utils/useFormatters";

type Size = "xs" | "sm" | "md" | "lg" | "xl" | "hero";
type Tone = "neutral" | "accent" | "success" | "danger" | "warning" | "auto";

const SIZE_FONT: Record<Size, number | string> = {
    xs: 12,
    sm: 14,
    md: 18,
    lg: 28,
    xl: 42,
    hero: "clamp(40px, 12vw, 76px)",
};

const SIZE_WEIGHT: Record<Size, number> = {
    xs: 600,
    sm: 600,
    md: 700,
    lg: 800,
    xl: 900,
    hero: 900,
};

function resolveTone(tone: Tone, num: number): string {
    if (tone === "neutral") return "var(--fg)";
    if (tone === "accent") return "var(--accent)";
    if (tone === "success") return "var(--success)";
    if (tone === "danger") return "var(--danger)";
    if (tone === "warning") return "var(--warning)";
    if (tone === "auto") {
        if (num > 0) return "var(--success)";
        if (num < 0) return "var(--danger)";
        return "var(--fg)";
    }
    return "var(--fg)";
}

type MoneyValueProps = {
    value?: number | string | null;
    signed?: boolean;
    tone?: Tone;
    size?: Size;
    className?: string;
    style?: CSSProperties;
};

export default function MoneyValue({
    value,
    signed = false,
    tone = "neutral",
    size = "md",
    className = "",
    style,
}: MoneyValueProps) {
    const { formatEur } = useFormatters();
    const num = parseFloat(String(value || 0));
    const color = resolveTone(tone, num);
    const sign = signed && num > 0 ? "+" : "";
    return (
        <span
            className={className}
            style={{
                fontFamily: "var(--font-mono)",
                fontWeight: SIZE_WEIGHT[size] || 700,
                fontSize: SIZE_FONT[size] || 18,
                lineHeight: 1,
                letterSpacing: 0,
                color,
                ...style,
            }}
        >
            {sign}
            {formatEur(num)}
        </span>
    );
}
