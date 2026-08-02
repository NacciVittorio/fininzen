"use client";

import type { ComponentPropsWithoutRef, ReactNode } from "react";

const TONE_BORDER: Record<string, string> = {
    accent: "var(--accent)",
    success: "var(--success)",
    danger: "var(--danger)",
    warning: "var(--warning)",
};

type CardProps = ComponentPropsWithoutRef<"div"> & {
    variant?: string;
    tone?: string;
    title?: ReactNode;
    description?: ReactNode;
};

export default function Card({
    variant,
    tone,
    title,
    description,
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
            {title && (
                <div
                    style={{
                        fontSize: 15,
                        fontWeight: 600,
                        marginBottom: description ? 4 : 10,
                        color: tone === "danger" ? "var(--danger)" : undefined,
                    }}
                >
                    {title}
                </div>
            )}
            {description && (
                <div
                    style={{
                        fontSize: 13,
                        color: "var(--fg-soft)",
                        marginBottom: 14,
                        lineHeight: 1.35,
                    }}
                >
                    {description}
                </div>
            )}
            {children}
        </div>
    );
}
