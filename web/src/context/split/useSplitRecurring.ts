import { useCallback, useRef, useState } from "react";
import {
    createSplitRecurring,
    deleteSplitRecurring,
    disableSplitRecurring,
    enableSplitRecurring,
    fetchSplitRecurringList,
    fetchSplitRecurringStatus,
    generateSplitRecurring,
    updateSplitRecurring,
} from "../../api/split";
import type {
    SplitRecurringExpense,
    SplitRecurringExpensePatchPayload,
    SplitRecurringExpensePayload,
    SplitRecurringStatusResponse,
} from "../../api/split";
import type { ApiFetcher } from "../../api/client";
import type { Translator } from "../../types";
import { splitApiErrorMessage } from "./splitApiError";

const isAbortError = (error: unknown): boolean =>
    error instanceof DOMException && error.name === "AbortError";

type UseSplitRecurringArgs = {
    T: Translator;
    apiFetch: ApiFetcher;
    guardDemo: () => boolean;
};

// Group recurring expenses (piano sez. 1.7/3.4) — mirror of the Cash Flow
// recurring widget (expenses/views/recurring.py), scoped to groups instead of
// a single owner.
export function useSplitRecurring({
    T,
    apiFetch,
    guardDemo,
}: UseSplitRecurringArgs) {
    const [recurrings, setRecurrings] = useState<SplitRecurringExpense[]>([]);
    const [recurringLoading, setRecurringLoading] = useState(false);
    const [recurringError, setRecurringError] = useState<string | null>(null);
    const [recurringStatus, setRecurringStatus] =
        useState<SplitRecurringStatusResponse | null>(null);
    const [recurringStatusLoading, setRecurringStatusLoading] = useState(false);
    const requestSeqRef = useRef(0);
    const abortRef = useRef<AbortController | null>(null);
    const statusRequestSeqRef = useRef(0);
    const statusAbortRef = useRef<AbortController | null>(null);

    const loadSplitRecurring = useCallback(async () => {
        const requestSeq = ++requestSeqRef.current;
        if (abortRef.current) abortRef.current.abort();
        const controller = new AbortController();
        abortRef.current = controller;
        setRecurringLoading(true);
        setRecurringError(null);
        try {
            const items = await fetchSplitRecurringList(
                apiFetch,
                controller.signal,
            );
            if (requestSeq !== requestSeqRef.current) return;
            setRecurrings(items);
        } catch (error) {
            if (isAbortError(error)) return;
            if (requestSeq === requestSeqRef.current) {
                setRecurringError(splitApiErrorMessage(error, T));
            }
        } finally {
            if (abortRef.current === controller) abortRef.current = null;
            if (requestSeq === requestSeqRef.current) {
                setRecurringLoading(false);
            }
        }
    }, [apiFetch, T]);

    const loadSplitRecurringStatus = useCallback(
        async (month: number, year: number) => {
            const requestSeq = ++statusRequestSeqRef.current;
            if (statusAbortRef.current) statusAbortRef.current.abort();
            const controller = new AbortController();
            statusAbortRef.current = controller;
            setRecurringStatusLoading(true);
            try {
                const data = await fetchSplitRecurringStatus(
                    apiFetch,
                    { month, year },
                    controller.signal,
                );
                if (requestSeq !== statusRequestSeqRef.current) return;
                setRecurringStatus(data);
            } catch (error) {
                if (isAbortError(error)) return;
                if (requestSeq === statusRequestSeqRef.current) {
                    setRecurringError(splitApiErrorMessage(error, T));
                }
            } finally {
                if (statusAbortRef.current === controller) {
                    statusAbortRef.current = null;
                }
                if (requestSeq === statusRequestSeqRef.current) {
                    setRecurringStatusLoading(false);
                }
            }
        },
        [apiFetch, T],
    );

    const addSplitRecurring = useCallback(
        async (
            payload: SplitRecurringExpensePayload,
        ): Promise<SplitRecurringExpense | null> => {
            if (guardDemo()) return null;
            try {
                const created = await createSplitRecurring(apiFetch, payload);
                setRecurrings((prev) => [created, ...prev]);
                setRecurringError(null);
                return created;
            } catch (error) {
                setRecurringError(splitApiErrorMessage(error, T));
                return null;
            }
        },
        [apiFetch, guardDemo, T],
    );

    const editSplitRecurring = useCallback(
        async (
            recurringId: number | string,
            payload: SplitRecurringExpensePatchPayload,
        ): Promise<SplitRecurringExpense | null> => {
            if (guardDemo()) return null;
            try {
                const updated = await updateSplitRecurring(
                    apiFetch,
                    recurringId,
                    payload,
                );
                setRecurrings((prev) =>
                    prev.map((r) => (r.id === updated.id ? updated : r)),
                );
                setRecurringError(null);
                return updated;
            } catch (error) {
                setRecurringError(splitApiErrorMessage(error, T));
                return null;
            }
        },
        [apiFetch, guardDemo, T],
    );

    const removeSplitRecurring = useCallback(
        async (recurringId: number | string): Promise<boolean> => {
            if (guardDemo()) return false;
            try {
                await deleteSplitRecurring(apiFetch, recurringId);
                setRecurrings((prev) =>
                    prev.filter((r) => r.id !== recurringId),
                );
                setRecurringError(null);
                return true;
            } catch (error) {
                setRecurringError(splitApiErrorMessage(error, T));
                return false;
            }
        },
        [apiFetch, guardDemo, T],
    );

    const toggleSplitRecurring = useCallback(
        async (
            recurringId: number | string,
            enable: boolean,
        ): Promise<boolean> => {
            if (guardDemo()) return false;
            try {
                // piano Batch 4.4: enable's response now reports the
                // template's ACTUAL resulting status — an already-expired
                // template (end_date in the past) gets disabled again
                // server-side in the same request, so blindly assuming
                // success here used to show "enabled" in the UI for a row
                // that silently stayed disabled.
                let resultStatus: "ACTIVE" | "DISABLED" = "DISABLED";
                if (enable) {
                    const res = await enableSplitRecurring(
                        apiFetch,
                        recurringId,
                    );
                    resultStatus =
                        res.status === "ACTIVE" ? "ACTIVE" : "DISABLED";
                } else {
                    await disableSplitRecurring(apiFetch, recurringId);
                }
                setRecurrings((prev) =>
                    prev.map((r) =>
                        r.id === recurringId
                            ? {
                                  ...r,
                                  is_active: enable
                                      ? resultStatus === "ACTIVE"
                                      : false,
                                  status: enable ? resultStatus : "DISABLED",
                              }
                            : r,
                    ),
                );
                if (enable && resultStatus !== "ACTIVE") {
                    setRecurringError(T("split_recurring_enable_expired"));
                    return false;
                }
                setRecurringError(null);
                return true;
            } catch (error) {
                setRecurringError(splitApiErrorMessage(error, T));
                return false;
            }
        },
        [apiFetch, guardDemo, T],
    );

    const runSplitRecurringGenerate = useCallback(
        async (month: number, year: number) => {
            if (guardDemo()) return null;
            try {
                const result = await generateSplitRecurring(apiFetch, {
                    month,
                    year,
                });
                setRecurringError(null);
                return result;
            } catch (error) {
                setRecurringError(splitApiErrorMessage(error, T));
                return null;
            }
        },
        [apiFetch, guardDemo, T],
    );

    return {
        recurrings,
        recurringLoading,
        recurringError,
        setRecurringError,
        recurringStatus,
        recurringStatusLoading,
        loadSplitRecurring,
        loadSplitRecurringStatus,
        addSplitRecurring,
        editSplitRecurring,
        removeSplitRecurring,
        toggleSplitRecurring,
        runSplitRecurringGenerate,
    };
}
