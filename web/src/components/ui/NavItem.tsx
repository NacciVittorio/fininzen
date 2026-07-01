"use client";

import type { ReactNode } from "react";
import Link from "next/link";

type NavItemProps = {
    icon?: ReactNode;
    label?: ReactNode;
    active?: boolean;
    onClick?: () => void;
    title?: string;
    href?: string;
};

export default function NavItem({
    icon,
    label,
    active = false,
    onClick,
    title,
    href,
}: NavItemProps) {
    const style = {
        background: active ? "var(--accent-soft)" : "transparent",
        border: 0,
        borderLeft: active
            ? "3px solid var(--accent)"
            : "3px solid transparent",
        borderRadius: active ? "0 10px 10px 0" : 10,
        width: "100%",
        textAlign: "left" as const,
        marginBottom: 4,
        transition: "background 0.15s, border-color 0.15s",
    };
    const titleAttr = title || (typeof label === "string" ? label : undefined);
    const content = (
        <>
            {icon != null && (
                <span
                    className="nav-item__icon"
                    style={{
                        width: 22,
                        height: 22,
                        lineHeight: 1,
                        textAlign: "center",
                        opacity: active ? 1 : 0.75,
                        filter: active ? "none" : "saturate(0.7)",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                    }}
                >
                    {icon}
                </span>
            )}
            <span
                style={{
                    color: active ? "var(--accent-deep)" : "var(--fg-soft)",
                    fontWeight: active ? 700 : 500,
                }}
            >
                {label}
            </span>
        </>
    );

    if (href) {
        return (
            <Link
                href={href}
                className="nav-item"
                aria-current={active ? "page" : undefined}
                onClick={onClick}
                title={titleAttr}
                style={{ ...style, textDecoration: "none" }}
            >
                {content}
            </Link>
        );
    }

    return (
        <button
            type="button"
            className="nav-item"
            aria-current={active ? "page" : undefined}
            onClick={onClick}
            title={titleAttr}
            style={style}
        >
            {content}
        </button>
    );
}
