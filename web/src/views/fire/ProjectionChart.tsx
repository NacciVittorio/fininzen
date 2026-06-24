"use client";

import type { FiredYear, FireProjectionPoint } from "../../api/fire";

type ProjectionChartProps = {
    projection: FireProjectionPoint[];
    firedYear: FiredYear;
};

type NetWorthKey = "nw_bear" | "nw_base" | "nw_bull";

export default function ProjectionChart({
    projection,
    firedYear,
}: ProjectionChartProps) {
    if (!projection || projection.length === 0) return null;

    const W = 1000;
    const H = 200;
    const PAD = { t: 10, r: 10, b: 30, l: 60 };
    const inner_w = W - PAD.l - PAD.r;
    const inner_h = H - PAD.t - PAD.b;

    const allValues = projection.flatMap((p) => [
        parseFloat(p.nw_bear),
        parseFloat(p.nw_base),
        parseFloat(p.nw_bull),
        parseFloat(p.fire_number),
    ]);
    const minV = Math.min(0, ...allValues);
    const maxV = Math.max(...allValues) * 1.05;
    const rangeV = maxV - minV || 1;
    const maxYr = projection.length;

    const toX = (yr: number) =>
        PAD.l + ((yr - 1) / Math.max(maxYr - 1, 1)) * inner_w;
    const toY = (v: number) => PAD.t + (1 - (v - minV) / rangeV) * inner_h;

    const line = (key: NetWorthKey, color: string) => {
        const d = projection
            .map(
                (p, i) =>
                    `${i === 0 ? "M" : "L"} ${toX(p.year)},${toY(parseFloat(p[key]))}`,
            )
            .join(" ");
        return (
            <path
                key={key}
                d={d}
                fill="none"
                stroke={color}
                strokeWidth="1.5"
            />
        );
    };

    const fireLine = projection
        .map(
            (p, i) =>
                `${i === 0 ? "M" : "L"} ${toX(p.year)},${toY(parseFloat(p.fire_number))}`,
        )
        .join(" ");

    const yTicks = 4;
    const ticks = Array.from(
        { length: yTicks + 1 },
        (_, i) => minV + (rangeV / yTicks) * i,
    );

    return (
        <svg
            viewBox={`0 0 ${W} ${H}`}
            style={{
                width: "100%",
                display: "block",
                borderRadius: 10,
                background: "var(--card-inset)",
            }}
        >
            {ticks.map((t) => (
                <g key={t}>
                    <line
                        x1={PAD.l}
                        y1={toY(t)}
                        x2={W - PAD.r}
                        y2={toY(t)}
                        stroke="var(--rule)"
                        strokeWidth="1"
                    />
                    <text
                        x={PAD.l - 4}
                        y={toY(t) + 4}
                        textAnchor="end"
                        fontSize="9"
                        fill="var(--fg-soft)"
                    >
                        {t >= 1e6
                            ? `${(t / 1e6).toFixed(1)}M`
                            : t >= 1e3
                              ? `${(t / 1e3).toFixed(0)}k`
                              : t.toFixed(0)}
                    </text>
                </g>
            ))}
            <path
                d={fireLine}
                fill="none"
                stroke="var(--fg-soft)"
                strokeDasharray="4,3"
                strokeWidth="1"
            />
            {line("nw_bear", "var(--chart-3)")}
            {line("nw_base", "var(--chart-1)")}
            {line("nw_bull", "var(--chart-2)")}
            {firedYear?.bear && (
                <circle
                    cx={toX(firedYear.bear)}
                    cy={toY(
                        parseFloat(
                            projection[firedYear.bear - 1]?.fire_number ?? "0",
                        ),
                    )}
                    r="4"
                    fill="var(--chart-3)"
                />
            )}
            {firedYear?.base && (
                <circle
                    cx={toX(firedYear.base)}
                    cy={toY(
                        parseFloat(
                            projection[firedYear.base - 1]?.fire_number ?? "0",
                        ),
                    )}
                    r="4"
                    fill="var(--chart-1)"
                />
            )}
            {firedYear?.bull && (
                <circle
                    cx={toX(firedYear.bull)}
                    cy={toY(
                        parseFloat(
                            projection[firedYear.bull - 1]?.fire_number ?? "0",
                        ),
                    )}
                    r="4"
                    fill="var(--chart-2)"
                />
            )}
            <text
                x={W - PAD.r}
                y={PAD.t + inner_h / 2}
                textAnchor="end"
                fontSize="9"
                fill="var(--fg-soft)"
            >
                FIRE line
            </text>
        </svg>
    );
}
