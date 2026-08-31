"use client";

import type { ReactNode } from "react";
import { useApp } from "../useApp";
import { SplitContext } from "./SplitContext";
import type { SplitContextValue } from "./SplitContext";
import { useSplitContacts } from "./useSplitContacts";
import { useSplitExpenseForm } from "./useSplitExpenseForm";
import { useSplitGroupDetail } from "./useSplitGroupDetail";
import { useSplitGroups } from "./useSplitGroups";
import { useSplitOverview } from "./useSplitOverview";
import { useSplitPartnerLinks } from "./useSplitPartnerLinks";
import { useSplitRecurring } from "./useSplitRecurring";
import { useSplitSettlement } from "./useSplitSettlement";

// Split's own state provider (piano sez. 7.4) — deliberately NOT part of the
// global AppProvider. Split adds ~7 entities with a state footprint
// comparable to the whole Cash Flow module (useTransactionFeeds.ts alone is
// ~470 lines); wiring it into AppProvider would load and refresh all of that
// on every page of the app even for a user who never opens the Split tab.
// Mounted only by web/src/app/(app)/split/layout.tsx, so it re-reads
// useApp() (apiFetch/T/guardDemo/decimalSeparator) from the already-mounted
// global AppProvider rather than duplicating auth/session plumbing.
export function SplitProvider({ children }: { children: ReactNode }) {
    const { T, apiFetch, guardDemo, decimalSeparator } = useApp();

    const contacts = useSplitContacts({ T, apiFetch, guardDemo });
    const partnerLinks = useSplitPartnerLinks({ T, apiFetch, guardDemo });
    const groups = useSplitGroups({ T, apiFetch, guardDemo });
    const groupDetail = useSplitGroupDetail({ T, apiFetch, guardDemo });
    const expenseForm = useSplitExpenseForm({
        T,
        apiFetch,
        guardDemo,
        decimalSeparator,
    });
    const settlement = useSplitSettlement({ T, apiFetch, guardDemo });
    const recurring = useSplitRecurring({ T, apiFetch, guardDemo });
    const overview = useSplitOverview({ T, apiFetch });

    const value: SplitContextValue = {
        ...contacts,
        ...partnerLinks,
        ...groups,
        ...groupDetail,
        ...expenseForm,
        ...settlement,
        ...recurring,
        ...overview,
    };

    return (
        <SplitContext.Provider value={value}>{children}</SplitContext.Provider>
    );
}
