import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { useFormatters } from "../utils/useFormatters";
import { API } from "../utils/api";
import PrivacyValue from "./PrivacyValue";
import { SwipeRow, BottomSheet, CategoryDot, Icon } from "./ui";

// ─── range helpers ────────────────────────────────────────────────────────────

const PERIODS = ["1D", "1W", "1M", "6M", "1Y", "YTD", "MAX"];

function cutoffFor(period) {
  const today = new Date();
  if (period === "MAX") return null;
  if (period === "YTD") return `${today.getFullYear()}-01-01`;
  const d = new Date(today);
  if (period === "1D") d.setDate(today.getDate() - 2);
  else if (period === "1W") d.setDate(today.getDate() - 7);
  else if (period === "1M") d.setMonth(today.getMonth() - 1);
  else if (period === "6M") d.setMonth(today.getMonth() - 6);
  else if (period === "1Y") d.setFullYear(today.getFullYear() - 1);
  return d.toISOString().slice(0, 10);
}

function filterByPeriod(data, period) {
  if (!data || data.length === 0) return [];
  const cut = cutoffFor(period);
  if (!cut) return data; // MAX
  const filtered = data.filter((p) => p.date >= cut);
  // if period has no data just return what we have (avoids blank chart)
  return filtered.length >= 2 ? filtered : data;
}

function historyMetaBadge(meta, T) {
  if (!meta) return null;
  if (meta.status === "error") {
    return {
      tone: "var(--danger)",
      text:
        meta.message || (T && T("chart_data_error")) || "Price source error",
    };
  }
  if (meta.status === "no_data") {
    return {
      tone: "var(--warning)",
      text:
        meta.message ||
        (T && T("chart_no_data")) ||
        "No price history returned for this instrument",
    };
  }
  if (meta.status === "partial") {
    return {
      tone: "var(--warning)",
      text:
        meta.message ||
        (meta.earliestAvailable
          ? `${(T && T("chart_data_from")) || "Data available from"} ${meta.earliestAvailable}`
          : (T && T("chart_history_partial")) || "Partial price history"),
    };
  }
  return null;
}

// ─── interactive chart modal ──────────────────────────────────────────────────

