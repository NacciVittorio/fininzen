"use client";

import { useEffect, useState } from "react";
import { useApp } from "../../context/useApp";
import { useSplit } from "../../context/split/useSplit";
import { PageHeader } from "../../components/ui";
import type { SplitBalanceEntry } from "../../api/split";
import SplitBalancesOverviewView from "./SplitBalancesOverviewView";
import SplitContactsSection from "./SplitContactsSection";
import SplitExpenseFormModal from "./SplitExpenseFormModal";
import SplitGroupDetailView from "./SplitGroupDetailView";
import SplitGroupListView from "./SplitGroupListView";
import SplitSettleUpModal from "./SplitSettleUpModal";

type SplitSection = "groups" | "contacts";

// Root view for the Split tab (piano sez. 7.5): overall balance + groups
// list + a "quick expense" CTA for a standalone (groupless) split, with the
// contact book one tap away. Drills into SplitGroupDetailView whenever a
// group is selected (`selectedGroupId` on SplitContext, set by
// SplitGroupCard/SplitGroupListView) — this component itself never fetches
// group detail, it only reacts to that piece of shared state.
export default function SplitView() {
    const { T } = useApp();
    const {
        selectedGroupId,
        loadSplitGroups,
        loadSplitOverview,
        loadSplitContacts,
    } = useSplit();

    const [section, setSection] = useState<SplitSection>("groups");
    const [showQuickExpense, setShowQuickExpense] = useState(false);
    const [settleEntry, setSettleEntry] = useState<SplitBalanceEntry | null>(
        null,
    );

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

    if (selectedGroupId != null) {
        return <SplitGroupDetailView />;
    }

    return (
        <div>
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
                </>
            ) : (
                <SplitContactsSection />
            )}

            <SplitExpenseFormModal
                open={showQuickExpense}
                group={null}
                onClose={() => setShowQuickExpense(false)}
                onSaved={() => loadSplitOverview()}
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
