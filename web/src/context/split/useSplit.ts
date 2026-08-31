import { useContext } from "react";
import { SplitContext } from "./SplitContext";
import type { SplitContextValue } from "./SplitContext";

// Unlike useApp() (mounted once at the root — always safe to cast), Split's
// provider only wraps the /split route subtree (web/src/app/(app)/split/
// layout.tsx, piano sez. 7.4), so a component rendered outside it is a real
// integration bug worth surfacing loudly rather than silently reading
// `undefined` off a cast context value.
export function useSplit(): SplitContextValue {
    const ctx = useContext(SplitContext);
    if (!ctx) {
        throw new Error("useSplit() must be used within a <SplitProvider>");
    }
    return ctx;
}
