"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Draft state for a filter sheet.
 *
 * The sheets used to write straight through to the live filters, so the feed
 * reloaded on every tap and the footer button had nothing left to do but close.
 * Here the sheet edits a copy and nothing reaches the feed until `apply()`.
 *
 * The draft is re-seeded from `committed` on every open transition, so closing
 * by backdrop / Escape / drag discards the edits — same outcome as "Annulla".
 * The sheet component itself stays mounted while closed (only `BottomSheet`'s
 * children unmount), which is why this watches `open` instead of relying on a
 * fresh mount.
 */
export function useFilterDraft<T>(
    open: boolean,
    committed: T,
    commit: (next: T) => void,
) {
    const [draft, setDraft] = useState<T>(committed);
    const wasOpen = useRef(open);
    // Read inside the effect only, so a change of the live filters while the
    // sheet is open never clobbers the draft.
    const committedRef = useRef(committed);
    committedRef.current = committed;

    useEffect(() => {
        if (open && !wasOpen.current) setDraft(committedRef.current);
        wasOpen.current = open;
    }, [open]);

    return {
        draft,
        setDraft,
        apply: () => commit(draft),
    };
}
