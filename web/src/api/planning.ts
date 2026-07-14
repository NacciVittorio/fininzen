import type { ApiFetcher } from "./client";
import {
    fetchAllPagesWithFetcher,
    requestJsonWithFetcher,
    type PaginatedResponse,
} from "./client";
import type { AllocationTargetRow } from "../utils/allocationGroups";
import type {
    Budget,
    RecurringExpense,
    RecurringInvestmentPlan,
} from "./types";

export type UnknownCollection<TItem = unknown> =
    TItem[] | PaginatedResponse<TItem>;

export type BudgetPayload = {
    category: number;
    amount: number;
};

export type AllocationTargetPayload = {
    investment_type: number;
    target_percent: number;
};

export const saveBudget = (
    fetcher: ApiFetcher,
    payload: BudgetPayload,
): Promise<unknown> =>
    requestJsonWithFetcher(fetcher, "/expenses/budgets/", {
        method: "POST",
        body: payload,
    });

export const fetchAllocationTargets = (
    fetcher: ApiFetcher,
): Promise<AllocationTargetRow[]> =>
    requestJsonWithFetcher<AllocationTargetRow[]>(
        fetcher,
        "/portfolio/allocation-targets/",
    );

export const saveAllocationTarget = (
    fetcher: ApiFetcher,
    payload: AllocationTargetPayload,
): Promise<unknown> =>
    requestJsonWithFetcher(fetcher, "/portfolio/allocation-targets/", {
        method: "POST",
        body: payload,
    });

export const fetchBudgetsList = (
    fetcher: ApiFetcher,
): Promise<UnknownCollection<Budget>> =>
    fetchAllPagesWithFetcher<Budget>(fetcher, "/expenses/budgets/");

export const fetchRecurringExpensesList = (
    fetcher: ApiFetcher,
): Promise<UnknownCollection<RecurringExpense>> =>
    fetchAllPagesWithFetcher<RecurringExpense>(fetcher, "/expenses/recurring/");

export const fetchRecurringInvestmentPlansList = (
    fetcher: ApiFetcher,
): Promise<UnknownCollection<RecurringInvestmentPlan>> =>
    fetchAllPagesWithFetcher<RecurringInvestmentPlan>(
        fetcher,
        "/portfolio/recurring-investments/",
    );

export const deleteBudget = (
    fetcher: ApiFetcher,
    budgetId: number,
): Promise<unknown> =>
    requestJsonWithFetcher(fetcher, `/expenses/budgets/${budgetId}/`, {
        method: "DELETE",
    });

export const deleteAllocationTarget = (
    fetcher: ApiFetcher,
    targetId: number,
): Promise<unknown> =>
    requestJsonWithFetcher(
        fetcher,
        `/portfolio/allocation-targets/${targetId}/`,
        {
            method: "DELETE",
        },
    );
