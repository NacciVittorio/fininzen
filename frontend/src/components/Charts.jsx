import { useState, useEffect, useRef } from "react";
import { makeFormatTick } from "../utils/formatters";
import { useFormatters } from "../utils/useFormatters";

export function PieChart({
  data,
  size = 180,
  onSliceClick = null,
  hoveredIndex = null,
  onHoverChange = null,
  tLabel = "total",
  tPctOfTotal = "of total",
}) {
  const { formatEur } = useFormatters();
  const [innerHover, setInnerHover] = useState(null);
  const activeIdx = hoveredIndex !== null ? hoveredIndex : innerHover;

  if (!data || data.length === 0) return null;
  const total = data.reduce((s, d) => s + parseFloat(d.total || 0), 0);
  if (total === 0) return null;

  const cx = size / 2,
    cy = size / 2,
    r = size / 2 - 12;
  let startAngle = -Math.PI / 2;
  const slices = data.map((d) => {
    const pct = parseFloat(d.total || 0) / total;
    const angle = pct * 2 * Math.PI;
    const endAngle = startAngle + angle;
    const midAngle = startAngle + angle / 2;
    const x1 = cx + r * Math.cos(startAngle);
    const y1 = cy + r * Math.sin(startAngle);
    const x2 = cx + r * Math.cos(endAngle);
    const y2 = cy + r * Math.sin(endAngle);
    const largeArc = angle > Math.PI ? 1 : 0;
    const path = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`;
    // A slice spanning the whole circle (single 100% entry) cannot be drawn with
    // one SVG arc — start and end points coincide, so the path renders nothing.
    // Flag it so the renderer draws a full <circle> instead.
    const slice = { ...d, path, pct, midAngle, isFull: pct >= 0.9999 };
    startAngle = endAngle;
    return slice;
  });

  const setHover = (i) => {
    setInnerHover(i);
    onHoverChange && onHoverChange(i);
  };
  const active = activeIdx !== null ? slices[activeIdx] : null;
  const sliceKey = (s, i) =>
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
          {active ? `${(active.pct * 100).toFixed(1)}%` : formatEur(total)}
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
          {active ? active.category__name || "—" : tLabel}
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
          <span style={{ color: active.category__color }}>●</span>{" "}
          {active.category__icon} {active.category__name || "—"}{" "}
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

export function LineChart({ data, height = 180, label = "Portfolio Value" }) {
  const { formatEurFull } = useFormatters();
  const containerRef = useRef(null);
  const svgRef = useRef(null);
  const [width, setWidth] = useState(340);
  const [hoverIdx, setHoverIdx] = useState(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) =>
      setWidth(entries[0].contentRect.width),
    );
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  if (!data || data.length < 2) return null;

  const padding = { top: 20, right: 20, bottom: 30, left: 50 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  const values = data.map((d) => parseFloat(d.total_value || 0));
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const range = maxVal - minVal || 1;

  const points = data.map((d, i) => {
    const x = padding.left + (i / (data.length - 1)) * chartWidth;
    const y =
      padding.top +
      chartHeight -
      ((parseFloat(d.total_value || 0) - minVal) / range) * chartHeight;
    return {
      x,
      y,
      value: parseFloat(d.total_value || 0),
      date: d.snapshot_date?.split("T")[0] || "",
    };
  });

  const pathD = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`)
    .join(" ");
  const areaD =
    pathD +
    ` L ${points[points.length - 1].x} ${padding.top + chartHeight} L ${points[0].x} ${padding.top + chartHeight} Z`;

  const formatTick = (v) =>
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

  const handleMouseMove = (e) => {
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
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.18" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
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
}

/**
 * Multi-series line chart with optional dual Y axis and a horizontal goal line.
 * series: [{label, data: [{date, value}], color, yAxis: 'left'|'right'}]
 * goalLine: number|null — horizontal dashed line on left axis
 * goalLabel: string — i18n prefix shown next to the goal value (e.g. "Obiettivo")
 */
export function MultiLineChart({
  series = [],
  height = 220,
  goalLine = null,
  goalLabel = "",
}) {
  const { formatEurFull } = useFormatters();
  const containerRef = useRef(null);
  const svgRef = useRef(null);
  const [width, setWidth] = useState(340);
  const [hoverX, setHoverX] = useState(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) =>
      setWidth(entries[0].contentRect.width),
    );
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

  // Collect all dates across series and map them to x positions
  const allDates = [
    ...new Set(activeSeries.flatMap((s) => s.data.map((d) => d.date))),
  ].sort();
  if (allDates.length < 2) return null;

  const dateToX = (d) => {
    const idx = allDates.indexOf(d);
    if (idx < 0) return null;
    return padding.left + (idx / (allDates.length - 1)) * chartWidth;
  };

  // Y range per axis
  const leftVals = activeSeries
    .filter((s) => s.yAxis !== "right")
    .flatMap((s) => s.data.map((d) => d.value));
  if (goalLine != null && hasLeft) leftVals.push(goalLine);
  const rightVals = activeSeries
    .filter((s) => s.yAxis === "right")
    .flatMap((s) => s.data.map((d) => d.value));

  const yRange = (vals) => {
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const pad = (max - min) * 0.1 || Math.abs(max) * 0.1 || 1000;
    return { min: min - pad, max: max + pad };
  };

  const leftRange = hasLeft ? yRange(leftVals) : { min: 0, max: 1 };
  const rightRange = hasRight ? yRange(rightVals) : { min: 0, max: 1 };

  const toY = (value, axis) => {
    const { min, max } = axis === "right" ? rightRange : leftRange;
    return (
      padding.top + chartHeight - ((value - min) / (max - min)) * chartHeight
    );
  };

  const formatLeftTick = makeFormatTick(leftRange.max - leftRange.min);
  const formatRightTick = makeFormatTick(rightRange.max - rightRange.min);

  const buildPath = (s) => {
    const pts = s.data
      .map((d) => ({ x: dateToX(d.date), y: toY(d.value, s.yAxis) }))
      .filter((p) => p.x != null);
    if (pts.length < 2) return null;
    return {
      path: pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" "),
      pts,
    };
  };

  const paths = activeSeries.map(buildPath);

  // Find hover index from x mouse position
  const getHoverIdx = (mx) => {
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

  const handleMouseMove = (e) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mx = (e.clientX - rect.left) * (width / rect.width);
    setHoverX(getHoverIdx(mx));
  };

  const handleTouch = (e) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const touch = e.touches[0];
    const mx = (touch.clientX - rect.left) * (width / rect.width);
    setHoverX(getHoverIdx(mx));
    e.preventDefault();
  };

  const hoverDate = hoverX != null ? allDates[hoverX] : null;
  const hoverSvgX =
    hoverX != null
      ? padding.left + (hoverX / (allDates.length - 1)) * chartWidth
      : null;

  // Tooltip content — for series with sparse data (e.g. monthly) use nearest point
  const hoverTs = hoverDate ? new Date(hoverDate).getTime() : null;
  const tooltipLines = hoverDate
    ? activeSeries
        .map((s) => {
          const exact = s.data.find((d) => d.date === hoverDate);
          if (exact)
            return {
              label: s.label,
              color: s.color,
              value: exact.value,
              yAxis: s.yAxis,
            };
          // Nearest point within the series date range
          if (!s.data.length) return null;
          const seriesMin = new Date(s.data[0].date).getTime();
          const seriesMax = new Date(s.data[s.data.length - 1].date).getTime();
          if (hoverTs < seriesMin || hoverTs > seriesMax) return null;
          const nearest = s.data.reduce((best, d) => {
            const diff = Math.abs(new Date(d.date).getTime() - hoverTs);
            const bestDiff = Math.abs(new Date(best.date).getTime() - hoverTs);
            return diff < bestDiff ? d : best;
          });
          return {
            label: s.label,
            color: s.color,
            value: nearest.value,
            yAxis: s.yAxis,
          };
        })
        .filter(Boolean)
        .filter((l) => l.value != null)
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
              <stop offset="0%" stopColor={s.color} stopOpacity="0.12" />
              <stop offset="100%" stopColor={s.color} stopOpacity="0" />
            </linearGradient>
          ))}
        </defs>

        {/* Grid lines + left Y axis ticks */}
        {[0, 0.25, 0.5, 0.75, 1].map((tick, i) => {
          const y = padding.top + tick * chartHeight;
          const leftVal =
            leftRange.min + (1 - tick) * (leftRange.max - leftRange.min);
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
                      (1 - tick) * (rightRange.max - rightRange.min),
                  )}
                </text>
              )}
            </g>
          );
        })}

        {/* X axis border */}
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

        {/* Goal line */}
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

        {/* Series paths + areas */}
        {activeSeries.map((s, i) => {
          const r = paths[i];
          if (!r) return null;
          const { path, pts } = r;
          const areaPath = `${path} L ${pts[pts.length - 1].x} ${padding.top + chartHeight} L ${pts[0].x} ${padding.top + chartHeight} Z`;
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

        {/* Hover vertical line + dots */}
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
                cx={hoverSvgX}
                cy={toY(pt.value, s.yAxis)}
                r={4}
                fill={s.color}
              />
            );
          })}

        {/* Tooltip */}
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

        {/* X axis date labels */}
        {allDates
          .filter(
            (_, i) =>
              i === 0 ||
              i === allDates.length - 1 ||
              i % Math.max(1, Math.floor((allDates.length - 1) / 4)) === 0,
          )
          .map((d, i) => (
            <text
              key={i}
              x={dateToX(d)}
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

export function BarTrendChart({ data, height = 120, color = "var(--accent)" }) {
  const containerRef = useRef(null);
  const [width, setWidth] = useState(340);

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) =>
      setWidth(entries[0].contentRect.width),
    );
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  if (!data || data.length === 0) return null;

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
}

export function BarRow({ label, value, total, color, extra }) {
  const { formatEur } = useFormatters();
  const pct = total > 0 ? (value / total) * 100 : 0;
  return (
    <div style={{ marginBottom: 12 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: 4,
        }}
      >
        <span style={{ fontSize: 13, color: "var(--fg)" }}>{label}</span>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          {extra && (
            <span style={{ fontSize: 12, color: "var(--fg-soft)" }}>
              {extra}
            </span>
          )}
          <span
            style={{
              fontSize: 13,
              fontWeight: 600,
              fontFamily: "var(--font-mono)",
            }}
          >
            {formatEur(value)}
          </span>
        </div>
      </div>
      <div
        style={{
          height: 5,
          background: "var(--card-inset)",
          borderRadius: 3,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${pct}%`,
            background: color,
            borderRadius: 3,
            transition: "width 0.6s ease",
          }}
        />
      </div>
    </div>
  );
}
