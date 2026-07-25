"use client";

import type { Translator } from "../../types";

/**
 * Shared footer for the filter sheets. Filters are edited as a draft
 * (see useFilterDraft), so "Applica" is what actually reaches the feed and
 * "Annulla" discards — the previous single button only closed the sheet, which
 * left no way to tell whether anything had been applied.
 */
export default function FilterSheetFooter({
    T,
    onCancel,
    onApply,
    applyTestId,
    cancelTestId,
}: {
    T: Translator;
    onCancel: () => void;
    onApply: () => void;
    applyTestId?: string;
    cancelTestId?: string;
}) {
    return (
        <div
            style={{
                display: "flex",
                gap: 10,
                padding: "18px 0 0",
            }}
        >
            <button
                type="button"
                data-testid={cancelTestId}
                onClick={onCancel}
                className="btn btn-g pressable"
                style={{ flex: 1, minHeight: 48, fontSize: 15 }}
            >
                {T("btn_cancel")}
            </button>
            <button
                type="button"
                data-testid={applyTestId}
                onClick={onApply}
                className="btn btn-p pressable"
                style={{ flex: 2, minHeight: 48, fontSize: 15 }}
            >
                {T("filters_apply")}
            </button>
        </div>
    );
}
