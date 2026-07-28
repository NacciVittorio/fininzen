import { ApiRequestError } from "../../api/client";
import type { Translator } from "../../types";

// Shared by every Split hook that submits a form: flattens a DRF validation
// payload ({field: [msg, ...]}) into one line, same approach already used ad
// hoc in useContributionSourceManagement.ts — factored out here once since
// every Split hook (contacts/groups/expenses/settlements/recurring/partner
// links) needs the exact same extraction.
export function splitApiErrorMessage(error: unknown, T: Translator): string {
    if (error instanceof ApiRequestError) {
        const payload = error.payload;
        if (payload && typeof payload === "object") {
            const flat = Object.values(payload as Record<string, unknown>)
                .flat()
                .filter(Boolean)
                .join(" ");
            if (flat) return flat;
        }
        if (typeof payload === "string" && payload) return payload;
    }
    return T("error_network");
}