function ChartModal({ data, meta, asset, onClose, T }) {
  const [period, setPeriod] = useState("1Y");
  const [hover, setHover] = useState(null);
  const svgRef = useRef(null);

  const pts = filterByPeriod(data, period);

  const metaBadge = useMemo(() => historyMetaBadge(meta, T), [meta, T]);
  const vals = pts.map((p) => p.close);
  const minV = vals.length ? Math.min(...vals) : 0;
  const maxV = vals.length ? Math.max(...vals) : 1;
  const rangeV = maxV - minV || 1;

  const W = 800,
    H = 240,
    PL = 62,
    PR = 12,
    PT = 16,
    PB = 26;
  const iW = W - PL - PR;
  const iH = H - PT - PB;
  const toX = (i) => PL + (i / Math.max(vals.length - 1, 1)) * iW;
  const toY = (v) => PT + (1 - (v - minV) / rangeV) * iH;

  const trend = vals.length >= 2 ? vals[vals.length - 1] >= vals[0] : true;
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
          return { x: toX(idx), label: pts[idx].date.slice(5) };
        })
      : [];

  const handleMouseMove = (e) => {
    if (!svgRef.current || vals.length < 2) return;
    const rect = svgRef.current.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * W;
    const frac = Math.max(0, Math.min(1, (relX - PL) / iW));
    const idx = Math.min(Math.round(frac * (vals.length - 1)), vals.length - 1);
    setHover({ idx, x: toX(idx), y: toY(vals[idx]) });
  };

  const hIdx =
    hover !== null && hover.idx < vals.length ? hover.idx : vals.length - 1;
  const dispPrice = vals[hIdx];
  const dispDate = pts[hIdx]?.date ?? "";
  const changePct = vals[0] ? ((dispPrice - vals[0]) / vals[0]) * 100 : 0;

  const modal = (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1200,
        background: "color-mix(in oklab, var(--card-inset) 80%, transparent)",
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
        {/* Header */}
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

        {/* Period buttons */}
        <div style={{ display: "flex", gap: 4, marginBottom: 10 }}>
          {PERIODS.map((p) => {
            const pCut = cutoffFor(p);
            const available =
              !pCut || (data.length >= 2 && data[0].date <= pCut);
            return (
              <button
                key={p}
                onClick={() => {
                  setPeriod(p);
                  setHover(null);
                }}
                style={{
                  background: period === p ? `${color}22` : "transparent",
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

        {/* SVG */}
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
              <linearGradient id="cm-g" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity="0.18" />
                <stop offset="100%" stopColor={color} stopOpacity="0.01" />
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
                cy={toY(vals[vals.length - 1])}
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

        {/* Date range info */}
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
              {pts[0].date}
            </span>
            <span
              style={{
                fontSize: 10,
                color: "var(--fg-faint)",
                fontFamily: "var(--font-mono)",
              }}
            >
              {pts[pts.length - 1].date}
            </span>
          </div>
        )}
      </div>
    </div>
  );

  // Same reason as BottomSheet: rendered inline the fixed overlay binds to
  // PullToRefresh's transformed wrapper (containing block for position:fixed),
  // trapping its z-index under the FAB and bottom nav.
  return typeof document !== "undefined"
    ? createPortal(modal, document.body)
    : modal;
}

// ─── mini sparkline con labels ───────────────────────────────────────────────

function Sparkline({ data }) {
  const containerRef = useRef(null);
  const [width, setWidth] = useState(300);

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) =>
      setWidth(entries[0].contentRect.width),
    );
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  if (!data || data.length < 2)
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

  const H = 56,
    PL = 44,
    PR = 4,
    PT = 4,
    PB = 14;
  const W = width;
  const iW = W - PL - PR;
  const iH = H - PT - PB;
  const vals = data.map((p) => p.close);
  const min = Math.min(...vals),
    max = Math.max(...vals);
  const range = max - min || 1;
  const toX = (i) => PL + (i / (vals.length - 1)) * iW;
  const toY = (v) => PT + (1 - (v - min) / range) * iH;

  const pts = vals.map((v, i) => `${toX(i).toFixed(1)},${toY(v).toFixed(1)}`);
  const pathD = `M ${pts[0]} L ${pts.slice(1).join(" L ")}`;
  const areaD = `M ${toX(0).toFixed(1)},${(PT + iH).toFixed(1)} L ${pts.join(" L ")} L ${toX(vals.length - 1).toFixed(1)},${(PT + iH).toFixed(1)} Z`;
  const trend = vals[vals.length - 1] >= vals[0];
  const color = trend ? "var(--success)" : "var(--danger)";
  const changePct = ((vals[vals.length - 1] - vals[0]) / vals[0]) * 100;
  const id = `sp${vals.length}${(vals[0] * 100).toFixed(0)}`;

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
            <stop offset="0%" stopColor={color} stopOpacity="0.18" />
            <stop offset="100%" stopColor={color} stopOpacity="0.01" />
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
          {data[0].date.slice(5)}
        </text>
        <text
          x={W - PR}
          y={H - 1}
          textAnchor="end"
          fontSize="9"
          fill="var(--fg-soft)"
          fontFamily="var(--font-mono)"
        >
          {data[data.length - 1].date.slice(5)}
        </text>
      </svg>
    </div>
  );
}

// ─── stat cell ───────────────────────────────────────────────────────────────

