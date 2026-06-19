import { useEffect, useRef, useState } from "react";
import { useApp } from "../../context/useApp";
import { BottomSheet, AreaChart, CategoryDot, MoneyValue, Label } from "../ui";

// Fullscreen-style detail for one asset: 12-month sparkline + month-by-month
// values for a selectable year. On mobile this replaces the desktop compare
// matrix (year-over-year per asset instead of a 2×12 grid).
export default function MnwAssetDetailSheet({
  asset,
  open,
  onClose,
  year,
  availableYears,
  fetchOverviewForYear,
  T,
}) {
  const { MONTHS } = useApp();
  const [shownYear, setShownYear] = useState(year);
  const [values, setValues] = useState(null);
  const [loading, setLoading] = useState(false);
  const cache = useRef({});

  // Reset to the list's year each time a new asset is opened.
  useEffect(() => {
    if (open) setShownYear(year);
  }, [open, year, asset?.id]);

  useEffect(() => {
    if (!open || !asset) return;
    if (shownYear === year) {
      setValues(asset.monthly_values || null);
      return;
    }
    const cached = cache.current[shownYear];
    if (cached) {
      const found = (cached.assets || []).find((a) => a.id === asset.id);
      setValues(found?.monthly_values || null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetchOverviewForYear(shownYear).then((data) => {
      if (cancelled) return;
      if (data) cache.current[shownYear] = data;
      const found = (data?.assets || []).find((a) => a.id === asset.id);
      setValues(found?.monthly_values || null);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [open, asset, shownYear, year, fetchOverviewForYear]);

  if (!asset) return null;

  const yearsList = Array.isArray(availableYears) ? availableYears : [];
  const minYear = yearsList.length ? Math.min(...yearsList) : null;
  const maxYear = yearsList.length
    ? Math.max(...yearsList)
    : new Date().getFullYear();
  const canPrev = minYear == null || shownYear > minYear;
  const canNext = shownYear < maxYear;

  const chartValues = (values || []).filter((v) => v != null);
  const type = asset.investment_type;

  const chevronStyle = (disabled) => ({
    background: "var(--card-inset)",
    border: "1px solid var(--rule)",
    color: disabled ? "var(--fg-faint)" : "var(--fg-soft)",
    borderRadius: 999,
    width: 32,
    height: 32,
    cursor: disabled ? "not-allowed" : "pointer",
    fontSize: 14,
    fontFamily: "inherit",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
  });

  return (
    <BottomSheet open={open} onClose={onClose} ariaLabel={asset.name}>
      <div style={{ padding: "8px 18px 18px" }}>
        <div
          className="between"
          style={{ marginBottom: 4, alignItems: "flex-start", gap: 12 }}
        >
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontSize: 17,
                fontWeight: "var(--w-heading)",
                color: "var(--fg)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {asset.name}
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 7,
                marginTop: 6,
              }}
            >
              <CategoryDot color={type?.color || "var(--accent)"} size={7} />
              <Label>{type?.name || "Other"}</Label>
              {asset.currency !== "EUR" && (
                <span style={{ fontSize: 11, color: "var(--fg-soft)" }}>
                  · {asset.currency}
                </span>
              )}
            </div>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexShrink: 0,
            }}
          >
            <button
              type="button"
              onClick={() => canPrev && setShownYear(shownYear - 1)}
              disabled={!canPrev}
              style={chevronStyle(!canPrev)}
              aria-label={T("prev_year")}
            >
              ‹
            </button>
            <span
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: "var(--fg)",
                minWidth: 44,
                textAlign: "center",
              }}
            >
              {shownYear}
            </span>
            <button
              type="button"
              onClick={() => canNext && setShownYear(shownYear + 1)}
              disabled={!canNext}
              style={chevronStyle(!canNext)}
              aria-label={T("next_year")}
            >
              ›
            </button>
          </div>
        </div>

        {loading ? (
          <div
            style={{
              padding: "40px 0",
              textAlign: "center",
              color: "var(--fg-soft)",
              fontSize: 13,
            }}
          >
            Loading…
          </div>
        ) : (
          <>
            {chartValues.length > 1 && (
              <div style={{ margin: "14px 0 6px" }}>
                <AreaChart
                  values={chartValues}
                  width={560}
                  height={120}
                  color={type?.color || "var(--accent)"}
                  ariaLabel={`${asset.name} ${shownYear}`}
                />
              </div>
            )}
            <div style={{ marginTop: 10 }}>
              {MONTHS.map((monthName, m) => {
                const val = values?.[m] ?? null;
                const prev = m > 0 ? (values?.[m - 1] ?? null) : null;
                const delta = val != null && prev != null ? val - prev : null;
                return (
                  <div
                    key={m}
                    className="between"
                    style={{
                      padding: "9px 2px",
                      borderBottom: m < 11 ? "1px solid var(--rule)" : "none",
                    }}
                  >
                    <span style={{ fontSize: 13, color: "var(--fg-soft)" }}>
                      {monthName}
                    </span>
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "baseline",
                        gap: 10,
                      }}
                    >
                      {delta != null && delta !== 0 && (
                        <MoneyValue
                          value={delta}
                          size="xs"
                          signed
                          tone="auto"
                        />
                      )}
                      {val == null ? (
                        <span style={{ color: "var(--fg-faint)" }}>—</span>
                      ) : (
                        <MoneyValue value={val} size="sm" />
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </BottomSheet>
  );
}
