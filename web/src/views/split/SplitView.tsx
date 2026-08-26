"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useApp } from "../../context/useApp";
import { useSplit } from "../../context/split/useSplit";
import {
    Icon,
    LargeTitleHeader,
    PullToRefresh,
    SegmentedControl,
    SpeedDialFab,
} from "../../components/ui";
import { fetchSplitExpense, fetchSplitSettlement } from "../../api/split";
import type {
    SplitBalanceEntry,
    SplitExpense,
    SplitSettlement,
} from "../../api/split";
import { useFormatters } from "../../utils/useFormatters";
import SplitBalancesOverviewView from "./SplitBalancesOverviewView";
import SplitContactsSection from "./SplitContactsSection";
import SplitExpenseFormModal from "./SplitExpenseFormModal";
import SplitGroupDetailView from "./SplitGroupDetailView";
import SplitGroupListView from "./SplitGroupListView";
import SplitDeleteConfirmation from "./SplitDeleteConfirmation";
import SplitSettleUpModal from "./SplitSettleUpModal";
import SplitStandaloneExpensesSection from "./SplitStandaloneExpensesSection";
import SplitRecentActivitySection from "./SplitRecentActivitySection";
import {
    canModifySettlement,
    resolveMySplitUserId,
    splitIdentityLabel,
} from "./splitIdentity";

