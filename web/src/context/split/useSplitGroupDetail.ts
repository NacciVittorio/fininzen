import { useCallback, useRef, useState } from "react";
import {
    addSplitGroupMember,
    fetchSplitExpensesList,
    fetchSplitGroup,
    fetchSplitGroupBalances,
    fetchSplitGroupMembers,
    fetchSplitSettlementsList,
    removeSplitGroupMember,
    simplifySplitGroupDebts,
} from "../../api/split";
import type {
    SplitBalanceEntry,
    SplitExpense,
    SplitGroup,
    SplitMemberPayload,
    SplitParticipant,
    SplitSettlement,
    SplitSimplifiedTransaction,
} from "../../api/split";
import type { ApiFetcher } from "../../api/client";
import type { Translator } from "../../types";
import { splitApiErrorMessage } from "./splitApiError";

const isAbortError = (error: unknown): boolean =>
    error instanceof DOMException && error.name === "AbortError";

type UseSplitGroupDetailArgs = {
    T: Translator;
    apiFetch: ApiFetcher;
    guardDemo: () => boolean;
};

// One group's full picture: detail + roster + balances + its own expenses and
// settlements. `SplitExpenseViewSet`/`SplitSettlementViewSet` have no
// `?group=` filter server-side (piano sez. 6 lists every accessible row, no
// per-group query param), so the group-scoped lists below are the full
// accessible collection filtered client-side — acceptable at this scaffolding
// stage (see phase summary), revisit if group histories grow large enough to
// warrant a dedicated backend filter.
export function useSplitGroupDetail({
    T,
    apiFetch,
    guardDemo,
}: UseSplitGroupDetailArgs) {
    const [selectedGroupId, setSelectedGroupId] = useState<
        number | string | null
    >(null);
    const [groupDetail, setGroupDetail] = useState<SplitGroup | null>(null);
    const [groupMembers, setGroupMembers] = useState<SplitParticipant[]>([]);
    const [groupBalances, setGroupBalances] = useState<SplitBalanceEntry[]>([]);
    const [groupExpenses, setGroupExpenses] = useState<SplitExpense[]>([]);
    const [groupSettlements, setGroupSettlements] = useState<SplitSettlement[]>(
        [],
    );
    const [groupSimplified, setGroupSimplified] = useState<
        SplitSimplifiedTransaction[] | null
    >(null);
    const [groupDetailLoading, setGroupDetailLoading] = useState(false);
    const [groupSimplifyLoading, setGroupSimplifyLoading] = useState(false);
    const [groupDetailError, setGroupDetailError] = useState<string | null>(
        null,
    );
    const requestSeqRef = useRef(0);
    const abortRef = useRef<AbortController | null>(null);
    // Separate guards for refreshSplitGroupMembers/loadSplitGroupSimplify
    // (piano Batch 4.2) — each protects against races with repeated calls to
    // itself (e.g. a fast double-click), independent of loadSplitGroupDetail.
    const membersRequestSeqRef = useRef(0);
    const membersAbortRef = useRef<AbortController | null>(null);
    const simplifyRequestSeqRef = useRef(0);
    const simplifyAbortRef = useRef<AbortController | null>(null);

    const loadSplitGroupDetail = useCallback(
        async (groupId: number | string) => {
            const requestSeq = ++requestSeqRef.current;
            if (abortRef.current) abortRef.current.abort();
            const controller = new AbortController();
            abortRef.current = controller;
            setSelectedGroupId(groupId);
            setGroupSimplified(null);
            setGroupDetailLoading(true);
            setGroupDetailError(null);
            try {
                const [detail, members, balances, expenses, settlements] =
                    await Promise.all([
                        fetchSplitGroup(apiFetch, groupId, controller.signal),
                        fetchSplitGroupMembers(
                            apiFetch,
                            groupId,
                            controller.signal,
                        ),
                        fetchSplitGroupBalances(
                            apiFetch,
                            groupId,
                            controller.signal,
                        ),
                        fetchSplitExpensesList(apiFetch, controller.signal),
                        fetchSplitSettlementsList(apiFetch, controller.signal),
                    ]);
                if (requestSeq !== requestSeqRef.current) return;
                setGroupDetail(detail);
                setGroupMembers(members);
                setGroupBalances(balances);
                setGroupExpenses(
                    expenses.filter((e) => String(e.group) === String(groupId)),
                );
                setGroupSettlements(
                    settlements.filter(
                        (s) => String(s.group) === String(groupId),
                    ),
                );
            } catch (error) {
                if (isAbortError(error)) return;
                if (requestSeq === requestSeqRef.current) {
                    setGroupDetailError(splitApiErrorMessage(error, T));
                }
            } finally {
                if (abortRef.current === controller) abortRef.current = null;
                if (requestSeq === requestSeqRef.current) {
                    setGroupDetailLoading(false);
                }
            }
        },
        [apiFetch, T],
    );

    const clearSplitGroupDetail = useCallback(() => {
        if (abortRef.current) abortRef.current.abort();
        requestSeqRef.current += 1;
        if (membersAbortRef.current) membersAbortRef.current.abort();
        membersRequestSeqRef.current += 1;
        if (simplifyAbortRef.current) simplifyAbortRef.current.abort();
        simplifyRequestSeqRef.current += 1;
        setSelectedGroupId(null);
        setGroupDetail(null);
        setGroupMembers([]);
        setGroupBalances([]);
        setGroupExpenses([]);
        setGroupSettlements([]);
        setGroupSimplified(null);
        setGroupDetailError(null);
    }, []);

    // Members + balances are refreshed together after any roster change: a
    // member joining/leaving changes who future shares are computed against.
    // `groupDetail.members` (the `SplitGroup.members` SerializerMethodField
    // snapshot taken once by `fetchSplitGroup` in loadSplitGroupDetail above)
    // is kept in sync here too — SplitExpenseFormModal/SplitSettleUpModal/
    // SplitRecurringSection all read participants off the `group` prop they
    // receive (== groupDetail), not off `groupMembers`; without this they'd
    // keep auto-adding whatever roster existed at the last full group load,
    // silently dropping members added afterwards from new expenses/recurrings.
    const refreshSplitGroupMembers = useCallback(
        async (groupId: number | string) => {
            const requestSeq = ++membersRequestSeqRef.current;
            if (membersAbortRef.current) membersAbortRef.current.abort();
            const controller = new AbortController();
            membersAbortRef.current = controller;
            try {
                const [members, balances] = await Promise.all([
                    fetchSplitGroupMembers(
                        apiFetch,
                        groupId,
                        controller.signal,
                    ),
                    fetchSplitGroupBalances(
                        apiFetch,
                        groupId,
                        controller.signal,
                    ),
                ]);
                if (requestSeq !== membersRequestSeqRef.current) return;
                setGroupMembers(members);
                setGroupBalances(balances);
                setGroupDetail((prev) =>
                    prev && String(prev.id) === String(groupId)
                        ? { ...prev, members }
                        : prev,
                );
                // The roster/balances just changed — a previously computed
                // "Simplify debts" suggestion no longer reflects reality
                // (piano Batch 4.2). Same reset loadSplitGroupDetail already
                // does on a fresh group load.
                setGroupSimplified(null);
            } catch (error) {
                if (isAbortError(error)) return;
                if (requestSeq === membersRequestSeqRef.current) {
                    setGroupDetailError(splitApiErrorMessage(error, T));
                }
            } finally {
                if (membersAbortRef.current === controller) {
                    membersAbortRef.current = null;
                }
            }
        },
        [apiFetch, T],
    );

    const addMemberToSplitGroup = useCallback(
        async (
            groupId: number | string,
            payload: SplitMemberPayload,
        ): Promise<SplitParticipant | null> => {
            if (guardDemo()) return null;
            try {
                const participant = await addSplitGroupMember(
                    apiFetch,
                    groupId,
                    payload,
                );
                await refreshSplitGroupMembers(groupId);
                setGroupDetailError(null);
                return participant;
            } catch (error) {
                setGroupDetailError(splitApiErrorMessage(error, T));
                return null;
            }
        },
        [apiFetch, guardDemo, T, refreshSplitGroupMembers],
    );

    const removeMemberFromSplitGroup = useCallback(
        async (
            groupId: number | string,
            memberId: number | string,
        ): Promise<boolean> => {
            if (guardDemo()) return false;
            try {
                await removeSplitGroupMember(apiFetch, groupId, memberId);
                await refreshSplitGroupMembers(groupId);
                setGroupDetailError(null);
                return true;
            } catch (error) {
                setGroupDetailError(splitApiErrorMessage(error, T));
                return false;
            }
        },
        [apiFetch, guardDemo, T, refreshSplitGroupMembers],
    );

    const loadSplitGroupSimplify = useCallback(
        async (groupId: number | string) => {
            const requestSeq = ++simplifyRequestSeqRef.current;
            if (simplifyAbortRef.current) simplifyAbortRef.current.abort();
            const controller = new AbortController();
            simplifyAbortRef.current = controller;
            setGroupSimplifyLoading(true);
            try {
                const transactions = await simplifySplitGroupDebts(
                    apiFetch,
                    groupId,
                    controller.signal,
                );
                if (requestSeq !== simplifyRequestSeqRef.current) return;
                setGroupSimplified(transactions);
                setGroupDetailError(null);
            } catch (error) {
                if (isAbortError(error)) return;
                if (requestSeq === simplifyRequestSeqRef.current) {
                    setGroupDetailError(splitApiErrorMessage(error, T));
                }
            } finally {
                if (simplifyAbortRef.current === controller) {
                    simplifyAbortRef.current = null;
                }
                if (requestSeq === simplifyRequestSeqRef.current) {
                    setGroupSimplifyLoading(false);
                }
            }
        },
        [apiFetch, T],
    );

    return {
        selectedGroupId,
        groupDetail,
        groupMembers,
        groupBalances,
        groupExpenses,
        groupSettlements,
        groupSimplified,
        groupDetailLoading,
        groupSimplifyLoading,
        groupDetailError,
        setGroupDetailError,
        loadSplitGroupDetail,
        clearSplitGroupDetail,
        addMemberToSplitGroup,
        removeMemberFromSplitGroup,
        loadSplitGroupSimplify,
    };
}
