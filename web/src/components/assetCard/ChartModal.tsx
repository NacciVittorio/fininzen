"use client";

import { useMemo, useRef, useState } from "react";
import type { MouseEvent } from "react";
import { createPortal } from "react-dom";
import {
    PERIODS,
    cutoffFor,
    filterByPeriod,
    historyMetaBadge,
    type HistoryMeta,
    type PricePoint,
} from "./priceHistory";

type ChartModalAsset = {
    name?: string;
    ticker?: string;
    currency?: string;
};

type ChartModalProps = {
    data: PricePoint[];
    meta?: HistoryMeta | null;
    asset: ChartModalAsset;
    onClose: () => void;
    T: (key: string) => string;
};

type HoverState = { idx: number; x: number; y: number };

export default function ChartModal({
    data,
    meta,
    asset,
    onClose,
    T,
}: ChartModalProps) {
    const [period, setPeriod] = useState("1Y");
    const [hover, setHover] = useState<HoverState | null>(null);
    const svgRef = useRef<SVGSVGElement>(null);

    const pts = filterByPeriod(data, period);

    const metaBadge = useMemo(() => historyMetaBadge(meta, T), [meta, T]);
    const vals = pts.map((p) => p.close);
    const minV = vals.length ? Math.min(...vals) : 0;
    const maxV = vals.length ? Math.max(...vals) : 1;
    const rangeV = maxV - minV || 1;

    const W = 800;
    const H = 240;
    const PL = 62;
    const PR = 12;
    const PT = 16;
    const PB = 26;
    const iW = W - PL - PR;
    const iH = H - PT - PB;
    const toX = (i: number) => PL + (i / Math.max(vals.length - 1, 1)) * iW;
    const toY = (v: number) => PT + (1 - (v - minV) / rangeV) * iH;

    const trend = vals.length >= 2 ? vals[vals.length - 1]! >= vals[0]! : true;
    const color = trend ? "var(--success)" : "var(--danger)";

    const pathD = vals
        .map(
            (v, i) =>
                `${i === 0 ? "M" : "L"} ${toX(i).toFixed(1)},${toY(v).toFixed(1)}`,
        )
        .join(" ");
    const areaD =
        vals.length >= 2
            ? `M ${toX(0).toFixed(1)},${(PT + iH).toFixed(1)} ${vals.map((v, i) => `L ${toX(i).toFixed(1)},${toY(v).toFixed(1)}`).join(" ")} L ${toX(vals.length - 1).toFixed(1)},${(PT + iH).toFixed(1)} Z`
            : "";

    const yTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => ({
        v: minV + t * rangeV,
        y: PT + (1 - t) * iH,
    }));

    const xCount = Math.min(6, pts.length);
    const xLabels =
        xCount > 1
            ? Array.from({ length: xCount }, (_, i) => {
                  const idx = Math.round((i * (pts.length - 1)) / (xCount - 1));
                  return { x: toX(idx), label: pts[idx]?.date.slice(5) ?? "" };
              })
            : [];

    const handleMouseMove = (e: MouseEvent<SVGSVGElement>) => {
        if (!svgRef.current || vals.length < 2) return;
        const rect = svgRef.current.getBoundingClientRect();
        const relX = ((e.clientX - rect.left) / rect.width) * W;
        const frac = Math.max(0, Math.min(1, (relX - PL) / iW));
        const idx = Math.min(
            Math.round(frac * (vals.length - 1)),
            vals.length - 1,
        );
        setHover({ idx, x: toX(idx), y: toY(vals[idx]!) });
    };

    const hIdx =
        hover !== null && hover.idx < vals.length ? hover.idx : vals.length - 1;
    const dispPrice = vals[hIdx];
    const dispDate = pts[hIdx]?.date ?? "";
    const first = vals[0];
    const changePct =
        first && dispPrice != null ? ((dispPrice - first) / first) * 100 : 0;

    const modal = (
        <div
            style={{
                position: "fixed",
                inset: 0,
                zIndex: 1200,
                background:
                    "color-mix(in oklab, var(--card-inset) 80%, transparent)",
                backdropFilter: "blur(4px)",
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "center",
                padding:
                    "max(12px, calc(env(safe-area-inset-top) + 12px)) 20px max(12px, calc(env(safe-area-inset-bottom) + 12px))",
                overflowY: "auto",
            }}
            onClick={onClose}
        >
            <div
                style={{
                    background: `var(--rule-soft)`,
                    border: "1px solid var(--rule)",
                    borderRadius: 16,
                    width: "100%",
                    maxWidth: "min(740px, 95vw)",
                    maxHeight:
                        "calc(100dvh - 24px - env(safe-area-inset-top) - env(safe-area-inset-bottom))",
                    overflowY: "auto",
                    padding: "18px 18px 14px",
                    boxShadow: "var(--shadow-modal)",
                }}
                onClick={(e) => e.stopPropagation()}
            >
                <div
                    style={{
                        display: "flex",
                        alignItems: "flex-start",
                        justifyContent: "space-between",
                        marginBottom: 12,
                    }}
                >
                    <div>
                        <div
                            style={{
                                fontSize: 15,
                                fontWeight: 700,
                                color: "var(--fg)",
                            }}
                        >
                            {asset.name}
                        </div>
                        <div
                            style={{
                                display: "flex",
                                gap: 10,
                                alignItems: "baseline",
                                marginTop: 3,
                            }}
                        >
                            {asset.ticker && (
                                <span
                                    style={{
                                        fontSize: 11,
                                        fontFamily: "var(--font-mono)",
                                        color: "var(--fg-soft)",
                                    }}
                                >
                                    {asset.ticker}
                                </span>
                            )}
                            <span
                                style={{
                                    fontSize: 20,
                                    fontFamily: "var(--font-mono)",
                                    fontWeight: 700,
                                    color: "var(--fg)",
                                }}
                            >
                                {dispPrice != null
                                    ? `${dispPrice.toFixed(2)} ${asset.currency || "EUR"}`
                                    : "—"}
                            </span>
                            <span
                                style={{
                                    fontSize: 13,
                                    fontFamily: "var(--font-mono)",
                                    color,
                                    fontWeight: 600,
                                }}
                            >
                                {changePct >= 0 ? "+" : ""}
                                {changePct.toFixed(2)}%
                            </span>
                            {hover && (
                                <span
                                    style={{
                                        fontSize: 11,
                                        color: "var(--fg-soft)",
                                        fontFamily: "var(--font-mono)",
                                    }}
                                >
                                    {dispDate}
                                </span>
                            )}
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        aria-label="Close"
                        style={{
                            background: "var(--card-inset)",
                            border: "1px solid var(--rule)",
                            color: "var(--fg-soft)",
                            borderRadius: 8,
                            padding: "5px 11px",
                            fontSize: 13,
                            cursor: "pointer",
                            fontFamily: "inherit",
                        }}
                    >
                        ✕
                    </button>
                </div>

                {metaBadge && (
                    <div
                        style={{
                            fontSize: 11,
                            padding: "6px 10px",
                            marginBottom: 8,
                            borderRadius: 6,
                            background: "var(--card-inset)",
                            color: metaBadge.tone,
                            border: `1px solid var(--rule)`,
                        }}
                    >
                        {metaBadge.text}
                    </div>
                )}

                <div style={{ display: "flex", gap: 4, marginBottom: 10 }}>
                    {PERIODS.map((p) => {
                        const pCut = cutoffFor(p);
                        const available =
                            !pCut ||
                            (data.length >= 2 && data[0]!.date <= pCut);
                        return (
                            <button
                                key={p}
                                onClick={() => {
                                    setPeriod(p);
                                    setHover(null);
                                }}
                                style={{
                                    background:
                                        period === p
                                            ? `${color}22`
                                            : "transparent",
                                    border: `1px solid ${period === p ? color : "var(--rule)"}`,
                                    color:
                                        period === p
                                            ? color
                                            : available
                                              ? "var(--fg-soft)"
                                              : "var(--fg-faint)",
                                    borderRadius: 6,
                                    padding: "3px 10px",
                                    fontSize: 11,
                                    fontWeight: 600,
                                    cursor: available ? "pointer" : "default",
                                    fontFamily: "inherit",
                                }}
                            >
                                {p}
                            </button>
                        );
                    })}
                </div>

                {vals.length >= 2 ? (
                    <svg
                        ref={svgRef}
                        viewBox={`0 0 ${W} ${H}`}
                        style={{
                            width: "100%",
                            display: "block",
                            cursor: "crosshair",
                        }}
                        preserveAspectRatio="none"
                        onMouseMove={handleMouseMove}
                        onMouseLeave={() => setHover(null)}
                    >
                        <defs>
                            <linearGradient
                                id="cm-g"
                                x1="0"
                                y1="0"
                                x2="0"
                                y2="1"
                            >
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
                        {yTicks.map(({ y }, i) => (
                            <line
                                key={i}
                                x1={PL}
                                y1={y}
                                x2={W - PR}
                                y2={y}
                                stroke="var(--card-inset)"
                                strokeWidth="1"
                            />
                        ))}
                        <path d={areaD} fill="url(#cm-g)" />
                        <path
                            d={pathD}
                            fill="none"
                            stroke={color}
                            strokeWidth="1.8"
                            strokeLinejoin="round"
                        />
                        {hover ? (
                            <>
                                <line
                                    x1={hover.x}
                                    y1={PT}
                                    x2={hover.x}
                                    y2={PT + iH}
                                    stroke="var(--fg-faint)"
                                    opacity="0.5"
                                    strokeWidth="1"
                                    strokeDasharray="3,3"
                                />
                                <line
                                    x1={PL}
                                    y1={hover.y}
                                    x2={W - PR}
                                    y2={hover.y}
                                    stroke="var(--fg-faint)"
                                    opacity="0.3"
                                    strokeWidth="1"
                                    strokeDasharray="3,3"
                                />
                                <circle
                                    cx={hover.x}
                                    cy={hover.y}
                                    r="4"
                                    fill={color}
                                    stroke="var(--bg)"
                                    strokeWidth="2"
                                />
                            </>
                        ) : (
                            <circle
                                cx={toX(vals.length - 1)}
                                cy={toY(vals[vals.length - 1]!)}
                                r="3.5"
                                fill={color}
                                stroke="var(--bg)"
                                strokeWidth="2"
                            />
                        )}
                        {yTicks.map(({ v, y }, i) => (
                            <text
                                key={i}
                                x={PL - 5}
                                y={y + 4}
                                textAnchor="end"
                                fontSize="10"
                                fill="var(--fg-soft)"
                                fontFamily="var(--font-mono)"
                            >
                                {v >= 1000 ? v.toFixed(0) : v.toFixed(2)}
                            </text>
                        ))}
                        {xLabels.map(({ x, label }, i) => (
                            <text
                                key={i}
                                x={x}
                                y={H - 3}
                                textAnchor="middle"
                                fontSize="10"
                                fill="var(--fg-soft)"
                                fontFamily="var(--font-mono)"
                            >
                                {label}
                            </text>
                        ))}
                    </svg>
                ) : (
                    <div
                        style={{
                            height: 180,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            color: "var(--fg-soft)",
                            fontSize: 13,
                        }}
                    >
                        {T("no_price_data")}
                    </div>
                )}

                {pts.length >= 2 && (
                    <div
                        style={{
                            display: "flex",
                            justifyContent: "space-between",
                            marginTop: 4,
                        }}
                    >
                        <span
                            style={{
                                fontSize: 10,
                                color: "var(--fg-faint)",
                                fontFamily: "var(--font-mono)",
                            }}
                        >
                            {pts[0]!.date}
                        </span>
                        <span
                            style={{
                                fontSize: 10,
                                color: "var(--fg-faint)",
                                fontFamily: "var(--font-mono)",
                            }}
                        >
                            {pts[pts.length - 1]!.date}
                        </span>
                    </div>
                )}
            </div>
        </div>
    );

    return typeof document !== "undefined"
        ? createPortal(modal, document.body)
        : modal;
}