type SplitSection = "overview" | "groups" | "contacts";

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
    const { T, apiFetch, user, bankAccounts } = useApp();
    const { formatEur } = useFormatters();
    const router = useRouter();
    const {
        overview,
        selectedGroupId,
        loadSplitGroups,
        loadSplitGroupDetail,
        loadSplitOverview,
        loadSplitContacts,
        loadSplitActivity,
        groups,
        partnerLinksSent,
        partnerLinksReceived,
        removeSplitSettlement,
    } = useSplit();

    const [section, setSection] = useState<SplitSection>("overview");
    const [showQuickExpense, setShowQuickExpense] = useState(false);
    const [showGroupComposer, setShowGroupComposer] = useState(false);
    const [showContactComposer, setShowContactComposer] = useState(false);
    const [settleEntry, setSettleEntry] = useState<SplitBalanceEntry | null>(
        null,
    );
    const [deleteSettlementTarget, setDeleteSettlementTarget] =
        useState<SplitSettlement | null>(null);
    const [deletingSettlement, setDeletingSettlement] = useState(false);
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
        loadSplitOverview();
        loadSplitActivity();
    }, [
        loadSplitActivity,
        loadSplitContacts,
        loadSplitGroups,
        loadSplitOverview,
    ]);

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

    const handlePullRefresh = useCallback(async () => {
        await Promise.all([
            loadSplitGroups(),
            loadSplitContacts(),
            loadSplitOverview(),
            loadSplitActivity(),
        ]);
    }, [
        loadSplitActivity,
        loadSplitContacts,
        loadSplitGroups,
        loadSplitOverview,
    ]);

    const openExpense = useCallback(
        (expense: SplitExpense) => {
            setPendingEditExpense(expense);
            if (expense.group != null) {
                loadSplitGroupDetail(expense.group);
            } else {
                setShowQuickExpense(true);
            }
        },
        [loadSplitGroupDetail],
    );

    const overviewNet = overview.reduce(
        (sum, entry) => sum + Number(entry.balance),
        0,
    );
    const overviewNetText = `${overviewNet >= 0 ? "+" : "-"}${formatEur(
        Math.abs(overviewNet),
    )}`;

    const mySplitUserId = resolveMySplitUserId({
        myEmail: user,
        groups,
        partnerLinksSent,
        partnerLinksReceived,
    });

    const handleDeleteSettlement = async () => {
        if (!deleteSettlementTarget) return;
        setDeletingSettlement(true);
        const removed = await removeSplitSettlement(deleteSettlementTarget.id);
        setDeletingSettlement(false);
        if (removed) {
            setDeleteSettlementTarget(null);
            await Promise.all([loadSplitOverview(), loadSplitActivity()]);
        }
    };

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
        <PullToRefresh onRefresh={handlePullRefresh}>
            <div>
                <Suspense fallback={null}>
                    <SplitDeepLinkParams
                        onOpenExpense={handleOpenExpense}
                        onOpenSettlement={handleOpenSettlement}
                    />
                </Suspense>

                <LargeTitleHeader
                    eyebrow={T("split_balance_overview_title")}
                    title={
                        <span
                            className="app-net-worth hero-number"
                            data-testid="split-balances-overview-net"
                            style={{
                                color:
                                    overviewNet === 0
                                        ? "var(--fg)"
                                        : overviewNet > 0
                                          ? "var(--success)"
                                          : "var(--danger)",
                            }}
                        >
                            {overviewNetText}
                        </span>
                    }
                    compactTitle={T("tab_split")}
                    compactValue={overviewNetText}
                    subtitle={T("split_overview_subtitle")}
                    actions={
                        <div className="split-header-actions desktop-only">
                            <button
                                type="button"
                                className="btn btn-p"
                                data-testid="split-quick-expense-desktop"
                                onClick={() => setShowQuickExpense(true)}
                            >
                                + {T("split_expense_new_quick")}
                            </button>
                            <button
                                type="button"
                                className="btn btn-g"
                                data-testid="split-group-new-desktop"
                                onClick={() => {
                                    setSection("groups");
                                    setShowGroupComposer(true);
                                }}
                            >
                                {T("split_group_new")}
                            </button>
                            <button
                                type="button"
                                className="btn btn-g"
                                data-testid="split-contact-new-desktop"
                                onClick={() => {
                                    setSection("contacts");
                                    setShowContactComposer(true);
                                }}
                            >
                                {T("split_contact_new")}
                            </button>
                        </div>
                    }
                />

                <div style={{ marginBottom: 20, display: "flex" }}>
                    <SegmentedControl
                        value={section}
                        onChange={(value) => setSection(value as SplitSection)}
                        options={[
                            {
                                value: "overview",
                                label: T("split_overview_title"),
                                testId: "split-tab-overview",
                            },
                            {
                                value: "groups",
                                label: T("split_groups_title"),
                                testId: "split-tab-groups",
                            },
                            {
                                value: "contacts",
                                label: T("split_contacts_title"),
                                testId: "split-tab-contacts",
                            },
                        ]}
                    />
                </div>

                {section === "overview" ? (
                    <>
                        <SplitBalancesOverviewView
                            onSettle={setSettleEntry}
                            showNet={false}
                        />
                        <SplitRecentActivitySection
                            onOpenExpense={openExpense}
                            onDeleteSettlement={setDeleteSettlementTarget}
                            canDeleteSettlement={(settlement) =>
                                canModifySettlement(settlement, {
                                    mySplitUserId,
                                })
                            }
                            onOpenSettlement={(settlement) => {
                                if (settlement.group != null) {
                                    loadSplitGroupDetail(settlement.group);
                                }
                            }}
                        />
                        <SplitStandaloneExpensesSection />
                    </>
                ) : section === "groups" ? (
                    <SplitGroupListView
                        createOpen={showGroupComposer}
                        onCreateOpenChange={setShowGroupComposer}
                    />
                ) : (
                    <SplitContactsSection
                        createOpen={showContactComposer}
                        onCreateOpenChange={setShowContactComposer}
                    />
                )}

                <SpeedDialFab
                    className="mobile-only"
                    mainLabel={T("split_new_action")}
                    actions={[
                        {
                            label: T("split_expense_new_quick"),
                            icon: <Icon name="category" size={19} />,
                            testId: "split-quick-expense-cta",
                            onClick: () => setShowQuickExpense(true),
                        },
                        {
                            label: T("split_group_new"),
                            icon: <Icon name="split" size={19} />,
                            testId: "split-speed-new-group",
                            onClick: () => {
                                setSection("groups");
                                setShowGroupComposer(true);
                            },
                        },
                        {
                            label: T("split_contact_new"),
                            icon: <Icon name="plus" size={19} />,
                            testId: "split-speed-new-contact",
                            onClick: () => {
                                setSection("contacts");
                                setShowContactComposer(true);
                            },
                        },
                    ]}
                    hidden={
                        showQuickExpense ||
                        showGroupComposer ||
                        showContactComposer ||
                        settleEntry != null ||
                        deleteSettlementTarget != null
                    }
                />

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
                        loadSplitActivity();
                    }}
                />
                {deleteSettlementTarget && (
                    <SplitDeleteConfirmation
                        title={T("modal_delete_settlement")}
                        summary={`${splitIdentityLabel(
                            {
                                display_name:
                                    deleteSettlementTarget.payer_contact_name,
                                email: deleteSettlementTarget.payer_user_email,
                            },
                            { myEmail: user, T },
                        )} → ${splitIdentityLabel(
                            {
                                display_name:
                                    deleteSettlementTarget.payee_contact_name,
                                email: deleteSettlementTarget.payee_user_email,
                            },
                            { myEmail: user, T },
                        )} — ${formatEur(deleteSettlementTarget.amount)}`}
                        warning={
                            deleteSettlementTarget.linked_asset != null
                                ? T(
                                      "split_delete_settlement_linked_asset_warning",
                                  )
                                      .replace(
                                          "{account}",
                                          bankAccounts.find(
                                              (account) =>
                                                  account.id ===
                                                  deleteSettlementTarget.linked_asset,
                                          )?.name ?? "",
                                      )
                                      .replace(
                                          "{amount}",
                                          formatEur(
                                              deleteSettlementTarget.amount,
                                          ),
                                      )
                                : undefined
                        }
                        confirmTestId="split-activity-settlement-delete-confirm"
                        busy={deletingSettlement}
                        onClose={() => setDeleteSettlementTarget(null)}
                        onConfirm={handleDeleteSettlement}
                    />
                )}
                <SplitSettleUpModal
                    open={settleEntry != null}
                    entry={settleEntry}
                    group={null}
                    onClose={() => setSettleEntry(null)}
                    onSettled={() => {
                        loadSplitOverview();
                        loadSplitActivity();
                    }}
                />
            </div>
        </PullToRefresh>
    );
}
