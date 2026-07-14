import type { ApiFetcher, PaginatedResponse } from "./client";
import { fetchAllPagesWithFetcher, requestJsonWithFetcher } from "./client";
import type { Category, Expense } from "./types";

export type UnknownCollection<TItem = unknown> =
    TItem[] | PaginatedResponse<TItem>;

const withQuery = (path: string, params?: URLSearchParams): `/${string}` => {
    const query = params?.toString();
    return `${path}${query ? `?${query}` : ""}` as `/${string}`;
};

export type CashflowTrendPoint = {
    date: string;
    amount: number | string;
    linked_asset?: number | null;
};

export type ExpenseTrendsResponse = {
    expenses?: CashflowTrendPoint[];
    incomes?: CashflowTrendPoint[];
};

export type ExpenseCategorySummary = {
    category__id?: number | null;
    category__name?: string | null;
    category__color?: string | null;
    category__category_type?: "expense" | "income" | null;
    total?: number | string;
    [key: string]: unknown;
};

export type ExpenseSummaryResponse = {
    total: number | string;
    by_category: ExpenseCategorySummary[];
    [key: string]: unknown;
};

export type RecurringStatusResponse = {
    summary: { generated: number; pending: number; total: number };
    items: Array<{
        id: number;
        description: string;
        amount: number | string;
        day_of_month: number;
        status: "generated" | "pending";
    }>;
};

export const fetchExpensesList = (
    fetcher: ApiFetcher,
    params: URLSearchParams,
): Promise<UnknownCollection<Expense>> =>
    fetchAllPagesWithFetcher<Expense>(fetcher, withQuery("/expenses/", params));

export const fetchExpenseTrends = (
    fetcher: ApiFetcher,
): Promise<ExpenseTrendsResponse> =>
    requestJsonWithFetcher<ExpenseTrendsResponse>(fetcher, "/expenses/trends/");

export const fetchExpenseCategoriesList = (
    fetcher: ApiFetcher,
): Promise<UnknownCollection<Category>> =>
    fetchAllPagesWithFetcher<Category>(fetcher, "/expenses/categories/");

export const fetchExpenseSummaryData = (
    fetcher: ApiFetcher,
    params: URLSearchParams,
): Promise<ExpenseSummaryResponse> =>
    requestJsonWithFetcher<ExpenseSummaryResponse>(
        fetcher,
        withQuery("/expenses/summary/", params),
    );

export const fetchRecurringStatusData = (
    fetcher: ApiFetcher,
    params: URLSearchParams,
): Promise<RecurringStatusResponse> =>
    requestJsonWithFetcher<RecurringStatusResponse>(
        fetcher,
        withQuery("/expenses/recurring/status/", params),
    );
