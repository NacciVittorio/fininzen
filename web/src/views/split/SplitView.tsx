"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useApp } from "../../context/useApp";
import { useSplit } from "../../context/split/useSplit";
import { PageHeader } from "../../components/ui";
import { fetchSplitExpense, fetchSplitSettlement } from "../../api/split";
import type { SplitBalanceEntry, SplitExpense } from "../../api/split";
import SplitBalancesOverviewView from "./SplitBalancesOverviewView";
import SplitContactsSection from "./SplitContactsSection";
import SplitExpenseFormModal from "./SplitExpenseFormModal";
import SplitGroupDetailView from "./SplitGroupDetailView";
import SplitGroupListView from "./SplitGroupListView";
import SplitSettleUpModal from "./SplitSettleUpModal";
import SplitStandaloneExpensesSection from "./SplitStandaloneExpensesSection";

type SplitSection = "groups" | "contacts";

// Reads the CashFlow "Apri in Split" deep-link params (?openExpense=/
// ?openSettlement=, see CfDetailSheet.tsx/CashflowDeleteConfirmModal.tsx,
// piano Batch 1) in its own leaf component: useSearchParams() requires a
// Suspense boundary in the Next.js app router, and isolating it here means
// only this null-rendering leaf ever suspends, not the whole tab.
function SplitDeepLinkParams({
    onOpenExpense,
    onOpenSettlement,
}: {
    onOpenExpense: (id: string) => void;
    onOpenSettlement: (id: string) => void;
}) {
    const searchParams = useSearchParams();
    const openExpense = searchParams.get("openExpense");
    const openSettlement = searchParams.get("openSettlement");

    useEffect(() => {
        if (openExpense) onOpenExpense(openExpense);
        // Re-firing only when the param itself changes (not on every render
        // of the callback identity) keeps this from looping once the caller
        // clears the URL after handling it.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [openExpense]);

    useEffect(() => {
        if (openSettlement) onOpenSettlement(openSettlement);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [openSettlement]);

    return null;
}

// Root view for the Split tab (piano sez. 7.5): overall balance + groups
// list + a "quick expense" CTA for a standalone (groupless) split, with the
// contact book one tap away. Drills into SplitGroupDetailView whenever a
// group is selected (`selectedGroupId` on SplitContext, set by
// SplitGroupCard/SplitGroupListView) — this component itself never fetches
// group detail, it only reacts to that piece of shared state.
export default function SplitView() {
    const { T, apiFetch } = useApp();
    const router = useRouter();
    const {
        selectedGroupId,
        loadSplitGroups,
        loadSplitGroupDetail,
        loadSplitOverview,
        loadSplitContacts,
        loadStandaloneExpenses,
    } = useSplit();

    const [section, setSection] = useState<SplitSection>("groups");
    const [showQuickExpense, setShowQuickExpense] = useState(false);
    const [settleEntry, setSettleEntry] = useState<SplitBalanceEntry | null>(
        null,
    );
    // Set once a CashFlow "?openExpense=" deep link resolves the expense's
    // own group — consumed by whichever branch below ends up rendering
    // (SplitGroupDetailView for a group expense, or the standalone quick-
    // expense modal here for group=null).
    const [pendingEditExpense, setPendingEditExpense] =
        useState<SplitExpense | null>(null);

    // BUG FIX (found while writing split.spec.ts, piano sez. 8.2): `contacts`
    // was only ever loaded by SplitContactsSection's own mount effect. A
    // session that opens a group's detail (or the "quick expense" modal)
    // without having visited the Contacts tab first saw `contacts` stuck at
    // `[]` — SplitGroupDetailView's "add member" <Select> only renders when
    // `memberCandidates.length > 0`, and SplitExpenseFormModal's standalone
    // participant list is built from `contacts` too, so both silently showed
    // no candidates at all, with no loading state or error to explain why.
    // Loading contacts here, alongside groups, makes `contacts` available
    // everywhere under the Split tab regardless of which section is opened
    // first — mirrors loadSplitGroups() already doing the same for `groups`.
    useEffect(() => {
        loadSplitGroups();
        loadSplitContacts();
    }, [loadSplitGroups, loadSplitContacts]);

    // Strips the deep-link params once handled, so a refresh or a "back"
    // navigation into /split doesn't re-trigger the same lookup.
    const clearDeepLinkParams = useCallback(() => {
        router.replace("/split");
    }, [router]);

    // A resolved openExpense/openSettlement can flip `selectedGroupId`
    // (loadSplitGroupDetail), which swaps SplitDeepLinkParams' branch and
    // remounts it — its effect would then re-fire with the same still-present
    // search param before clearDeepLinkParams' navigation lands (the two are
    // racing microtasks, not sequenced). Tracking handled ids here, outside
    // the leaf that gets remounted, makes each id a no-op the second time
    // regardless of which of the two wins.
    const handledDeepLinkIds = useRef<Set<string>>(new Set());

    const handleOpenExpense = useCallback(
        (id: string) => {
            const key = `expense:${id}`;
            if (handledDeepLinkIds.current.has(key)) return;
            handledDeepLinkIds.current.add(key);
            fetchSplitExpense(apiFetch, id)
                .then((expense) => {
                    setPendingEditExpense(expense);
                    if (expense.group != null) {
                        loadSplitGroupDetail(expense.group);
                    } else {
                        setShowQuickExpense(true);
                    }
                })
                .catch(() => {})
                .finally(clearDeepLinkParams);
        },
        [apiFetch, loadSplitGroupDetail, clearDeepLinkParams],
    );

    const handleOpenSettlement = useCallback(
        (id: string) => {
            const key = `settlement:${id}`;
            if (handledDeepLinkIds.current.has(key)) return;
            handledDeepLinkIds.current.add(key);
            // Settlements have no edit form (splitting/views/settlements.py
            // has no update endpoint) — landing on the group is enough, the
            // user deletes it from the settlement history list already
            // rendered there (SplitGroupDetailView). A settlement with no
            // group (cross-group, deleted in place from CashFlow directly)
            // never reaches this link in the first place.
            fetchSplitSettlement(apiFetch, id)
                .then((settlement) => {
                    if (settlement.group != null) {
                        loadSplitGroupDetail(settlement.group);
                    }
                })
                .catch(() => {})
                .finally(clearDeepLinkParams);
        },
        [apiFetch, loadSplitGroupDetail, clearDeepLinkParams],
    );

    if (selectedGroupId != null) {
        return (
            <>
                <Suspense fallback={null}>
                    <SplitDeepLinkParams
                        onOpenExpense={handleOpenExpense}
                        onOpenSettlement={handleOpenSettlement}
                    />
                </Suspense>
                <SplitGroupDetailView
                    autoOpenExpense={pendingEditExpense}
                    onAutoOpenExpenseConsumed={() =>
                        setPendingEditExpense(null)
                    }
                />
            </>
        );
    }

    return (
        <div>
            <Suspense fallback={null}>
                <SplitDeepLinkParams
                    onOpenExpense={handleOpenExpense}
                    onOpenSettlement={handleOpenSettlement}
                />
            </Suspense>

            <PageHeader
                title={T("tab_split")}
                subtitle={T("split_overview_subtitle")}
                actions={
                    <button
                        type="button"
                        className="btn btn-p"
                        data-testid="split-quick-expense-cta"
                        onClick={() => setShowQuickExpense(true)}
                    >
                        + {T("split_expense_new_quick")}
                    </button>
                }
            />

            <div className="row" style={{ gap: 8, marginBottom: 16 }}>
                <button
                    type="button"
                    className={`btn btn-sm ${section === "groups" ? "btn-p" : "btn-g"}`}
                    data-testid="split-tab-groups"
                    onClick={() => setSection("groups")}
                >
                    {T("split_groups_title")}
                </button>
                <button
                    type="button"
                    className={`btn btn-sm ${section === "contacts" ? "btn-p" : "btn-g"}`}
                    data-testid="split-tab-contacts"
                    onClick={() => setSection("contacts")}
                >
                    {T("split_contacts_title")}
                </button>
            </div>

            {section === "groups" ? (
                <>
                    <SplitBalancesOverviewView onSettle={setSettleEntry} />
                    <SplitGroupListView />
                    <SplitStandaloneExpensesSection />
                </>
            ) : (
                <SplitContactsSection />
            )}

            <SplitExpenseFormModal
                open={showQuickExpense}
                group={null}
                expense={pendingEditExpense}
                onClose={() => {
                    setShowQuickExpense(false);
                    setPendingEditExpense(null);
                }}
                onSaved={() => {
                    loadSplitOverview();
                    loadStandaloneExpenses();
                }}
            />
            <SplitSettleUpModal
                open={settleEntry != null}
                entry={settleEntry}
                group={null}
                onClose={() => setSettleEntry(null)}
                onSettled={() => loadSplitOverview()}
            />
        </div>
    );
}
