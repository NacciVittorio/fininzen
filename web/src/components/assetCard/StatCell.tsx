"use client";

import type { ReactNode } from "react";

type StatCellProps = {
    label?: ReactNode;
    value?: ReactNode;
    color?: string;
    sub?: ReactNode;
};

export default function StatCell({ label, value, color, sub }: StatCellProps) {
    return (
        <div
            style={{
                background: "var(--card-inset)",
                borderRadius: 9,
                padding: "8px 10px",
                border: "1px solid var(--rule)",
            }}
        >
            <div
                style={{
                    fontSize: 9,
                    color: "var(--fg-soft)",
                    textTransform: "uppercase",
                    letterSpacing: 0,
                    marginBottom: 3,
                }}
            >
                {label}
            </div>
            <div
                className="mono"
                style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: color || "var(--fg)",
                }}
            >
                {value}
            </div>
            {sub && (
                <div
                    className="mono"
                    style={{
                        fontSize: 10,
                        color: "var(--fg-soft)",
                        marginTop: 1,
                    }}
                >
                    {sub}
                </div>
            )}
        </div>
    );
}
