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
            style={{
                display: "grid",
                gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))`,
                gap: "var(--sp-4)",
                ...style,
            }}
        >
            {children}
        </div>
    );
}
