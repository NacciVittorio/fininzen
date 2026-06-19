import type { NumericValue } from "../types";

type CategoryRecord = {
    id: number;
    parent?: number | null;
    category_type?: string | null;
};

type CategorizedRecord = {
    category?: number | null;
};

type DatedAmountRecord = {
    date: string;
    amount?: NumericValue;
};

type AssetRecord = {
    is_archived?: boolean;
    investment_type_detail?: { is_bank_account?: boolean } | null;
};

type ExpenseSummary = {
    by_category?: Array<{
        category__category_type?: string | null;
        total?: NumericValue;
    }>;
};

type PortfolioSummary = {
    total_invested?: NumericValue;
    total_gain?: NumericValue;
    total_current?: NumericValue;
};

export function filterExpensesByCategories<Row extends CategorizedRecord>(
    expenses: readonly Row[],
    categoryIds: readonly (number | string)[],
    categories: readonly CategoryRecord[],
): readonly Row[] {
    if (!Array.isArray(categoryIds) || categoryIds.length === 0)
        return expenses;

    const selectedIds = new Set(
        categoryIds.map((id) => parseInt(String(id), 10)),
    );
    return expenses.filter((expense) => {
        if (expense.category != null && selectedIds.has(expense.category))
            return true;
        const category = categories.find(
            (candidate) => candidate.id === expense.category,
        );
        return Boolean(
            category?.parent != null && selectedIds.has(category.parent),
        );
    });
}

export function getRootCategories<Row extends CategoryRecord>(
    categories: readonly Row[],
    categoryType?: string | null,
): Row[] {
    return categories.filter(
        (category) =>
            !category.parent &&
            (!categoryType || category.category_type === categoryType),
    );
}

export function getAvailableYears(
    items: readonly { date: string }[],
    fallbackYear: number,
): number[] {
    const years = new Set<number>();
    items.forEach((item) => {
        const date = new Date(item.date);
        if (!Number.isNaN(date.getTime())) years.add(date.getFullYear());
    });
    years.add(fallbackYear);
    return Array.from(years).sort((a, b) => b - a);
}

export function getAvailableMonths(
    items: readonly { date: string }[],
    year: number | null | undefined,
    currentYear: number,
    currentMonth: number,
): number[] {
    if (!year) return [];

    const months = new Set<number>();
    items.forEach((item) => {
        const date = new Date(item.date);
        if (!Number.isNaN(date.getTime()) && date.getFullYear() === year) {
            months.add(date.getMonth() + 1);
        }
    });
    if (months.size === 0 && year === currentYear) months.add(currentMonth);
    return Array.from(months).sort((a, b) => a - b);
}

export function groupAssets<Row extends AssetRecord>(
    assets: readonly Row[],
): {
    bankAccounts: Row[];
    archivedBankAccounts: Row[];
    investments: Row[];
    archivedInvestments: Row[];
} {
    const groups: {
        bankAccounts: Row[];
        archivedBankAccounts: Row[];
        investments: Row[];
        archivedInvestments: Row[];
    } = {
        bankAccounts: [],
        archivedBankAccounts: [],
        investments: [],
        archivedInvestments: [],
    };

    assets.forEach((asset) => {
        const isBankAccount =
            asset.investment_type_detail?.is_bank_account === true;
        if (isBankAccount && asset.is_archived) {
            groups.archivedBankAccounts.push(asset);
        } else if (isBankAccount) {
            groups.bankAccounts.push(asset);
        } else if (asset.is_archived) {
            groups.archivedInvestments.push(asset);
        } else {
            groups.investments.push(asset);
        }
    });
    return groups;
}

export function buildKpiData(
    expenseSummary?: ExpenseSummary | null,
    portfolioSummary: PortfolioSummary = {},
): {
    monthlyExp: number;
    monthlyInc: number;
    returnRate: number;
    expenseRatio: number;
} {
    const monthlyExp =
        expenseSummary?.by_category
            ?.filter(
                (category) =>
                    !category.category__category_type ||
                    category.category__category_type === "expense",
            )
            .reduce(
                (sum, category) =>
                    sum + Number.parseFloat(String(category.total || 0)),
                0,
            ) || 0;
    const monthlyInc =
        expenseSummary?.by_category
            ?.filter(
                (category) => category.category__category_type === "income",
            )
            .reduce(
                (sum, category) =>
                    sum + Number.parseFloat(String(category.total || 0)),
                0,
            ) || 0;
    const totalInvested = Number(portfolioSummary.total_invested || 0);
    const totalGain = Number(portfolioSummary.total_gain || 0);
    const totalCurrent = Number(portfolioSummary.total_current || 0);
    const returnRate = totalInvested ? (totalGain / totalInvested) * 100 : 0;
    const expenseRatio = totalCurrent ? (monthlyExp / totalCurrent) * 100 : 0;

    return { monthlyExp, monthlyInc, returnRate, expenseRatio };
}

function getYearMonthFromIso(
    value: string | null | undefined,
): { year: number; month: number } | null {
    const match = String(value || "").match(/^(\d{4})-(\d{2})/);
    if (!match) return null;
    return {
        year: parseInt(match[1]!, 10),
        month: parseInt(match[2]!, 10),
    };
}

export function buildMonthlyTrend(
    items: readonly DatedAmountRecord[],
    monthLabels: readonly string[],
    now = new Date(),
): Array<{ month: string; value: number }> {
    const trend: Array<{ month: string; value: number }> = [];
    for (let offset = 11; offset >= 0; offset -= 1) {
        const date = new Date(now);
        date.setMonth(date.getMonth() - offset);
        const month = date.getMonth() + 1;
        const year = date.getFullYear();
        const value = items
            .filter((item) => {
                const itemPeriod = getYearMonthFromIso(item.date);
                return itemPeriod?.month === month && itemPeriod.year === year;
            })
            .reduce(
                (sum, item) =>
                    sum + Number.parseFloat(String(item.amount || 0)),
                0,
            );
        trend.push({ month: monthLabels[month - 1] ?? String(month), value });
    }
    return trend;
}
