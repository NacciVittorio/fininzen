"use client";

import type { ComponentPropsWithoutRef } from "react";

const TONE_BORDER: Record<string, string> = {
    accent: "var(--accent)",
    success: "var(--success)",
    danger: "var(--danger)",
    warning: "var(--warning)",
};

type CardProps = ComponentPropsWithoutRef<"div"> & {
    variant?: string;
    tone?: string;
};

export default function Card({
    variant,
    tone,
    className = "",
    style,
    children,
    ...rest
}: CardProps) {
    const cls = ["card", variant ? `card--${variant}` : "", className]
        .filter(Boolean)
        .join(" ");
    const toneStyle =
        tone && TONE_BORDER[tone]
            ? { borderLeft: `3px solid ${TONE_BORDER[tone]}` }
            : null;
    return (
        <div className={cls} style={{ ...toneStyle, ...style }} {...rest}>
            {children}
        </div>
    );
}
