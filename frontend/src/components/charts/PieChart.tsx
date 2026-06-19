import { useState } from "react";
import type { ReactNode } from "react";
import { useFormatters } from "../../utils/useFormatters";

type PieDatum = {
    total: number | string;
    category__id?: number | string;
    category_id?: number | string;
    id?: number | string;
    category__name?: string;
    category__color?: string;
    category__icon?: ReactNode;
    name?: string;
    label?: string;
};

type PieSlice = PieDatum & {
    path: string;
    pct: number;
    midAngle: number;
    isFull: boolean;
};

type PieChartProps = {
    data?: PieDatum[];
    size?: number;
    onSliceClick?: ((slice: PieSlice) => void) | null;
    hoveredIndex?: number | null;
    onHoverChange?: ((i: number | null) => void) | null;
    tLabel?: string;
    tPctOfTotal?: string;
};

export function PieChart({
    data,
    size = 180,
    onSliceClick = null,
    hoveredIndex = null,
    onHoverChange = null,
    tLabel = "total",
    tPctOfTotal = "of total",
}: PieChartProps) {
    const { formatEur } = useFormatters();
    const [innerHover, setInnerHover] = useState<number | null>(null);
    const activeIdx = hoveredIndex !== null ? hoveredIndex : innerHover;

    if (!data || data.length === 0) return null;
    const total = data.reduce(
        (s, d) => s + parseFloat(String(d.total || 0)),
        0,
    );
    if (total === 0) return null;

    const cx = size / 2,
        cy = size / 2,
        r = size / 2 - 12;
    let startAngle = -Math.PI / 2;
    const slices: PieSlice[] = data.map((d) => {
        const pct = parseFloat(String(d.total || 0)) / total;
        const angle = pct * 2 * Math.PI;
        const endAngle = startAngle + angle;
        const midAngle = startAngle + angle / 2;
        const x1 = cx + r * Math.cos(startAngle);
        const y1 = cy + r * Math.sin(startAngle);
        const x2 = cx + r * Math.cos(endAngle);
        const y2 = cy + r * Math.sin(endAngle);
        const largeArc = angle > Math.PI ? 1 : 0;
        const path = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`;
        const slice: PieSlice = {
            ...d,
            path,
            pct,
            midAngle,
            isFull: pct >= 0.9999,
        };
        startAngle = endAngle;
        return slice;
    });

    const setHover = (i: number | null) => {
        setInnerHover(i);
        if (onHoverChange) onHoverChange(i);
    };
    const active = activeIdx !== null ? slices[activeIdx] : null;
    const sliceKey = (s: PieSlice, i: number): string | number =>
        s.category__id ??
        s.category_id ??
        s.id ??
        s.category__name ??
        s.name ??
        s.label ??
        i;

    return (
        <div style={{ position: "relative", width: size, margin: "0 auto" }}>
            <svg
                width={size}
                height={size}
                style={{ display: "block", overflow: "visible" }}
            >
                {slices.map((s, i) => {
                    const isActive = activeIdx === i;
                    const offset = isActive ? 6 : 0;
                    const dx = offset * Math.cos(s.midAngle);
                    const dy = offset * Math.sin(s.midAngle);
                    const fill = s.category__color || "var(--accent)";
                    const opacity = activeIdx === null || isActive ? 1 : 0.45;
                    const handlers = {
                        onMouseEnter: () => setHover(i),
                        onMouseLeave: () => setHover(null),
                        onClick: () => onSliceClick && onSliceClick(s),
                    };
                    const cursor = onSliceClick ? "pointer" : "default";
                    if (s.isFull) {
                        return (
                            <circle
                                key={sliceKey(s, i)}
                                cx={cx}
                                cy={cy}
                                r={r}
                                fill={fill}
                                opacity={opacity}
                                style={{ transition: "opacity 0.18s", cursor }}
                                {...handlers}
                            />
                        );
                    }
                    return (
                        <path
                            key={sliceKey(s, i)}
                            d={s.path}
                            fill={fill}
                            opacity={opacity}
                            transform={`translate(${dx}, ${dy})`}
                            style={{
                                transition: "opacity 0.18s, transform 0.18s",
                                cursor,
                            }}
                            {...handlers}
                        />
                    );
                })}
                <circle
                    cx={cx}
                    cy={cy}
                    r={r * 0.55}
                    fill="var(--card-inset)"
                    pointerEvents="none"
                />
                <text
                    x={cx}
                    y={cy - 6}
                    textAnchor="middle"
                    fill="var(--fg)"
                    fontSize="13"
                    fontWeight="600"
                    fontFamily="var(--font-mono)"
                    pointerEvents="none"
                >
                    {active
                        ? `${(active.pct * 100).toFixed(1)}%`
                        : formatEur(total)}
                </text>
                <text
                    x={cx}
                    y={cy + 14}
                    textAnchor="middle"
                    fill="var(--fg-soft)"
                    fontSize="10"
                    fontFamily="var(--font-sans)"
                    pointerEvents="none"
                >
                    {active ? active.category__name || "-" : tLabel}
                </text>
            </svg>
            {active && (
                <div
                    style={{
                        position: "absolute",
                        top: -4,
                        left: "50%",
                        transform: "translate(-50%, -100%)",
                        background: "var(--card)",
                        border: "1px solid var(--rule)",
                        borderRadius: 8,
                        padding: "6px 10px",
                        fontSize: 11,
                        color: "var(--fg)",
                        whiteSpace: "nowrap",
                        pointerEvents: "none",
                        boxShadow: "var(--shadow-deep)",
                    }}
                >
                    <span style={{ color: active.category__color }}>{"●"}</span>{" "}
                    {active.category__icon} {active.category__name || "-"}{" "}
                    <span className="mono" style={{ fontWeight: 600 }}>
                        {formatEur(active.total)}
                    </span>
                    <span style={{ color: "var(--fg-soft)", marginLeft: 6 }}>
                        ({(active.pct * 100).toFixed(1)}% {tPctOfTotal})
                    </span>
                </div>
            )}
        </div>
    );
}
