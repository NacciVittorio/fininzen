import { useCallback, useRef, useState } from "react";
import {
    createSplitGroup,
    deleteSplitGroup,
    fetchSplitGroupsList,
    updateSplitGroup,
} from "../../api/split";
import type {
    SplitGroup,
    SplitGroupPatchPayload,
    SplitGroupPayload,
} from "../../api/split";
import type { ApiFetcher } from "../../api/client";
import type { Translator } from "../../types";
import { splitApiErrorMessage } from "./splitApiError";

const isAbortError = (error: unknown): boolean =>
    error instanceof DOMException && error.name === "AbortError";

type UseSplitGroupsArgs = {
    T: Translator;
    apiFetch: ApiFetcher;
    guardDemo: () => boolean;
};

// Persistent groups list (piano sez. 1.3): every group the user created or is
// an active member of. Group *detail* (members/balances/expenses for one
// group) lives in useSplitGroupDetail.ts — this hook only owns the roster
// used to populate the group list/picker.
export function useSplitGroups({ T, apiFetch, guardDemo }: UseSplitGroupsArgs) {
    const [groups, setGroups] = useState<SplitGroup[]>([]);
    const [groupsLoading, setGroupsLoading] = useState(false);
    const [groupsError, setGroupsError] = useState<string | null>(null);
    const requestSeqRef = useRef(0);
    const abortRef = useRef<AbortController | null>(null);

    const loadSplitGroups = useCallback(async () => {
        const requestSeq = ++requestSeqRef.current;
        if (abortRef.current) abortRef.current.abort();
        const controller = new AbortController();
        abortRef.current = controller;
        setGroupsLoading(true);
        setGroupsError(null);
        try {
            const items = await fetchSplitGroupsList(
                apiFetch,
                controller.signal,
            );
            if (requestSeq !== requestSeqRef.current) return;
            setGroups(items);
        } catch (error) {
            if (isAbortError(error)) return;
            if (requestSeq === requestSeqRef.current) {
                setGroupsError(splitApiErrorMessage(error, T));
            }
        } finally {
            if (abortRef.current === controller) abortRef.current = null;
            if (requestSeq === requestSeqRef.current) setGroupsLoading(false);
        }
    }, [apiFetch, T]);

    const addSplitGroup = useCallback(
        async (payload: SplitGroupPayload): Promise<SplitGroup | null> => {
            if (guardDemo()) return null;
            try {
                const created = await createSplitGroup(apiFetch, payload);
                setGroups((prev) => [created, ...prev]);
                setGroupsError(null);
                return created;
            } catch (error) {
                setGroupsError(splitApiErrorMessage(error, T));
                return null;
            }
        },
        [apiFetch, guardDemo, T],
    );

    const editSplitGroup = useCallback(
        async (
            groupId: number | string,
            payload: SplitGroupPatchPayload,
        ): Promise<SplitGroup | null> => {
            if (guardDemo()) return null;
            try {
                const updated = await updateSplitGroup(
                    apiFetch,
                    groupId,
                    payload,
                );
                setGroups((prev) =>
                    prev.map((g) => (g.id === updated.id ? updated : g)),
                );
                setGroupsError(null);
                return updated;
            } catch (error) {
                setGroupsError(splitApiErrorMessage(error, T));
                return null;
            }
        },
        [apiFetch, guardDemo, T],
    );

    const removeSplitGroup = useCallback(
        async (groupId: number | string): Promise<boolean> => {
            if (guardDemo()) return false;
            try {
                await deleteSplitGroup(apiFetch, groupId);
                setGroups((prev) => prev.filter((g) => g.id !== groupId));
                setGroupsError(null);
                return true;
            } catch (error) {
                setGroupsError(splitApiErrorMessage(error, T));
                return false;
            }
        },
        [apiFetch, guardDemo, T],
    );

    return {
        groups,
        groupsLoading,
        groupsError,
        setGroupsError,
        loadSplitGroups,
        addSplitGroup,
        editSplitGroup,
        removeSplitGroup,
    };
}
