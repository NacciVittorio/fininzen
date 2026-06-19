import { useEffect, useMemo, useState } from "react";
import { useFormatters } from "../utils/useFormatters";
import { PieChart } from "./Charts";
import PrivacyValue from "./PrivacyValue";
import {
  BottomSheet,
  CategoryDot,
  Pill,
  SegmentedControl,
  SheetTitle,
} from "./ui";

// Sub-cent values are treated as zero so €0 holdings don't clutter the breakdown
// (mirrors allocationGroups.js EPS).
const EPS = 0.005;

// Value used for the per-asset breakdown: prefer the EUR-normalised value so
// multi-currency holdings sum correctly (same fallback as AssetCard).
function assetValue(a) {
  return parseFloat(a.current_value_eur ?? a.current_value ?? 0);
}

function privacyForAsset(asset) {
  return asset?.investment_type_detail?.is_bank_account
    ? { scope: "accounts", field: "account_values" }
    : { scope: "investments", field: "asset_values" };
}

// Build the per-category/account-type → per-asset breakdown entirely from the
// assets already loaded by the app. No backend call.
export function buildInvestmentDeepDiveGroups(assets = []) {
  const byType = new Map();
  for (const a of assets) {
    const t = a.investment_type_detail;
    const tid = t?.id ?? "none";
    if (!byType.has(tid)) {
      byType.set(tid, {
        id: tid,
        name: t?.name || "—",
        color: t?.color || "var(--accent)",
        isBankAccount: !!t?.is_bank_account,
        assets: [],
      });
    }
    byType.get(tid).assets.push(a);
  }

  const grandTotal = assets.reduce((s, a) => s + assetValue(a), 0);

  const groups = [];
  for (const g of byType.values()) {
    const total = g.assets.reduce((s, a) => s + assetValue(a), 0);
    if (Math.abs(total) <= EPS) continue;
    const assets = g.assets
      .map((a) => {
        const value = assetValue(a);
        return {
          asset: a,
          value,
          pctOfCategory: total > 0 ? (value / total) * 100 : 0,
          pctOfTotal: grandTotal > 0 ? (value / grandTotal) * 100 : 0,
          gainPct: parseFloat(a.gain_percent || 0),
        };
      })
      .filter((r) => Math.abs(r.value) > EPS)
      .sort((a, b) => b.value - a.value)
      .map((r, i) => ({ ...r, color: `var(--chart-${(i % 6) + 1})` }));
    groups.push({
      id: g.id,
      name: g.name,
      color: g.color,
      isBankAccount: g.isBankAccount,
      total,
      pctOfTotal: grandTotal > 0 ? (total / grandTotal) * 100 : 0,
      assets,
    });
  }
  groups.sort((a, b) => b.total - a.total);
  return { groups, grandTotal };
}

function AssetRow({ row, formatEur, isLast }) {
  const privacy = privacyForAsset(row.asset);
  return (
    <div
      className="between"
      style={{
        padding: "9px 2px",
        borderBottom: isLast ? "none" : "1px solid var(--rule)",
      }}
    >
      <div
        className="row"
        style={{ alignItems: "center", gap: 8, minWidth: 0 }}
      >
        <CategoryDot color={row.color} />
        <span
          style={{
            fontSize: 13,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {row.asset.name}
        </span>
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexShrink: 0,
        }}
      >
        <span className="num" style={{ fontSize: 11, color: "var(--fg-soft)" }}>
          {row.pctOfCategory.toFixed(1)}%
        </span>
        <span className="num" style={{ fontSize: 13, fontWeight: 600 }}>
          <PrivacyValue scope={privacy.scope} field={privacy.field}>
            {formatEur(row.value)}
          </PrivacyValue>
        </span>
        <span
          className="num"
          style={{
            fontSize: 11,
            fontWeight: 600,
            minWidth: 46,
            textAlign: "right",
            color: row.gainPct >= 0 ? "var(--success)" : "var(--danger)",
          }}
        >
          {row.gainPct >= 0 ? "+" : ""}
          {row.gainPct.toFixed(1)}%
        </span>
      </div>
    </div>
  );
}

