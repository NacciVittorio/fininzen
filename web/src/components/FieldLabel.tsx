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
        fontSize: 13,
        color: "var(--fg-soft)",
        marginBottom: 6,
        lineHeight: 1.2,
        fontWeight: 500,
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
