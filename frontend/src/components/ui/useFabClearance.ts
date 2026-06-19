import { useEffect } from "react";

// How many FABs are currently mounted (ref-counted so view transitions where
// two pages briefly overlap don't drop the class early).
let fabCount = 0;

// Marks the page as having a floating action button so the mobile content
// padding can reserve scroll clearance for it (`body.has-fab` in tokens.css).
// Counted while mounted — not while visible — so toggling `hidden` during
// overlays doesn't reflow the page.
export default function useFabClearance() {
    useEffect(() => {
        fabCount += 1;
        document.body.classList.add("has-fab");
        return () => {
            fabCount -= 1;
            if (fabCount === 0) document.body.classList.remove("has-fab");
        };
    }, []);
}
