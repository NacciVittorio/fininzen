import { ApiRequestError } from "../../api/client";
import type { Translator } from "../../types";

// Every SplitServiceError code (splitting/services.py) that can reach the
// client as a raw DRF ValidationError string — `{"participants": str(exc)}`
// and friends just do str(exc) with no i18n, so the code itself (e.g.
// "negative_share_input") used to render verbatim in the UI. Reuses the
// live-preview copy (splitShareMath.ts) for codes both layers can raise;
// `user_not_found` reuses the existing GrantsView-convention key the
// SplitServiceError docstring says this mirrors.
const SPLIT_API_ERROR_KEYS: Record<string, string> = {
    no_participants: "split_error_no_participants",
    exact_amounts_mismatch: "split_error_exact_mismatch",
    percentages_not_100: "split_error_percentages_not_100",
    weights_not_positive: "split_error_weights_not_positive",
    negative_share_input: "split_error_negative_share",
    shares_too_skewed: "split_error_shares_too_skewed",
    single_payer_required: "split_error_single_payer_required",
    duplicate_participant: "split_error_duplicate_participant",
    participant_not_in_group: "split_error_participant_not_in_group",
    not_a_linked_partner: "split_error_not_a_linked_partner",
    contact_not_found: "split_error_contact_not_found",
    raw_input_required: "split_error_raw_input_required",
    payer_not_active_member: "split_error_payer_not_active_member",
    participant_identity_invalid: "split_error_participant_identity_invalid",
    invalid_split_method: "split_error_invalid_split_method",
    payer_required: "split_error_payer_required",
    cannot_link_self: "split_error_cannot_link_self",
    email_required: "split_error_email_required",
    user_not_found: "user_not_found",
    only_group_creator_can_remove_members:
        "split_error_only_creator_can_remove_members",
};

// Shared by every Split hook that submits a form: flattens a DRF validation
// payload ({field: [msg, ...]}) into one line, same approach already used ad
// hoc in useContributionSourceManagement.ts — factored out here once since
// every Split hook (contacts/groups/expenses/settlements/recurring/partner
// links) needs the exact same extraction. A flattened value that matches a
// known SplitServiceError code is translated; anything else (a plain-text
// DRF message, e.g. serializer field validation) passes through unchanged
// rather than showing nothing.
export function splitApiErrorMessage(error: unknown, T: Translator): string {
    if (error instanceof ApiRequestError) {
        const payload = error.payload;
        if (payload && typeof payload === "object") {
            const flat = Object.values(payload as Record<string, unknown>)
                .flat()
                .filter(Boolean)
                .join(" ");
            if (flat) {
                const key = SPLIT_API_ERROR_KEYS[flat];
                return key ? T(key) : flat;
            }
        }
        if (typeof payload === "string" && payload) {
            const key = SPLIT_API_ERROR_KEYS[payload];
            return key ? T(key) : payload;
        }
    }
    return T("error_network");
}
