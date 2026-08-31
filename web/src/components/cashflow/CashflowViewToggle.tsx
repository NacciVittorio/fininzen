"use client";

import type { Dispatch, SetStateAction } from "react";
import { useApp } from "../../context/useApp";
import type { CashflowFilters } from "../../context/feedDefaults";
import {
    CASHFLOW_VIEW_PRESETS,
    detectActivePreset,
} from "../../context/cashflowViewPresets";
import { SegmentedControl } from "../ui";

// "Personale | Condivise | Tutte" (piano B6 Fase 1) — a preset over the
// already-existing `types` filter, reusing the same cfFilters/setCfFilters
// state the type chips and the filter sheet already drive. No new query, no
// new provider: the CashFlow feed has carried the split rows (net personal
// quota) since the Batch-1 fix, this just makes them easier to isolate.
export default function CashflowViewToggle({
    cfFilters,
    setCfFilters,
}: {
    cfFilters: CashflowFilters;
    setCfFilters: Dispatch<SetStateAction<CashflowFilters>>;
}) {
    const { T } = useApp();
    const active = detectActivePreset(cfFilters.types);

    return (
        <div data-testid="cf-view-toggle" style={{ marginBottom: 10 }}>
            <SegmentedControl
                value={active ?? undefined}
                onChange={(key) =>
                    setCfFilters((prev) => ({
                        ...prev,
                        types: [
                            ...CASHFLOW_VIEW_PRESETS[
                                key as keyof typeof CASHFLOW_VIEW_PRESETS
                            ],
                        ],
                    }))
                }
                options={[
                    {
                        value: "personal",
                        label: T("cf_view_toggle_personal"),
                    },
                    { value: "shared", label: T("cf_view_toggle_shared") },
                    { value: "all", label: T("cf_view_toggle_all") },
                ]}
            />
        </div>
    );
}
