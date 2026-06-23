export type CashflowDirection = "income" | "expense";
export type DirectionFilter = CashflowDirection | "all";

type DirectionFilterOptions = {
    showAllDirections: boolean;
    cashflowDir?: string | null;
};

type CategoryDirection = {
    category_type?: string | null;
};

export function deriveDirectionFilter({
    showAllDirections,
    cashflowDir,
}: DirectionFilterOptions): DirectionFilter {
    if (showAllDirections) return "all";
    if (cashflowDir === "income" || cashflowDir === "expense")
        return cashflowDir;
    return "expense";
}

export function rowDirection(
    cat?: CategoryDirection | null,
): CashflowDirection {
    if (!cat) return "expense";
    return cat.category_type === "income" ? "income" : "expense";
}

export function sameMonthYear(
    isoDate: string | null | undefined,
    month: number | null | undefined,
    year: number,
): boolean {
    if (!isoDate) return false;
    const [y, m] = isoDate.split("-").map((p) => parseInt(p, 10));
    if (!month) return y === year;
    return y === year && m === month;
}