function CategoryHeader({ group, formatEur, T }) {
  const privacy = group.isBankAccount
    ? { scope: "accounts", field: "account_values" }
    : { scope: "investments", field: "asset_values" };
  return (
    <div
      className="between"
      style={{ alignItems: "center", gap: 8, marginBottom: 4 }}
    >
      <div
        className="row"
        style={{ alignItems: "center", gap: 8, minWidth: 0 }}
      >
        <CategoryDot color={group.color} size={8} />
        <span style={{ fontSize: 14, fontWeight: 700, color: "var(--fg)" }}>
          {group.name}
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span className="num" style={{ fontSize: 13, fontWeight: 600 }}>
          <PrivacyValue scope={privacy.scope} field={privacy.field}>
            {formatEur(group.total)}
          </PrivacyValue>
        </span>
        <Pill tone="neutral">
          <span className="num">{group.pctOfTotal.toFixed(1)}%</span>
        </Pill>
      </div>
    </div>
  );
}

// Drill-down sheet: percentage + economic breakdown of every asset within an
// allocation category/account type, with a toggle to view all categories at once.
export default function InvestmentDeepDiveSheet({
  open,
  onClose,
  initialTypeId,
  assets,
  investments,
  T,
}) {
  const { formatEur } = useFormatters();
  const sourceAssets = assets ?? investments ?? [];
  const { groups } = useMemo(
    () => buildInvestmentDeepDiveGroups(sourceAssets),
    [sourceAssets],
  );

  const hasCategory =
    initialTypeId != null &&
    initialTypeId !== "all" &&
    groups.some((g) => String(g.id) === String(initialTypeId));

  // view ∈ { String(typeId), "all" }
  const [view, setView] = useState("all");
  useEffect(() => {
    if (open) setView(hasCategory ? String(initialTypeId) : "all");
  }, [open, hasCategory, initialTypeId]);

  const activeGroup =
    view === "all" ? null : groups.find((g) => String(g.id) === String(view));

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      ariaLabel={T("dash_alloc_deepdive", T("dash_invest_deepdive"))}
    >
      <div style={{ padding: "8px 18px 18px" }}>
        <SheetTitle>
          {T("dash_alloc_deepdive", T("dash_invest_deepdive"))}
        </SheetTitle>

        {hasCategory && (
          <div style={{ marginBottom: 16, display: "flex" }}>
            <SegmentedControl
              options={[
                {
                  value: String(initialTypeId),
                  label: T("deepdive_this_category"),
                },
                { value: "all", label: T("deepdive_all_categories") },
              ]}
              value={view}
              onChange={setView}
            />
          </div>
        )}

        {groups.length === 0 ? (
          <div
            style={{
              textAlign: "center",
              color: "var(--fg-faint)",
              fontSize: 13,
              padding: "24px 0",
            }}
          >
            {T("no_data")}
          </div>
        ) : activeGroup ? (
          // ── Single category ───────────────────────────────────────────
          <>
            <div style={{ marginBottom: 12 }}>
              <CategoryHeader group={activeGroup} formatEur={formatEur} T={T} />
            </div>
            {activeGroup.assets.length > 1 &&
              activeGroup.total > EPS &&
              activeGroup.assets.every((r) => r.value > EPS) && (
                <div style={{ marginBottom: 8 }}>
                  <PieChart
                    data={activeGroup.assets.map((r) => ({
                      total: r.value,
                      category__color: r.color,
                      category__name: r.asset.name,
                    }))}
                    size={160}
                    tLabel={activeGroup.name}
                    tPctOfTotal={T("pct_of_total")}
                  />
                </div>
              )}
            <div>
              {activeGroup.assets.map((r, i) => (
                <AssetRow
                  key={r.asset.id}
                  row={r}
                  formatEur={formatEur}
                  isLast={i === activeGroup.assets.length - 1}
                />
              ))}
            </div>
          </>
        ) : (
          // ── All categories ────────────────────────────────────────────
          groups.map((g, gi) => (
            <div
              key={g.id}
              style={{ marginBottom: gi < groups.length - 1 ? 22 : 0 }}
            >
              <CategoryHeader group={g} formatEur={formatEur} T={T} />
              <div style={{ marginTop: 6 }}>
                {g.assets.map((r, i) => (
                  <AssetRow
                    key={r.asset.id}
                    row={r}
                    formatEur={formatEur}
                    isLast={i === g.assets.length - 1}
                  />
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </BottomSheet>
  );
}
