"use client";

import type { CSSProperties, ReactNode } from "react";

type LabelProps = {
    accent?: boolean;
    bold?: boolean;
    className?: string;
    style?: CSSProperties;
    children?: ReactNode;
};

export default function Label({
    accent = false,
    bold = false,
    className = "",
    style,
    children,
}: LabelProps) {
    const cls = [
        "label",
        accent ? "label--accent" : "",
        bold ? "label--bold" : "",
        className,
    ]
        .filter(Boolean)
        .join(" ");
    return (
        <div className={cls} style={style}>
            {children}
        </div>
    );
}
