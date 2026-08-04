"use client";

import type { CSSProperties, ReactNode } from "react";

type PillProps = {
    tone?: string;
    className?: string;
    style?: CSSProperties;
    children?: ReactNode;
    testId?: string;
};

export default function Pill({
    tone = "success",
    className = "",
    style,
    children,
    testId,
}: PillProps) {
    const cls = [`pill-${tone}`, className].filter(Boolean).join(" ");
    return (
        <span className={cls} style={style} data-testid={testId}>
            {children}
        </span>
    );
}
