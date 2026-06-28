"use client";

import { memo, useEffect, useRef, useState } from "react";
import type { MouseEvent } from "react";
import { useFormatters } from "../../utils/useFormatters";
import { ChartEmpty } from "./ChartEmpty";

type LineChartDatum = {
    total_value?: number | string;
    snapshot_date?: string;
};

type LineChartProps = {
    data?: LineChartDatum[];
    height?: number;
    // `label` is accepted for API compatibility but currently unused.
    label?: string;
    // Localized placeholder shown when there is nothing to plot (MED-33).
    emptyLabel?: string;
};

// LOW-16: memoized — a pure data→SVG component, so it only needs to re-render
// when its props actually change (charts sit inside cards that re-render often).
export const LineChart = memo(function LineChart({
    data,
    height = 180,
    emptyLabel,
}: LineChartProps) {
    const { formatEurFull } = useFormatters();
    const containerRef = useRef<HTMLDivElement>(null);
    const svgRef = useRef<SVGSVGElement>(null);
    const [width, setWidth] = useState(340);
    const [hoverIdx, setHoverIdx] = useState<number | null>(null);

    useEffect(() => {
        if (!containerRef.current) return;
        const ro = new ResizeObserver((entries) => {
            const w = entries[0]?.contentRect.width;
            if (w != null) setWidth(w);
        });
        ro.observe(containerRef.current);
        return () => ro.disconnect();
    }, []);

    if (!data || data.length < 2)
        return <ChartEmpty height={height} label={emptyLabel} />;

    const padding = { top: 20, right: 20, bottom: 30, left: 50 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    const values = data.map((d) => parseFloat(String(d.total_value || 0)));
    const minVal = Math.min(...values);
    const maxVal = Math.max(...values);
    const range = maxVal - minVal || 1;

    const points = data.map((d, i) => {
        const x = padding.left + (i / (data.length - 1)) * chartWidth;
        const y =
            padding.top +
            chartHeight -
            ((parseFloat(String(d.total_value || 0)) - minVal) / range) *
                chartHeight;
        return {
            x,
            y,
            value: parseFloat(String(d.total_value || 0)),
            date: d.snapshot_date?.split("T")[0] || "",
        };
    });

    const pathD = points
        .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`)
        .join(" ");
    const areaD =
        pathD +
        ` L ${points[points.length - 1]!.x} ${padding.top + chartHeight} L ${points[0]!.x} ${padding.top + chartHeight} Z`;

    const formatTick = (v: number) =>
        v >= 1000000
            ? `${(v / 1000000).toFixed(1)}M`
            : v >= 1000
              ? `${(v / 1000).toFixed(0)}k`
              : `${v.toFixed(0)}`;

    const xLabels = points.filter((_, i) => {
        if (points.length <= 5) return true;
        return (
            i === 0 ||
            i === points.length - 1 ||
            i % Math.floor((points.length - 1) / 4) === 0
        );
    });

    const handleMouseMove = (e: MouseEvent<SVGSVGElement>) => {
        const rect = svgRef.current?.getBoundingClientRect();
        if (!rect) return;
        const mx = (e.clientX - rect.left) * (width / rect.width);
        let closest = 0,
            minDist = Infinity;
        points.forEach((p, i) => {
            const d = Math.abs(p.x - mx);
            if (d < minDist) {
                minDist = d;
                closest = i;
            }
        });
        setHoverIdx(closest);
    };

    const hp = hoverIdx !== null ? points[hoverIdx] : null;
    const tooltipW = 120,
        tooltipH = 36;
    const tooltipX = hp
        ? Math.min(
              Math.max(hp.x - tooltipW / 2, padding.left),
              padding.left + chartWidth - tooltipW,
          )
        : 0;
    const tooltipY = hp ? Math.max(hp.y - tooltipH - 10, padding.top) : 0;

    return (
        <div ref={containerRef} style={{ width: "100%" }}>
            <svg
                ref={svgRef}
                width={width}
                height={height}
                style={{ display: "block", cursor: "crosshair" }}
                onMouseMove={handleMouseMove}
                onMouseLeave={() => setHoverIdx(null)}
            >
                <defs>
                    <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop
                            offset="0%"
                            stopColor="var(--accent)"
                            stopOpacity="0.18"
                        />
                        <stop
                            offset="100%"
                            stopColor="var(--accent)"
                            stopOpacity="0"
                        />
                    </linearGradient>
                </defs>

                <line
                    x1={padding.left}
                    y1={padding.top + chartHeight}
                    x2={padding.left + chartWidth}
                    y2={padding.top + chartHeight}
                    stroke="var(--rule)"
                    strokeWidth={1}
                />
                <line
                    x1={padding.left}
                    y1={padding.top}
                    x2={padding.left}
                    y2={padding.top + chartHeight}
                    stroke="var(--rule)"
                    strokeWidth={1}
                />

                {[0, 0.5, 1].map((tick, i) => {
                    const val = minVal + tick * range;
                    const y = padding.top + chartHeight - tick * chartHeight;
                    return (
                        <g key={i}>
                            <line
                                x1={padding.left}
                                y1={y}
                                x2={padding.left + chartWidth}
                                y2={y}
                                stroke="var(--rule)"
                                strokeWidth={1}
                                strokeDasharray="3,4"
                            />
                            <text
                                x={padding.left - 6}
                                y={y + 4}
                                textAnchor="end"
                                fontSize="10"
                                fill="var(--fg-soft)"
                                fontFamily="var(--font-mono)"
                            >
                                {formatTick(val)}
                            </text>
                        </g>
                    );
                })}

                <path d={areaD} fill="url(#areaGrad)" />
                <path
                    d={pathD}
                    stroke="var(--accent)"
                    strokeWidth={2}
                    fill="none"
                    strokeLinejoin="round"
                />

                {points.map((p, i) => (
                    <circle
                        key={i}
                        cx={p.x}
                        cy={p.y}
                        r={hoverIdx === i ? 5 : 0}
                        fill="var(--accent)"
                        opacity={hoverIdx === i ? 1 : 0}
                    />
                ))}

                {hp && (
                    <g>
                        <line
                            x1={hp.x}
                            y1={padding.top}
                            x2={hp.x}
                            y2={padding.top + chartHeight}
                            stroke="var(--accent)"
                            strokeWidth={1}
                            strokeDasharray="3,3"
                            opacity={0.6}
                        />
                        <rect
                            x={tooltipX}
                            y={tooltipY}
                            width={tooltipW}
                            height={tooltipH}
                            fill="var(--card)"
                            stroke="var(--rule)"
                            strokeWidth={1}
                            rx={6}
                        />
                        <text
                            x={tooltipX + tooltipW / 2}
                            y={tooltipY + 13}
                            textAnchor="middle"
                            fontSize="11"
                            fill="var(--fg)"
                            fontFamily="var(--font-mono)"
                            fontWeight="600"
                        >
                            {formatEurFull(hp.value)}
                        </text>
                        <text
                            x={tooltipX + tooltipW / 2}
                            y={tooltipY + 27}
                            textAnchor="middle"
                            fontSize="9"
                            fill="var(--fg-soft)"
                            fontFamily="Helvetica Neue, Helvetica, sans-serif"
                        >
                            {hp.date}
                        </text>
                    </g>
                )}

                {xLabels.map((p, i) => (
                    <text
                        key={i}
                        x={p.x}
                        y={height - 4}
                        textAnchor="middle"
                        fontSize="9"
                        fill="var(--fg-soft)"
                        fontFamily="var(--font-mono)"
                    >
                        {p.date.slice(5)}
                    </text>
                ))}
            </svg>
        </div>
    );
});
