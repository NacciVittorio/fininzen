"use client";

import { memo, useCallback, useRef, useState } from "react";
import { ChartEmpty } from "./ChartEmpty";

type BarTrendDatum = { value: number; month: string };

type BarTrendChartProps = {
    data?: BarTrendDatum[];
    /** Fixed height; in fill mode this is the min-height instead. */
    height?: number;
    /** Stretch to the flex-assigned container height (e.g. inside a
     *  flex-column card stretched by the dashboard grid). */
    fill?: boolean;
    color?: string;
    emptyLabel?: string;
};

// LOW-16: memoized pure data→SVG chart.
export const BarTrendChart = memo(function BarTrendChart({
    data,
    height = 120,
    fill = false,
    color = "var(--accent)",
    emptyLabel,
}: BarTrendChartProps) {
    const [size, setSize] = useState({ width: 340, height });

    // Callback ref instead of an effect: the observer (re)attaches whenever
    // the container div actually mounts — an effect with [] would miss it if
    // the first render took the empty-data branch.
    const roRef = useRef<ResizeObserver | null>(null);
    const containerRef = useCallback((node: HTMLDivElement | null) => {
        roRef.current?.disconnect();
        roRef.current = null;
        if (!node) return;
        const ro = new ResizeObserver((entries) => {
            const r = entries[0]?.contentRect;
            if (r) setSize({ width: r.width, height: r.height });
        });
        ro.observe(node);
        roRef.current = ro;
    }, []);

    if (!data || data.length === 0)
        return <ChartEmpty height={height} label={emptyLabel} />;

    const width = size.width;
    const renderH = fill ? Math.max(size.height, height) : height;

    const padding = { left: 0, right: 0, top: 16, bottom: 20 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = renderH - padding.top - padding.bottom;
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

    // In fill mode the SVG is absolutely positioned so the container's height
    // comes purely from flex + minHeight — an in-flow SVG would feed its own
    // height back into the ResizeObserver (measure→grow loop).
    return (
        <div
            ref={containerRef}
            style={
                fill
                    ? {
                          width: "100%",
                          flex: "1 1 auto",
                          minHeight: height,
                          position: "relative",
                      }
                    : { width: "100%" }
            }
        >
            <svg
                width={width}
                height={renderH}
                style={
                    fill
                        ? { display: "block", position: "absolute", inset: 0 }
                        : { display: "block" }
                }
            >
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
                            y={renderH - 5}
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
