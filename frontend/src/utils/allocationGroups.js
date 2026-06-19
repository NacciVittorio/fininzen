// Splitting allocation views between bank accounts and investments.
// The axis is the InvestmentType.is_bank_account flag (exposed by the API on
// both /portfolio/summary/ by_type rows and /portfolio/allocation-targets/).

export const ALLOC_GROUPS = ["all", "investments", "accounts"];

// Sub-cent values are treated as zero so €0 container accounts (e.g. a pension
// account whose value lives in linked funds) don't clutter the charts.
const EPS = 0.005;

// True if a row belongs to the selected group.
export function inGroup(isBankAccount, group) {
  if (group === "investments") return !isBankAccount;
  if (group === "accounts") return !!isBankAccount;
  return true; // "all"
}

// Filter value-bearing rows (e.g. summary by_type) to the selected group, drop
// ~zero rows, and compute each row's share (%) of the group total. Generic over
// the accessors so it works for by_type, currency, etc.
// Returns [{ row, value, pct }] sorted by value desc.
export function groupRows(rows, { group = "all", getIsBank, getValue } = {}) {
  const kept = (rows || [])
    .filter((r) => inGroup(getIsBank(r), group))
    .filter((r) => Math.abs(getValue(r)) > EPS);
  const total = kept.reduce((s, r) => s + getValue(r), 0);
  return kept
    .map((r) => ({
      row: r,
      value: getValue(r),
      pct: total > 0 ? (getValue(r) / total) * 100 : 0,
    }))
    .sort((a, b) => b.value - a.value);
}

// Recompute allocation-target rows within a group: current_pct relative to the
// group's current total, plus diff/action vs the stored target. Mirrors the
// backend thresholds in portfolio/views.py (±2%). Rows with a target but no
// holdings are kept (a 0% holding against a target is meaningful — "buy").
export function regroupTargets(rows, group = "all") {
  const kept = (rows || []).filter((r) => inGroup(r.is_bank_account, group));
  const groupTotal = kept.reduce(
    (s, r) => s + (Number(r.current_value) || 0),
    0,
  );
  return kept.map((r) => {
    const current_pct =
      groupTotal > 0 ? ((Number(r.current_value) || 0) / groupTotal) * 100 : 0;
    const target_pct = r.target_pct;
    let diff = null;
    let action = null;
    if (target_pct != null) {
      diff = current_pct - target_pct;
      action = diff < -2 ? "buy" : diff > 2 ? "sell" : "ok";
    }
    return { ...r, current_pct, diff, action };
  });
}