function StatCell({ label, value, color, sub }) {
  return (
    <div
      style={{
        background: "var(--card-inset)",
        borderRadius: 9,
        padding: "8px 10px",
        border: "1px solid var(--rule)",
      }}
    >
      <div
        style={{
          fontSize: 9,
          color: "var(--fg-soft)",
          textTransform: "uppercase",
          letterSpacing: 0,
          marginBottom: 3,
        }}
      >
        {label}
      </div>
      <div
        className="mono"
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: color || "var(--fg)",
        }}
      >
        {value}
      </div>
      {sub && (
        <div
          className="mono"
          style={{ fontSize: 10, color: "var(--fg-soft)", marginTop: 1 }}
        >
          {sub}
        </div>
      )}
    </div>
  );
}

// ─── main ────────────────────────────────────────────────────────────────────

// Asset row: swipe → quick actions (Edit/Archive/Delete, Unarchive when archived),
// tap → detail bottom sheet with the stats grid, notes and price chart.
export default function AssetCard({
  a,
  onDelete,
  onEdit,
  onAdjust,
  onRealize,
  onArchive,
  onMove,
  onUnarchive,
  T,
  totalPortfolioValue,
  priceRefreshCounter,
  apiFetch,
  isValueHidden,
  openSwipeId,
  onRequestSwipeOpen,
  isLast = true,
}) {
  const { formatEur, formatEurFull } = useFormatters();
  const [detailOpen, setDetailOpen] = useState(false);
  const [priceHistory, setPriceHistory] = useState(null);
  const [priceHistoryMeta, setPriceHistoryMeta] = useState(null);
  const [loadingChart, setLoadingChart] = useState(false);
  const [showChart, setShowChart] = useState(false);
  // Swipe-open coordination: controlled by the parent list when provided,
  // self-contained otherwise (unit tests render the card standalone).
  const [localSwipeOpen, setLocalSwipeOpen] = useState(null);
  const swipeOpenId = openSwipeId !== undefined ? openSwipeId : localSwipeOpen;
  const requestSwipeOpen = onRequestSwipeOpen || setLocalSwipeOpen;

  useEffect(() => {
    if (priceRefreshCounter > 0) {
      setPriceHistory(null);
      setPriceHistoryMeta(null);
    }
  }, [priceRefreshCounter]);

  const gain = parseFloat(a.gain || 0);
  const gainPct = parseFloat(a.gain_percent || 0);
  const typeDetail = a.investment_type_detail;
  const typeColor = typeDetail?.color || "var(--accent)";
  const typeName = typeDetail?.name || "Unknown";
  const isManual = a.tracking_type === "MANUAL";
  const hasTicker = a.has_ticker && (a.source_symbol || a.ticker);
  const canLoadHistory = typeof apiFetch === "function";
  const historyWarning = useMemo(
    () => historyMetaBadge(priceHistoryMeta, T),
    [priceHistoryMeta, T],
  );
  const masked = (value) => (
    <PrivacyValue scope="investments" field="asset_values">
      {value}
    </PrivacyValue>
  );

  const allocPct =
    totalPortfolioValue > 0
      ? (parseFloat(a.current_value || 0) / totalPortfolioValue) * 100
      : null;

  const avgCost =
    !isManual && parseFloat(a.shares || 0) > 0
      ? parseFloat(a.invested_capital || 0) / parseFloat(a.shares)
      : null;

  const fetchHistory = useCallback(() => {
    if (!canLoadHistory || priceHistory !== null) return;
    setLoadingChart(true);
    apiFetch(`${API}/portfolio/${a.id}/price-history/?days=3650`)
      .then((r) => r.json())
      .then((d) => {
        // Backend response shape: {points, earliest_available, requested_since, status, message}
        // Legacy fallback: bare array (older deployments).
        if (Array.isArray(d)) {
          setPriceHistory(d);
          setPriceHistoryMeta(null);
        } else if (d && Array.isArray(d.points)) {
          setPriceHistory(d.points);
          setPriceHistoryMeta({
            earliestAvailable: d.earliest_available,
            requestedSince: d.requested_since,
            status: d.status,
            message: d.message,
          });
        } else {
          setPriceHistory([]);
          setPriceHistoryMeta(null);
        }
      })
      .catch(() => {
        setPriceHistory([]);
        setPriceHistoryMeta({ status: "error", message: "network" });
      })
      .finally(() => setLoadingChart(false));
  }, [apiFetch, a.id, canLoadHistory, priceHistory]);

  useEffect(() => {
    if (detailOpen) fetchHistory();
  }, [detailOpen, fetchHistory]);

  const weekData = priceHistory ? filterByPeriod(priceHistory, "1W") : null;

  const swipeActions = a.is_archived
    ? onUnarchive
      ? [
          {
            key: "unarchive",
            label: T("btn_unarchive"),
            icon: <Icon name="archive" size={15} />,
            background: "var(--accent)",
            onPress: () => onUnarchive(a.id),
            testId: `asset-swipe-unarchive-${a.id}`,
          },
        ]
      : []
    : [
        ...(onEdit
          ? [
              {
                key: "edit",
                label: T("btn_edit", "Edit"),
                icon: <Icon name="settings" size={15} />,
                background: "var(--accent)",
                onPress: () => onEdit(a),
                testId: `asset-swipe-edit-${a.id}`,
              },
            ]
          : []),
        ...(onDelete
          ? [
              {
                key: "delete",
                label: T("btn_delete", "Delete"),
                icon: <Icon name="trash" size={15} />,
                background: "var(--danger)",
                onPress: () => {
                  if (window.confirm(T("asset_delete_confirm"))) onDelete(a.id);
                },
                testId: `asset-swipe-delete-${a.id}`,
              },
            ]
          : []),
        ...(onArchive
          ? [
              {
                key: "archive",
                label: T("btn_archive"),
                icon: <Icon name="archive" size={15} />,
                background: "var(--warning)",
                onPress: () => onArchive(a),
                testId: `asset-swipe-archive-${a.id}`,
              },
            ]
          : []),
      ];

  const actionBtnStyle = {
    flex: 1,
    background: "var(--card-inset)",
    border: "1px solid var(--rule)",
    color: "var(--fg)",
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 600,
    minHeight: 44,
    padding: "10px 12px",
    borderRadius: "var(--r-input)",
    fontFamily: "inherit",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  };

  return (
    <>
      <SwipeRow
        rowId={a.id}
        openRowId={swipeOpenId}
        onRequestOpen={requestSwipeOpen}
        actions={swipeActions}
        onTap={() => setDetailOpen(true)}
        style={{ borderBottom: isLast ? "none" : "1px solid var(--rule)" }}
        rowStyle={{ padding: "13px 16px" }}
        ariaLabel={a.name}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              minWidth: 0,
            }}
          >
            <span
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: "var(--fg)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {a.name}
            </span>
            {a.ticker && (
              <span
                className="tag num"
                style={{
                  background: "var(--card-inset)",
                  color: "var(--fg-soft)",
                  flexShrink: 0,
                }}
              >
                {a.ticker}
              </span>
            )}
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              marginTop: 3,
              fontSize: 11,
              color: "var(--fg-soft)",
            }}
          >
            <CategoryDot color={typeColor} size={6} />
            {typeName}
          </div>
        </div>

        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div
            className="num"
            title={a.eur_complete === false ? T("eur_incomplete") : undefined}
            style={{
              fontSize: 14,
              fontWeight: 700,
              // HIGH-05: when the backend couldn't fully convert to EUR (missing
              // FX history) current_value_eur is null and we fall back to the
              // native amount — mark it as approximate so it doesn't read as an
              // exact € figure.
              color: a.eur_complete === false ? "var(--warning)" : "var(--fg)",
            }}
          >
            {a.eur_complete === false ? "~ " : ""}
            {masked(formatEurFull(a.current_value_eur ?? a.current_value))}
          </div>
          <div
            className="num"
            style={{
              fontSize: 11,
              color: gainPct >= 0 ? "var(--success)" : "var(--danger)",
            }}
          >
            {masked(`${gainPct >= 0 ? "+" : ""}${gainPct.toFixed(2)}%`)}
          </div>
        </div>
        <span
          aria-hidden="true"
          style={{ color: "var(--fg-faint)", fontSize: 17, flexShrink: 0 }}
        >
          ›
        </span>
      </SwipeRow>

      {/* ── Detail sheet (former expanded card content) ─────────────── */}
      <BottomSheet
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        ariaLabel={a.name}
      >
        <div style={{ padding: "8px 18px 18px" }}>
          <div style={{ marginBottom: 14 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                minWidth: 0,
              }}
            >
              <span
                style={{
                  fontSize: 17,
                  fontWeight: 800,
                  color: "var(--fg)",
                  letterSpacing: "var(--ls-h-small)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {a.name}
              </span>
              {a.ticker && (
                <span
                  className="tag num"
                  style={{
                    background: "var(--card-inset)",
                    color: "var(--fg-soft)",
                    flexShrink: 0,
                  }}
                >
                  {a.ticker}
                </span>
              )}
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                marginTop: 6,
                fontSize: 12,
                color: "var(--fg-soft)",
              }}
            >
              <CategoryDot color={typeColor} size={7} />
              {typeName}
              {a.is_archived && <span>· {T("label_archived")}</span>}
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 6,
              marginBottom: hasTicker ? 10 : 0,
            }}
          >
            <StatCell
              label={T("invested")}
              value={masked(formatEur(a.invested_capital))}
            />
            <StatCell
              label={T("current")}
              value={masked(
                a.currency &&
                  a.currency !== "EUR" &&
                  a.current_value_eur != null
                  ? formatEur(a.current_value_eur)
                  : formatEur(a.current_value),
              )}
              sub={
                !isValueHidden?.("investments", "asset_values") &&
                a.currency !== "EUR" &&
                a.current_value_eur != null
                  ? `${parseFloat(a.current_value).toFixed(2)} ${a.currency}`
                  : undefined
              }
            />
            <StatCell
              label={T("gain_eur")}
              value={masked(`${gain >= 0 ? "+" : ""}${formatEur(gain)}`)}
              color={gain >= 0 ? "var(--success)" : "var(--danger)"}
            />
            <StatCell
              label={T("return_label")}
              value={masked(`${gainPct >= 0 ? "+" : ""}${gainPct.toFixed(2)}%`)}
              color={gain >= 0 ? "var(--success)" : "var(--danger)"}
            />
            {!isManual && a.shares && (
              <>
                <StatCell
                  label={T("shares")}
                  value={parseFloat(a.shares).toLocaleString()}
                />
                <StatCell
                  label={T("price")}
                  value={
                    a.price_per_share
                      ? masked(
                          `${parseFloat(a.price_per_share).toFixed(2)} ${a.currency || "EUR"}`,
                        )
                      : "—"
                  }
                />
              </>
            )}
            {allocPct !== null && (
              <StatCell
                label={T("alloc_pct")}
                value={`${allocPct.toFixed(1)}%`}
                color={typeColor}
              />
            )}
            {avgCost !== null && (
              <StatCell
                label={T("avg_cost")}
                value={masked(`${avgCost.toFixed(2)} ${a.currency || "EUR"}`)}
                color="var(--fg-soft)"
              />
            )}
          </div>

          {a.source_account_name && (
            <div
              style={{
                fontSize: 11,
                color: "var(--fg-soft)",
                marginTop: 6,
              }}
            >
              {T("label_source_account_display")}:{" "}
              <span style={{ color: "var(--fg)" }}>
                {a.source_account_name}
              </span>
            </div>
          )}
          {a.notes && (
            <div
              style={{
                fontSize: 11,
                color: "var(--fg-soft)",
                fontStyle: "italic",
                marginTop: 4,
              }}
            >
              {a.notes}
            </div>
          )}

          {!isManual && a.isin && !hasTicker && (
            <div
              style={{
                color: "var(--warning)",
                fontSize: 11,
                marginTop: 8,
              }}
            >
              {T("isin_no_match")}
            </div>
          )}

          {canLoadHistory && (
            <div style={{ marginTop: 10 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 6,
                }}
              >
                <div className="label">{T("price_chart")} · 1W</div>
                {priceHistory && priceHistory.length >= 2 && (
                  <button
                    onClick={() => setShowChart(true)}
                    style={{
                      background: "var(--card-inset)",
                      border: "1px solid var(--rule)",
                      color: "var(--fg-soft)",
                      borderRadius: 6,
                      padding: "2px 8px",
                      fontSize: 10,
                      cursor: "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    ↗ {T("expand_chart")}
                  </button>
                )}
              </div>
              {loadingChart ? (
                <div
                  style={{
                    height: 56,
                    display: "flex",
                    alignItems: "center",
                    color: "var(--fg-soft)",
                    fontSize: 11,
                  }}
                >
                  …
                </div>
              ) : priceHistory && priceHistory.length === 0 ? (
                <div
                  style={{
                    height: 56,
                    display: "flex",
                    alignItems: "center",
                    color: "var(--fg-soft)",
                    fontSize: 11,
                  }}
                >
                  {T("no_price_data")}
                </div>
              ) : (
                <Sparkline data={weekData} />
              )}
              {historyWarning && (
                <div
                  style={{
                    color: historyWarning.tone,
                    fontSize: 11,
                    marginTop: 6,
                  }}
                >
                  {historyWarning.text}
                </div>
              )}
            </div>
          )}

          <div
            style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}
          >
            {!a.is_archived && onEdit && (
              <button
                className="pressable"
                style={actionBtnStyle}
                onClick={() => {
                  setDetailOpen(false);
                  onEdit(a);
                }}
              >
                {T("btn_edit", "Edit")}
              </button>
            )}
            {!a.is_archived && isManual && onAdjust && (
              <button
                className="pressable"
                style={actionBtnStyle}
                onClick={() => {
                  setDetailOpen(false);
                  onAdjust(a);
                }}
              >
                {T("btn_adjust_balance")}
              </button>
            )}
            {!a.is_archived && isManual && onRealize && (
              <button
                className="pressable"
                style={actionBtnStyle}
                onClick={() => {
                  setDetailOpen(false);
                  onRealize(a);
                }}
              >
                {T("btn_realize_asset")}
              </button>
            )}
            {!a.is_archived && onArchive && (
              <button
                className="pressable"
                style={{ ...actionBtnStyle, color: "var(--warning)" }}
                onClick={() => {
                  setDetailOpen(false);
                  onArchive(a);
                }}
              >
                <Icon name="archive" size={15} /> {T("btn_archive")}
              </button>
            )}
            {!a.is_archived && onMove && (
              <button
                className="pressable"
                style={actionBtnStyle}
                onClick={() => {
                  setDetailOpen(false);
                  onMove(a);
                }}
              >
                {T("btn_move")}
              </button>
            )}
            {a.is_archived && onUnarchive && (
              <button
                className="pressable"
                style={{ ...actionBtnStyle, color: "var(--accent)" }}
                onClick={() => {
                  setDetailOpen(false);
                  onUnarchive(a.id);
                }}
              >
                {T("btn_unarchive")}
              </button>
            )}
            {!a.is_archived && onDelete && (
              <button
                className="pressable"
                style={{
                  ...actionBtnStyle,
                  color: "var(--danger)",
                  flex: "0 0 auto",
                }}
                onClick={() => {
                  if (window.confirm(T("asset_delete_confirm"))) {
                    setDetailOpen(false);
                    onDelete(a.id);
                  }
                }}
              >
                <Icon name="trash" size={15} /> {T("btn_delete", "Delete")}
              </button>
            )}
          </div>
        </div>
      </BottomSheet>

      {showChart && priceHistory && (
        <ChartModal
          data={priceHistory}
          meta={priceHistoryMeta}
          asset={a}
          onClose={() => setShowChart(false)}
          T={T}
        />
      )}
    </>
  );
}
