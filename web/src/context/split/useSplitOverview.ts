import { useCallback, useRef, useState } from "react";
import {
    fetchSplitBalancesOverview,
    fetchSplitExpensesList,
} from "../../api/split";
import type { SplitBalanceEntry, SplitExpense } from "../../api/split";
import type { ApiFetcher } from "../../api/client";
import type { Translator } from "../../types";
import { splitApiErrorMessage } from "./splitApiError";

const isAbortError = (error: unknown): boolean =>
    error instanceof DOMException && error.name === "AbortError";

type UseSplitOverviewArgs = {
    T: Translator;
    apiFetch: ApiFetcher;
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

    // Standalone ("quick") expenses — group=null. SplitExpenseViewSet has no
    // `?group=` filter (same limitation noted on useSplitGroupDetail's
    // groupExpenses), so this fetches the full accessible collection and
    // filters client-side for the ones with no group at all.
    const [standaloneExpenses, setStandaloneExpenses] = useState<
        SplitExpense[]
    >([]);
    const [standaloneExpensesLoading, setStandaloneExpensesLoading] =
        useState(false);
    const [standaloneExpensesError, setStandaloneExpensesError] = useState<
        string | null
    >(null);
    const standaloneRequestSeqRef = useRef(0);
    const standaloneAbortRef = useRef<AbortController | null>(null);

    const loadStandaloneExpenses = useCallback(async () => {
        const requestSeq = ++standaloneRequestSeqRef.current;
        if (standaloneAbortRef.current) standaloneAbortRef.current.abort();
        const controller = new AbortController();
        standaloneAbortRef.current = controller;
        setStandaloneExpensesLoading(true);
        setStandaloneExpensesError(null);
        try {
            const expenses = await fetchSplitExpensesList(
                apiFetch,
                controller.signal,
            );
            if (requestSeq !== standaloneRequestSeqRef.current) return;
            setStandaloneExpenses(expenses.filter((e) => e.group == null));
        } catch (error) {
            if (isAbortError(error)) return;
            if (requestSeq === standaloneRequestSeqRef.current) {
                setStandaloneExpensesError(splitApiErrorMessage(error, T));
            }
        } finally {
            if (standaloneAbortRef.current === controller) {
                standaloneAbortRef.current = null;
            }
            if (requestSeq === standaloneRequestSeqRef.current) {
                setStandaloneExpensesLoading(false);
            }
        }
    }, [apiFetch, T]);

    return {
        overview,
        overviewLoading,
        overviewError,
        setOverviewError,
        loadSplitOverview,
        standaloneExpenses,
        standaloneExpensesLoading,
        standaloneExpensesError,
        loadStandaloneExpenses,
    };
}
