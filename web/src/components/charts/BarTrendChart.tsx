"use client";

import { memo, useEffect, useRef, useState } from "react";
import { ChartEmpty } from "./ChartEmpty";

type BarTrendDatum = { value: number; month: string };

type BarTrendChartProps = {
    data?: BarTrendDatum[];
    height?: number;
    color?: string;
    emptyLabel?: string;
};

// LOW-16: memoized pure data→SVG chart.
export const BarTrendChart = memo(function BarTrendChart({
    data,
    height = 120,
    color = "var(--accent)",
    emptyLabel,
}: BarTrendChartProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [width, setWidth] = useState(340);

    useEffect(() => {
        if (!containerRef.current) return;
        const ro = new ResizeObserver((entries) => {
            const w = entries[0]?.contentRect.width;
            if (w != null) setWidth(w);
        });
        ro.observe(containerRef.current);
        return () => ro.disconnect();
    }, []);

    if (!data || data.length === 0)
        return <ChartEmpty height={height} label={emptyLabel} />;

    const padding = { left: 0, right: 0, top: 16, bottom: 20 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;
    const slotW = chartWidth / data.length;
    const barWidth = slotW * 0.7;
    const barGap = slotW * 0.15;

    const maxValue = Math.max(...data.map((d) => d.value), 1);
    const bars = data.map((d, i) => {
        const x = padding.left + slotW * i + barGap;
        const barHeight = Math.max((d.value / maxValue) * chartHeight, 1);
        const y = padding.top + chartHeight - barHeight;
        const label =
            d.value >= 1000
                ? `${(d.value / 1000).toFixed(1)}k`
                : Math.round(d.value).toString();
        return { ...d, x, y, barHeight, label };
    });

    return (
        <div ref={containerRef} style={{ width: "100%" }}>
            <svg width={width} height={height} style={{ display: "block" }}>
                {bars.map((b, i) => (
                    <g key={i}>
                        <rect
                            x={b.x}
                            y={b.y}
                            width={barWidth}
                            height={b.barHeight}
                            fill={color}
                            rx={2}
                            opacity={0.8}
                        />
                        {b.value > 0 && (
                            <text
                                x={b.x + barWidth / 2}
                                y={b.y - 3}
                                textAnchor="middle"
                                fontSize="8"
                                fill="var(--fg-soft)"
                                fontFamily="var(--font-mono)"
                            >
                                {b.label}
                            </text>
                        )}
                        <text
                            x={b.x + barWidth / 2}
                            y={height - 5}
                            textAnchor="middle"
                            fontSize="9"
                            fill="var(--fg-soft)"
                            fontFamily="var(--font-mono)"
                        >
                            {b.month.slice(0, 3)}
                        </text>
                    </g>
                ))}
            </svg>
        </div>
    );
});
