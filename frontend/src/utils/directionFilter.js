export function deriveDirectionFilter({ showAllDirections, cashflowDir }) {
  if (showAllDirections) return "all";
  if (cashflowDir === "income" || cashflowDir === "expense") return cashflowDir;
  return "expense";
}

export function rowDirection(cat) {
  if (!cat) return "expense";
  return cat.category_type === "income" ? "income" : "expense";
}

export function sameMonthYear(isoDate, month, year) {
  if (!isoDate) return false;
  const [y, m] = String(isoDate)
    .split("-")
    .map((p) => parseInt(p, 10));
  if (!month) return y === year;
  return y === year && m === month;
}
