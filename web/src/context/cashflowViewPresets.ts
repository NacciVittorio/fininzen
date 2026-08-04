import { ALL_CASHFLOW_TYPES } from "./feedDefaults";
import type { CashflowItemType } from "./feedTypes";

export type CashflowViewPresetKey = "personal" | "shared" | "all";

// Presets for the CashFlow "Personale | Condivise | Tutte" toggle (piano
// B6 Fase 1) — a preset over the *existing* `types` filter, not a new query:
// the feed already returns the split rows (expenses/cashflow.py), so picking
// a preset just replaces cfFilters.types like any other type chip would.
export const CASHFLOW_VIEW_PRESETS: Record<
    CashflowViewPresetKey,
    CashflowItemType[]
> = {
    personal: ["income", "outcome", "transfer", "adjustment"],
    shared: ["split", "split_reimbursement"],
    all: [...ALL_CASHFLOW_TYPES],
};

// Order-insensitive match against the current `types` filter, mirroring how
// the existing type chips tolerate re-ordering (nextTypeSelection above).
// No exact match (e.g. a custom combination from the filter sheet) means no
// preset is highlighted — the same "off" state the filter chips already
// tolerate, not an error case.
export function detectActivePreset(
    types: readonly CashflowItemType[],
): CashflowViewPresetKey | null {
    const current = new Set(types);
    for (const key of Object.keys(
        CASHFLOW_VIEW_PRESETS,
    ) as CashflowViewPresetKey[]) {
        const preset = CASHFLOW_VIEW_PRESETS[key];
        if (
            preset.length === current.size &&
            preset.every((t) => current.has(t))
        ) {
            return key;
        }
    }
    return null;
}
