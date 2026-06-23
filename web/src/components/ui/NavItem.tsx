"use client";

import type { ReactNode } from "react";

type NavItemProps = {
    icon?: ReactNode;
    label?: ReactNode;
    active?: boolean;
    onClick?: () => void;
    title?: string;
};

export default function NavItem({
    icon,
    label,
    active = false,
    onClick,
    title,
}: NavItemProps) {
    return (
        <button
            type="button"
            className="nav-item"
            aria-current={active ? "page" : undefined}
            onClick={onClick}
            title={title || (typeof label === "string" ? label : undefined)}
            style={{
                background: active ? "var(--accent-soft)" : "transparent",
                border: 0,
                borderLeft: active
                    ? "3px solid var(--accent)"
                    : "3px solid transparent",
                borderRadius: active ? "0 10px 10px 0" : 10,
                width: "100%",
                textAlign: "left",
                marginBottom: 4,
                transition: "background 0.15s, border-color 0.15s",
            }}
        >
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
        </button>
    );
}
