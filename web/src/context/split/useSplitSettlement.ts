import { useCallback, useRef, useState } from "react";
import {
    createSplitSettlement,
    deleteSplitSettlement,
    fetchSplitSettlementsList,
} from "../../api/split";
import type { SplitSettlement, SplitSettlementPayload } from "../../api/split";
import type { ApiFetcher } from "../../api/client";
import type { Translator } from "../../types";
import { splitApiErrorMessage } from "./splitApiError";

const isAbortError = (error: unknown): boolean =>
    error instanceof DOMException && error.name === "AbortError";

type UseSplitSettlementArgs = {
    T: Translator;
    apiFetch: ApiFetcher;
    guardDemo: () => boolean;
};

// "Salda debito" (piano sez. 1.6/6): every settlement the user can see
// (direct party, or a group they belong to). SplitSettlementViewSet has no
// update — correcting one means deleting and recreating it (see
// SplitSettlementViewSet's docstring), so this hook only exposes
// create/delete, never an edit path.
export function useSplitSettlement({
    T,
    apiFetch,
    guardDemo,
}: UseSplitSettlementArgs) {
    const [settlements, setSettlements] = useState<SplitSettlement[]>([]);
    const [settlementsLoading, setSettlementsLoading] = useState(false);
    const [settlementsError, setSettlementsError] = useState<string | null>(
        null,
    );
    const requestSeqRef = useRef(0);
    const abortRef = useRef<AbortController | null>(null);

    const loadSplitSettlements = useCallback(async () => {
        const requestSeq = ++requestSeqRef.current;
        if (abortRef.current) abortRef.current.abort();
        const controller = new AbortController();
        abortRef.current = controller;
        setSettlementsLoading(true);
        setSettlementsError(null);
        try {
            const items = await fetchSplitSettlementsList(
                apiFetch,
                controller.signal,
            );
            if (requestSeq !== requestSeqRef.current) return;
            setSettlements(items);
        } catch (error) {
            if (isAbortError(error)) return;
            if (requestSeq === requestSeqRef.current) {
                setSettlementsError(splitApiErrorMessage(error, T));
            }
        } finally {
            if (abortRef.current === controller) abortRef.current = null;
            if (requestSeq === requestSeqRef.current) {
                setSettlementsLoading(false);
            }
        }
    }, [apiFetch, T]);

    const addSplitSettlement = useCallback(
        async (
            payload: SplitSettlementPayload,
        ): Promise<SplitSettlement | null> => {
            if (guardDemo()) return null;
            try {
                const created = await createSplitSettlement(apiFetch, payload);
                setSettlements((prev) => [created, ...prev]);
                setSettlementsError(null);
                return created;
            } catch (error) {
                setSettlementsError(splitApiErrorMessage(error, T));
                return null;
            }
        },
        [apiFetch, guardDemo, T],
    );

    const removeSplitSettlement = useCallback(
        async (settlementId: number | string): Promise<boolean> => {
            if (guardDemo()) return false;
            try {
                await deleteSplitSettlement(apiFetch, settlementId);
                setSettlements((prev) =>
                    prev.filter((s) => s.id !== settlementId),
                );
                setSettlementsError(null);
                return true;
            } catch (error) {
                setSettlementsError(splitApiErrorMessage(error, T));
                return false;
            }
        },
        [apiFetch, guardDemo, T],
    );

    return {
        settlements,
        settlementsLoading,
        settlementsError,
        setSettlementsError,
        loadSplitSettlements,
        addSplitSettlement,
        removeSplitSettlement,
    };
}
