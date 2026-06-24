"use client";

import { useEffect, useRef, useState } from "react";
import type { MouseEvent, TouchEvent } from "react";
import { makeFormatTick } from "../../utils/formatters";
import { useFormatters } from "../../utils/useFormatters";

type SeriesDatum = { date: string; value: number };

type Series = {
    data: SeriesDatum[];
    label?: string;
    color?: string;
    yAxis?: "left" | "right";
};

type MultiLineChartProps = {
    series?: Series[];
    height?: number;
    goalLine?: number | null;
    goalLabel?: string;
};

type TooltipLine = {
    label?: string;
    color?: string;
    value: number;
    yAxis?: "left" | "right";
};

export function MultiLineChart({
    series = [],
    height = 220,
    goalLine = null,
    goalLabel = "",
}: MultiLineChartProps) {
    const { formatEurFull } = useFormatters();
    const containerRef = useRef<HTMLDivElement>(null);
    const svgRef = useRef<SVGSVGElement>(null);
    const [width, setWidth] = useState(340);
    const [hoverX, setHoverX] = useState<number | null>(null);

    useEffect(() => {
        if (!containerRef.current) return;
        const ro = new ResizeObserver((entries) => {
            const w = entries[0]?.contentRect.width;
            if (w != null) setWidth(w);
        });
        ro.observe(containerRef.current);
        return () => ro.disconnect();
    }, []);

    const activeSeries = series.filter((s) => s.data && s.data.length > 1);
    if (activeSeries.length === 0) return null;

    const hasRight = activeSeries.some((s) => s.yAxis === "right");
    const hasLeft = activeSeries.some((s) => s.yAxis !== "right");

    const padding = {
        top: 24,
        right: hasRight ? 56 : 20,
        bottom: 30,
        left: 56,
    };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    const allDates = [
        ...new Set(activeSeries.flatMap((s) => s.data.map((d) => d.date))),
    ].sort();
    if (allDates.length < 2) return null;

    const dateToX = (d: string): number | null => {
        const idx = allDates.indexOf(d);
        if (idx < 0) return null;
        return padding.left + (idx / (allDates.length - 1)) * chartWidth;
    };

    const leftVals = activeSeries
        .filter((s) => s.yAxis !== "right")
        .flatMap((s) => s.data.map((d) => d.value));
    if (goalLine != null && hasLeft) leftVals.push(goalLine);
    const rightVals = activeSeries
        .filter((s) => s.yAxis === "right")
        .flatMap((s) => s.data.map((d) => d.value));

    const yRange = (vals: number[]) => {
        const min = Math.min(...vals);
        const max = Math.max(...vals);
        const pad = (max - min) * 0.1 || Math.abs(max) * 0.1 || 1000;
        return { min: min - pad, max: max + pad };
    };

    const leftRange = hasLeft ? yRange(leftVals) : { min: 0, max: 1 };
    const rightRange = hasRight ? yRange(rightVals) : { min: 0, max: 1 };

    const toY = (value: number, axis?: "left" | "right") => {
        const { min, max } = axis === "right" ? rightRange : leftRange;
        return (
            padding.top +
            chartHeight -
            ((value - min) / (max - min)) * chartHeight
        );
    };

    const formatLeftTick = makeFormatTick(leftRange.max - leftRange.min);
    const formatRightTick = makeFormatTick(rightRange.max - rightRange.min);

    const buildPath = (s: Series) => {
        const pts = s.data
            .map((d) => ({ x: dateToX(d.date), y: toY(d.value, s.yAxis) }))
            .filter((p): p is { x: number; y: number } => p.x != null);
        if (pts.length < 2) return null;
        return {
            path: pts
                .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`)
                .join(" "),
            pts,
        };
    };

    const paths = activeSeries.map(buildPath);

    const getHoverIdx = (mx: number) => {
        let closest = 0,
            minDist = Infinity;
        allDates.forEach((d, i) => {
            const x = padding.left + (i / (allDates.length - 1)) * chartWidth;
            const dist = Math.abs(x - mx);
            if (dist < minDist) {
                minDist = dist;
                closest = i;
            }
        });
        return closest;
    };

    const handleMouseMove = (e: MouseEvent<SVGSVGElement>) => {
        const rect = svgRef.current?.getBoundingClientRect();
        if (!rect) return;
        const mx = (e.clientX - rect.left) * (width / rect.width);
        setHoverX(getHoverIdx(mx));
    };

    const handleTouch = (e: TouchEvent<SVGSVGElement>) => {
        const rect = svgRef.current?.getBoundingClientRect();
        if (!rect) return;
        const touch = e.touches[0];
        if (!touch) return;
        const mx = (touch.clientX - rect.left) * (width / rect.width);
        setHoverX(getHoverIdx(mx));
        e.preventDefault();
    };

    const hoverDate = hoverX != null ? allDates[hoverX] : null;
    const hoverSvgX =
        hoverX != null
            ? padding.left + (hoverX / (allDates.length - 1)) * chartWidth
            : null;

    const hoverTs = hoverDate ? new Date(hoverDate).getTime() : null;
    const tooltipLines: TooltipLine[] = hoverDate
        ? activeSeries
              .map((s): TooltipLine | null => {
                  const exact = s.data.find((d) => d.date === hoverDate);
                  if (exact)
                      return {
                          label: s.label,
                          color: s.color,
                          value: exact.value,
                          yAxis: s.yAxis,
                      };
                  if (!s.data.length || hoverTs == null) return null;
                  const seriesMin = new Date(s.data[0]!.date).getTime();
                  const seriesMax = new Date(
                      s.data[s.data.length - 1]!.date,
                  ).getTime();
                  if (hoverTs < seriesMin || hoverTs > seriesMax) return null;
                  const nearest = s.data.reduce((best, d) => {
                      const diff = Math.abs(
                          new Date(d.date).getTime() - hoverTs,
                      );
                      const bestDiff = Math.abs(
                          new Date(best.date).getTime() - hoverTs,
                      );
                      return diff < bestDiff ? d : best;
                  });
                  return {
                      label: s.label,
                      color: s.color,
                      value: nearest.value,
                      yAxis: s.yAxis,
                  };
              })
              .filter((l): l is TooltipLine => l != null && l.value != null)
        : [];

    const tooltipH = 18 + tooltipLines.length * 16;
    const tooltipW = 140;
    const tooltipY = padding.top + 4;
    const tooltipX =
        hoverSvgX != null
            ? Math.min(
                  Math.max(hoverSvgX - tooltipW / 2, padding.left),
                  padding.left + chartWidth - tooltipW,
              )
            : 0;

    const goalY = goalLine != null && hasLeft ? toY(goalLine, "left") : null;

    return (
        <div ref={containerRef} style={{ width: "100%" }}>
            <svg
                ref={svgRef}
                width={width}
                height={height}
                style={{
                    display: "block",
                    cursor: "crosshair",
                    overflow: "visible",
                }}
                onMouseMove={handleMouseMove}
                onMouseLeave={() => setHoverX(null)}
                onTouchStart={handleTouch}
                onTouchMove={handleTouch}
                onTouchEnd={() => setHoverX(null)}
            >
                <defs>
                    {activeSeries.map((s, i) => (
                        <linearGradient
                            key={i}
                            id={`mlGrad${i}`}
                            x1="0"
                            y1="0"
                            x2="0"
                            y2="1"
                        >
                            <stop
                                offset="0%"
                                stopColor={s.color}
                                stopOpacity="0.12"
                            />
                            <stop
                                offset="100%"
                                stopColor={s.color}
                                stopOpacity="0"
                            />
                        </linearGradient>
                    ))}
                </defs>

                {[0, 0.25, 0.5, 0.75, 1].map((tick, i) => {
                    const y = padding.top + tick * chartHeight;
                    const leftVal =
                        leftRange.min +
                        (1 - tick) * (leftRange.max - leftRange.min);
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
                            {hasLeft && (
                                <text
                                    x={padding.left - 6}
                                    y={y + 4}
                                    textAnchor="end"
                                    fontSize="10"
                                    fill="var(--fg-soft)"
                                    fontFamily="var(--font-mono)"
                                >
                                    {formatLeftTick(leftVal)}
                                </text>
                            )}
                            {hasRight && (
                                <text
                                    x={padding.left + chartWidth + 6}
                                    y={y + 4}
                                    textAnchor="start"
                                    fontSize="10"
                                    fill="var(--fg-soft)"
                                    fontFamily="var(--font-mono)"
                                >
                                    {formatRightTick(
                                        rightRange.min +
                                            (1 - tick) *
                                                (rightRange.max -
                                                    rightRange.min),
                                    )}
                                </text>
                            )}
                        </g>
                    );
                })}

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

                {goalY != null && (
                    <g>
                        <line
                            x1={padding.left}
                            y1={goalY}
                            x2={padding.left + chartWidth}
                            y2={goalY}
                            stroke="var(--warning)"
                            strokeWidth={1.5}
                            strokeDasharray="6,4"
                            opacity={0.8}
                        />
                        <text
                            x={padding.left + chartWidth - 4}
                            y={goalY - 5}
                            textAnchor="end"
                            fontSize="9"
                            fill="var(--warning)"
                            fontFamily="Helvetica Neue, Helvetica, sans-serif"
                        >
                            {goalLabel
                                ? `${goalLabel}: ${formatEurFull(goalLine)}`
                                : formatEurFull(goalLine)}
                        </text>
                    </g>
                )}

                {activeSeries.map((s, i) => {
                    const r = paths[i];
                    if (!r) return null;
                    const { path, pts } = r;
                    const areaPath = `${path} L ${pts[pts.length - 1]!.x} ${padding.top + chartHeight} L ${pts[0]!.x} ${padding.top + chartHeight} Z`;
                    return (
                        <g key={i}>
                            {s.yAxis !== "right" && (
                                <path d={areaPath} fill={`url(#mlGrad${i})`} />
                            )}
                            <path
                                d={path}
                                stroke={s.color}
                                strokeWidth={2}
                                fill="none"
                                strokeLinejoin="round"
                            />
                        </g>
                    );
                })}

                {hoverSvgX != null && (
                    <line
                        x1={hoverSvgX}
                        y1={padding.top}
                        x2={hoverSvgX}
                        y2={padding.top + chartHeight}
                        stroke="var(--fg-soft)"
                        strokeWidth={1}
                        strokeDasharray="3,3"
                        opacity={0.5}
                    />
                )}
                {hoverDate &&
                    activeSeries.map((s, i) => {
                        const pt = s.data.find((d) => d.date === hoverDate);
                        if (!pt) return null;
                        return (
                            <circle
                                key={i}
                                cx={hoverSvgX ?? undefined}
                                cy={toY(pt.value, s.yAxis)}
                                r={4}
                                fill={s.color}
                            />
                        );
                    })}

                {hoverDate && tooltipLines.length > 0 && (
                    <g>
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
                            x={tooltipX + 8}
                            y={tooltipY + 13}
                            fontSize="9"
                            fill="var(--fg-soft)"
                            fontFamily="Helvetica Neue, Helvetica, sans-serif"
                        >
                            {hoverDate}
                        </text>
                        {tooltipLines.map((l, i) => (
                            <g key={i}>
                                <circle
                                    cx={tooltipX + 12}
                                    cy={tooltipY + 22 + i * 16}
                                    r={3}
                                    fill={l.color}
                                />
                                <text
                                    x={tooltipX + 20}
                                    y={tooltipY + 26 + i * 16}
                                    fontSize="10"
                                    fill="var(--fg)"
                                    fontFamily="var(--font-mono)"
                                >
                                    {l.yAxis === "right"
                                        ? formatRightTick(l.value)
                                        : formatLeftTick(l.value)}
                                </text>
                                <text
                                    x={tooltipX + tooltipW - 6}
                                    y={tooltipY + 26 + i * 16}
                                    textAnchor="end"
                                    fontSize="9"
                                    fill="var(--fg-soft)"
                                    fontFamily="Helvetica Neue, Helvetica, sans-serif"
                                >
                                    {l.label}
                                </text>
                            </g>
                        ))}
                    </g>
                )}

                {allDates
                    .filter(
                        (_, i) =>
                            i === 0 ||
                            i === allDates.length - 1 ||
                            i %
                                Math.max(
                                    1,
                                    Math.floor((allDates.length - 1) / 4),
                                ) ===
                                0,
                    )
                    .map((d, i) => (
                        <text
                            key={i}
                            x={dateToX(d) ?? undefined}
                            y={height - 4}
                            textAnchor="middle"
                            fontSize="9"
                            fill="var(--fg-soft)"
                            fontFamily="var(--font-mono)"
                        >
                            {d.slice(5)}
                        </text>
                    ))}
            </svg>
        </div>
    );
}
