"use client";

import type { CSSProperties } from "react";

type ProgressBarProps = {
    value?: number;
    max?: number;
    // Any tone string is accepted; unknown tones fall back to "success".
    tone?: string;
    className?: string;
    style?: CSSProperties;
};

export default function ProgressBar({
    value = 0,
    max = 100,
    tone = "success",
    className = "",
    style,
}: ProgressBarProps) {
    const pct = Math.max(0, Math.min(100, max > 0 ? (value / max) * 100 : 0));
    const color =
        tone === "danger"
            ? "var(--danger)"
            : tone === "accent"
              ? "var(--accent)"
              : tone === "warning"
                ? "var(--warning)"
                : "var(--success)";
    return (
        <div className={`progress ${className}`} style={style}>
            <span style={{ width: `${pct}%`, background: color }} />
        </div>
    );
}
