"use client";

import type { ReactNode } from "react";
import { useFormatters } from "../../utils/useFormatters";

type BarRowProps = {
    label?: ReactNode;
    value: number;
    total: number;
    color?: string;
    extra?: ReactNode;
};

export function BarRow({ label, value, total, color, extra }: BarRowProps) {
    const { formatEur } = useFormatters();
    const pct = total > 0 ? (value / total) * 100 : 0;
    return (
        <div style={{ marginBottom: 12 }}>
            <div
                style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginBottom: 4,
                }}
            >
                <span style={{ fontSize: 13, color: "var(--fg)" }}>
                    {label}
                </span>
                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                    {extra && (
                        <span style={{ fontSize: 12, color: "var(--fg-soft)" }}>
                            {extra}
                        </span>
                    )}
                    <span
                        style={{
                            fontSize: 13,
                            fontWeight: 600,
                            fontFamily: "var(--font-mono)",
                        }}
                    >
                        {formatEur(value)}
                    </span>
                </div>
            </div>
            <div
                style={{
                    height: 5,
                    background: "var(--card-inset)",
                    borderRadius: 3,
                    overflow: "hidden",
                }}
            >
                <div
                    style={{
                        height: "100%",
                        width: `${pct}%`,
                        background: color,
                        borderRadius: 3,
                        transition: "width 0.6s ease",
                    }}
                />
            </div>
        </div>
    );
}
