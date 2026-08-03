import { createContext } from "react";
import type { useSplitContacts } from "./useSplitContacts";
import type { useSplitPartnerLinks } from "./useSplitPartnerLinks";
import type { useSplitGroups } from "./useSplitGroups";
import type { useSplitGroupDetail } from "./useSplitGroupDetail";
import type { useSplitExpenseForm } from "./useSplitExpenseForm";
import type { useSplitSettlement } from "./useSplitSettlement";
import type { useSplitRecurring } from "./useSplitRecurring";
import type { useSplitOverview } from "./useSplitOverview";

// Flattened union of every Split sub-hook's return value, same composition
// style as AppContext.ts's AppContextValue — SplitProvider spreads all of
// them into a single context value so views can destructure whatever they
// need from one `useSplit()` call instead of one hook per concern.
export type SplitContextValue = ReturnType<typeof useSplitContacts> &
    ReturnType<typeof useSplitPartnerLinks> &
    ReturnType<typeof useSplitGroups> &
    ReturnType<typeof useSplitGroupDetail> &
    ReturnType<typeof useSplitExpenseForm> &
    ReturnType<typeof useSplitSettlement> &
    ReturnType<typeof useSplitRecurring> &
    ReturnType<typeof useSplitOverview>;

export const SplitContext = createContext<SplitContextValue | null>(null);
