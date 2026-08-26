import { useCallback, useRef, useState } from "react";
import {
    fetchSplitBalancesOverview,
    fetchSplitExpensesList,
    fetchSplitSettlementsList,
} from "../../api/split";
import type {
    SplitBalanceEntry,
    SplitExpense,
    SplitSettlement,
} from "../../api/split";
import type { ApiFetcher } from "../../api/client";
import type { Translator } from "../../types";
import { splitApiErrorMessage } from "./splitApiError";

const isAbortError = (error: unknown): boolean =>
    error instanceof DOMException && error.name === "AbortError";

type UseSplitOverviewArgs = {
    T: Translator;
    apiFetch: ApiFetcher;
};

export type SplitActivityItem =
    | {
          kind: "expense";
          id: number;
          date: string;
          createdAt: string;
          groupId: number | null;
          expense: SplitExpense;
      }
    | {
          kind: "settlement";
          id: number;
          date: string;
          createdAt: string;
          groupId: number | null;
          settlement: SplitSettlement;
      };

// Cross-group balance overview (piano sez. 6: GET /balances/overview/) — the
// number the Split root view (SplitView.tsx) headlines: net "you're owed" vs
// "you owe" across every group and standalone expense, not scoped to one
// group like useSplitGroupDetail's groupBalances.
export function useSplitOverview({ T, apiFetch }: UseSplitOverviewArgs) {
    const [overview, setOverview] = useState<SplitBalanceEntry[]>([]);
    const [overviewLoading, setOverviewLoading] = useState(false);
    const [overviewError, setOverviewError] = useState<string | null>(null);
    const requestSeqRef = useRef(0);
    const abortRef = useRef<AbortController | null>(null);

    const loadSplitOverview = useCallback(async () => {
        const requestSeq = ++requestSeqRef.current;
        if (abortRef.current) abortRef.current.abort();
        const controller = new AbortController();
        abortRef.current = controller;
        setOverviewLoading(true);
        setOverviewError(null);
        try {
            const entries = await fetchSplitBalancesOverview(
                apiFetch,
                controller.signal,
            );
            if (requestSeq !== requestSeqRef.current) return;
            setOverview(entries);
        } catch (error) {
            if (isAbortError(error)) return;
            if (requestSeq === requestSeqRef.current) {
                setOverviewError(splitApiErrorMessage(error, T));
            }
        } finally {
            if (abortRef.current === controller) abortRef.current = null;
            if (requestSeq === requestSeqRef.current) {
                setOverviewLoading(false);
            }
        }
    }, [apiFetch, T]);

    // Global Split activity. The API intentionally stays unchanged: expenses
    // and settlements are fetched from their existing collections, merged in
    // the client, then sorted by business date and creation timestamp.
    const [splitActivity, setSplitActivity] = useState<SplitActivityItem[]>([]);
    const [splitActivityLoading, setSplitActivityLoading] = useState(false);
    const [splitActivityError, setSplitActivityError] = useState<string | null>(
        null,
    );

    // Standalone ("quick") expenses remain a derived slice of that same
    // expense collection so there is no second source of truth.
    const [standaloneExpenses, setStandaloneExpenses] = useState<
        SplitExpense[]
    >([]);
    const activityRequestSeqRef = useRef(0);
    const activityAbortRef = useRef<AbortController | null>(null);

    const loadSplitActivity = useCallback(async () => {
        const requestSeq = ++activityRequestSeqRef.current;
        if (activityAbortRef.current) activityAbortRef.current.abort();
        const controller = new AbortController();
        activityAbortRef.current = controller;
        setSplitActivityLoading(true);
        setSplitActivityError(null);
        try {
            const [expenses, settlements] = await Promise.all([
                fetchSplitExpensesList(apiFetch, controller.signal),
                fetchSplitSettlementsList(apiFetch, controller.signal),
            ]);
            if (requestSeq !== activityRequestSeqRef.current) return;

            const activity: SplitActivityItem[] = [
                ...expenses.map((expense): SplitActivityItem => ({
                    kind: "expense",
                    id: expense.id,
                    date: expense.date,
                    createdAt: expense.created_at,
                    groupId: expense.group ?? null,
                    expense,
                })),
                ...settlements.map((settlement): SplitActivityItem => ({
                    kind: "settlement",
                    id: settlement.id,
                    date: settlement.date,
                    createdAt: settlement.created_at,
                    groupId: settlement.group ?? null,
                    settlement,
                })),
            ].sort(
                (a, b) =>
                    b.date.localeCompare(a.date) ||
                    b.createdAt.localeCompare(a.createdAt),
            );

            setSplitActivity(activity);
            setStandaloneExpenses(expenses.filter((e) => e.group == null));
        } catch (error) {
            if (isAbortError(error)) return;
            if (requestSeq === activityRequestSeqRef.current) {
                setSplitActivityError(splitApiErrorMessage(error, T));
            }
        } finally {
            if (activityAbortRef.current === controller) {
                activityAbortRef.current = null;
            }
            if (requestSeq === activityRequestSeqRef.current) {
                setSplitActivityLoading(false);
            }
        }
    }, [apiFetch, T]);

    const loadStandaloneExpenses = loadSplitActivity;

    return {
        overview,
        overviewLoading,
        overviewError,
        setOverviewError,
        loadSplitOverview,
        splitActivity,
        splitActivityLoading,
        splitActivityError,
        loadSplitActivity,
        standaloneExpenses,
        standaloneExpensesLoading: splitActivityLoading,
        standaloneExpensesError: splitActivityError,
        loadStandaloneExpenses,
    };
}
