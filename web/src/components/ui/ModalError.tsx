"use client";

import type { ReactNode } from "react";

export default function ModalError({
    children,
    "data-testid": testId,
}: {
    children: ReactNode;
    "data-testid"?: string;
}) {
    return (
        <div
            data-testid={testId}
            style={{
                fontSize: 12,
                color: "var(--danger)",
                background: "#ff6b6b11",
                border: "1px solid #ff6b6b33",
                borderRadius: 8,
                padding: "8px 10px",
            }}
        >
            {children}
        </div>
    );
}
