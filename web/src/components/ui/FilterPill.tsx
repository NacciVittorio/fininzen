"use client";

import { forwardRef } from "react";
import type { ComponentPropsWithoutRef, CSSProperties, ReactNode } from "react";

type FilterPillProps = Omit<
    ComponentPropsWithoutRef<"button">,
    "onClick" | "value"
> & {
    label?: ReactNode;
    value?: ReactNode;
    active?: boolean;
    onClick?: () => void;
    onClear?: () => void;
    icon?: ReactNode;
    caret?: boolean;
    size?: "sm" | "md";
    style?: CSSProperties;
};

const FilterPill = forwardRef<HTMLButtonElement, FilterPillProps>(
    function FilterPill(
        {
            label,
            value,
            active,
            onClick,
            onClear,
            icon,
            caret = true,
            size = "md",
            style,
            ...rest
        },
        ref,
    ) {
        const isActive = !!active;
        const padY = size === "sm" ? 6 : 8;
        const padX = size === "sm" ? 10 : 14;
        const fontSize = size === "sm" ? 12 : 13;

        return (
            <span
                className="filter-pill"
                style={{
                    display: "inline-flex",
                    alignItems: "stretch",
                    borderRadius: "var(--r-pill)",
                    border: `1px solid ${isActive ? "var(--accent-ring)" : "var(--rule)"}`,
                    background: isActive ? "var(--accent-soft)" : "var(--card)",
                    overflow: "hidden",
                    transition: "background 0.15s, border-color 0.15s",
                    ...style,
                }}
            >
                <button
                    ref={ref}
                    type="button"
                    onClick={onClick}
                    {...rest}
                    style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        minHeight: "var(--filter-pill-min-h, 40px)",
                        padding: `${padY}px ${onClear && isActive ? 8 : padX}px ${padY}px ${padX}px`,
                        background: "transparent",
                        border: 0,
                        color: isActive ? "var(--accent-deep)" : "var(--fg)",
                        fontFamily: "inherit",
                        fontSize,
                        fontWeight: 600,
                        cursor: "pointer",
                        lineHeight: 1.2,
                    }}
                >
                    {icon && (
                        <span
                            aria-hidden="true"
                            style={{
                                display: "inline-flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: fontSize + 2,
                                lineHeight: 1,
                            }}
                        >
                            {icon}
                        </span>
                    )}
                    <span>
                        {label}
                        {isActive && value ? (
                            <>
                                <span style={{ opacity: 0.6 }}>: </span>
                                <span style={{ fontWeight: 700 }}>{value}</span>
                            </>
                        ) : null}
                    </span>
                    {caret && !isActive && (
                        <span
                            aria-hidden="true"
                            style={{ fontSize: 9, opacity: 0.7 }}
                        >
                            ▾
                        </span>
                    )}
                </button>
                {onClear && isActive && (
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            onClear();
                        }}
                        aria-label="Clear filter"
                        style={{
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            minWidth: "var(--filter-pill-min-h, 40px)",
                            padding: 0,
                            background: "transparent",
                            border: 0,
                            borderLeft: "1px solid var(--accent-ring)",
                            color: "var(--accent-deep)",
                            cursor: "pointer",
                            fontSize: 14,
                            fontFamily: "inherit",
                        }}
                    >
                        ×
                    </button>
                )}
            </span>
        );
    },
);

export default FilterPill;
