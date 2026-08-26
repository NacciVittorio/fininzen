"use client";

import type { CSSProperties, ElementType, ReactNode } from "react";

type LabelProps = {
    accent?: boolean;
    bold?: boolean;
    className?: string;
    htmlFor?: string;
    style?: CSSProperties;
    children?: ReactNode;
};

export default function Label({
    accent = false,
    bold = false,
    className = "",
    htmlFor,
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
    const Tag: ElementType = htmlFor ? "label" : "div";
    return (
        <Tag className={cls} style={style} htmlFor={htmlFor}>
            {children}
        </Tag>
    );
}
