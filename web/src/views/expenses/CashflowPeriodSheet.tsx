"use client";

import type { Dispatch, SetStateAction } from "react";
import { BottomSheet } from "../../components/ui";
import PeriodFilterSection from "../../components/filters/PeriodFilterSection";
import type { Translator } from "../../types";
import type { CashflowFilters } from "../../context/feedDefaults";
import type { DateRange } from "../../context/appContextHelpers";

// The shortcut opened by the header pager's label. It shares
// PeriodFilterSection with the "Filtri" sheet, so the two cannot drift apart —
// but it writes straight to the live filters (no draft): it is a one-tap
// shortcut and closes as soon as a concrete period is picked.
export default function CashflowPeriodSheet({
    periodSheetOpen,
    setPeriodSheetOpen,
    T,
    cfFilters,
    setCfFilters,
    accountingMonthDateRange,
}: {
    periodSheetOpen: boolean;
    setPeriodSheetOpen: (value: boolean) => void;
    T: Translator;
    cfFilters: CashflowFilters;
    setCfFilters: Dispatch<SetStateAction<CashflowFilters>>;
    accountingMonthDateRange: (year: number, month: number) => DateRange;
}) {
    return (
        <BottomSheet
            open={periodSheetOpen}
            onClose={() => setPeriodSheetOpen(false)}
            ariaLabel={T("cf_period")}
        >
            <div style={{ padding: "4px 16px 16px" }}>
                <div
                    style={{
                        fontSize: 18,
                        fontWeight: 600,
                        color: "var(--fg)",
                        padding: "2px 2px 12px",
                    }}
                >
                    {T("cf_period")}
                </div>
                <PeriodFilterSection
                    T={T}
                    dateFrom={cfFilters.date_from}
                    dateTo={cfFilters.date_to}
                    monthRange={accountingMonthDateRange}
                    allChipTestId="cf-period-sheet-all"
                    onRangeChange={({ from, to }, pick) => {
                        setCfFilters((p) => ({
                            ...p,
                            date_from: from,
                            date_to: to,
                        }));
                        // Switching between Mese/Anno keeps the sheet open so
                        // the user can then pick one; picking a period is the
                        // end of the interaction.
                        if (pick !== "mode") setPeriodSheetOpen(false);
                    }}
                />
            </div>
        </BottomSheet>
    );
}
