"use client";

import type { ReactNode } from "react";

// Renders a real <label htmlFor> when an id is provided so screen readers
// announce the field; falls back to a plain <div> for decorative labels.
export default function FieldLabel({
    text,
    htmlFor,
}: {
    text: ReactNode;
    htmlFor?: string;
}) {
    const style = {
        fontSize: 11,
        color: "var(--fg-soft)",
        marginBottom: 5,
        textTransform: "uppercase" as const,
        letterSpacing: 0,
        fontWeight: 600,
        display: "block",
    };
    if (htmlFor) {
        return (
            <label htmlFor={htmlFor} style={style}>
                {text}
            </label>
        );
    }
    return <div style={style}>{text}</div>;
}
