import { useEffect, useRef, useState } from "react";

type SparkPoint = { close: number; date: string };

type SparklineProps = {
    data?: SparkPoint[];
};

export default function Sparkline({ data }: SparklineProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [width, setWidth] = useState(300);

    useEffect(() => {
        if (!containerRef.current) return;
        const ro = new ResizeObserver((entries) => {
            const w = entries[0]?.contentRect.width;
            if (w != null) setWidth(w);
        });
        ro.observe(containerRef.current);
        return () => ro.disconnect();
    }, []);

    if (!data || data.length < 2) {
        return (
            <div
                style={{
                    height: 56,
                    display: "flex",
                    alignItems: "center",
                    color: "var(--fg-soft)",
                    fontSize: 11,
                }}
            >
                —
            </div>
        );
    }

    const H = 56;
    const PL = 44;
    const PR = 4;
    const PT = 4;
    const PB = 14;
    const W = width;
    const iW = W - PL - PR;
    const iH = H - PT - PB;
    const vals = data.map((p) => p.close);
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const range = max - min || 1;
    const toX = (i: number) => PL + (i / (vals.length - 1)) * iW;
    const toY = (v: number) => PT + (1 - (v - min) / range) * iH;

    const pts = vals.map((v, i) => `${toX(i).toFixed(1)},${toY(v).toFixed(1)}`);
    const pathD = `M ${pts[0]} L ${pts.slice(1).join(" L ")}`;
    const areaD = `M ${toX(0).toFixed(1)},${(PT + iH).toFixed(1)} L ${pts.join(" L ")} L ${toX(vals.length - 1).toFixed(1)},${(PT + iH).toFixed(1)} Z`;
    const first = vals[0]!;
    const last = vals[vals.length - 1]!;
    const trend = last >= first;
    const color = trend ? "var(--success)" : "var(--danger)";
    const changePct = ((last - first) / first) * 100;
    const id = `sp${vals.length}${(first * 100).toFixed(0)}`;

    return (
        <div ref={containerRef} style={{ position: "relative", width: "100%" }}>
            <div
                style={{
                    position: "absolute",
                    top: 2,
                    right: 0,
                    fontSize: 10,
                    fontFamily: "var(--font-mono)",
                    color,
                    fontWeight: 600,
                }}
            >
                {changePct >= 0 ? "+" : ""}
                {changePct.toFixed(2)}%
            </div>
            <svg width={W} height={H} style={{ display: "block" }}>
                <defs>
                    <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
                        <stop
                            offset="0%"
                            stopColor={color}
                            stopOpacity="0.18"
                        />
                        <stop
                            offset="100%"
                            stopColor={color}
                            stopOpacity="0.01"
                        />
                    </linearGradient>
                </defs>
                <path d={areaD} fill={`url(#${id})`} />
                <path d={pathD} fill="none" stroke={color} strokeWidth="1.5" />

                <text
                    x={PL - 3}
                    y={PT + 4}
                    textAnchor="end"
                    fontSize="9"
                    fill="var(--fg-soft)"
                    fontFamily="var(--font-mono)"
                >
                    {max >= 1000 ? max.toFixed(0) : max.toFixed(2)}
                </text>
                <text
                    x={PL - 3}
                    y={PT + iH}
                    textAnchor="end"
                    fontSize="9"
                    fill="var(--fg-soft)"
                    fontFamily="var(--font-mono)"
                >
                    {min >= 1000 ? min.toFixed(0) : min.toFixed(2)}
                </text>

                <text
                    x={PL}
                    y={H - 1}
                    textAnchor="start"
                    fontSize="9"
                    fill="var(--fg-soft)"
                    fontFamily="var(--font-mono)"
                >
                    {data[0]!.date.slice(5)}
                </text>
                <text
                    x={W - PR}
                    y={H - 1}
                    textAnchor="end"
                    fontSize="9"
                    fill="var(--fg-soft)"
                    fontFamily="var(--font-mono)"
                >
                    {data[data.length - 1]!.date.slice(5)}
                </text>
            </svg>
        </div>
    );
}
