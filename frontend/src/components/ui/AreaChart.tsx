import { useId } from "react";

type Point = [number, number];

function buildPaths(
    values: number[] | null | undefined,
    w: number,
    h: number,
    pad: number,
): { line: string; area: string; points: Point[] } {
    if (!values || values.length === 0)
        return { line: "", area: "", points: [] };
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const innerW = w - pad * 2;
    const innerH = h - pad * 2;
    const dx = values.length > 1 ? innerW / (values.length - 1) : 0;
    const points: Point[] = values.map((v, i) => [
        pad + i * dx,
        pad + innerH * (1 - (v - min) / range),
    ]);
    const line = points
        .map((p, i) => (i === 0 ? `M${p[0]} ${p[1]}` : `L${p[0]} ${p[1]}`))
        .join(" ");
    const area = `${line} L${pad + innerW} ${pad + innerH} L${pad} ${pad + innerH} Z`;
    return { line, area, points };
}

type AreaChartProps = {
    values?: number[] | null;
    width?: number;
    height?: number;
    padding?: number;
    color?: string;
    fillStops?: [number, number];
    showEndDot?: boolean;
    ariaLabel?: string;
};

export default function AreaChart({
    values,
    width = 620,
    height = 240,
    padding = 14,
    color = "var(--accent)",
    fillStops = [0.18, 0],
    showEndDot = true,
    ariaLabel,
}: AreaChartProps) {
    const id = useId();
    const { line, area, points } = buildPaths(values, width, height, padding);
    const last = points.length ? points[points.length - 1] : null;
    return (
        <svg
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            style={{ display: "block", color, maxWidth: "100%" }}
            role="img"
            aria-label={ariaLabel}
        >
            <defs>
                <linearGradient id={`ac-${id}`} x1="0" x2="0" y1="0" y2="1">
                    <stop
                        offset="0%"
                        stopColor="currentColor"
                        stopOpacity={fillStops[0]}
                    />
                    <stop
                        offset="100%"
                        stopColor="currentColor"
                        stopOpacity={fillStops[1]}
                    />
                </linearGradient>
            </defs>
            {area && <path d={area} fill={`url(#ac-${id})`} />}
            {line && (
                <path
                    d={line}
                    stroke="currentColor"
                    strokeWidth="1.75"
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                />
            )}
            {showEndDot && last && (
                <circle
                    cx={last[0]}
                    cy={last[1]}
                    r="5"
                    fill="var(--card)"
                    stroke="currentColor"
                    strokeWidth="2"
                />
            )}
        </svg>
    );
}
