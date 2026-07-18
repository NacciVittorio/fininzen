"use client";

import type { CSSProperties, ReactNode } from "react";

type KpiStripProps = {
    children?: ReactNode;
    columns?: number;
    style?: CSSProperties;
};

export default function KpiStrip({ children, columns, style }: KpiStripProps) {
    const count = columns || 3;
    return (
        <div
            className="kpi-strip"
            // Layout lives in CSS (.kpi-strip) so contexts like .cash-kpis can
            // dissolve the strip with display:contents; only the column count
            // is passed through.
            style={{ "--kpi-strip-cols": count, ...style } as CSSProperties}
        >
            {children}
        </div>
    );
}
