"use client";

import type { CSSProperties } from "react";

// Small round color swatch used in chart legends, grouped-list titles and
// status indicators — replaces emojis / colored squares / decorative ✓.
type CategoryDotProps = {
    color?: string;
    size?: number;
    style?: CSSProperties;
};

export default function CategoryDot({
    color = "var(--accent)",
    size = 8,
    style,
}: CategoryDotProps) {
    return (
        <span
            aria-hidden="true"
            style={{
                display: "inline-block",
                width: size,
                height: size,
                borderRadius: "50%",
                background: color,
                flexShrink: 0,
                ...style,
            }}
        />
    );
}
