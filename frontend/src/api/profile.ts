import type { ApiFetcher } from "./client";
import { requestJsonWithFetcher } from "./client";

export type ProfilePayload = Record<string, unknown>;
export type ProfileResponse = {
    email?: string | null;
    name?: string | null;
    decimal_separator?: "," | ".";
    accounting_month_start_day?: unknown;
    enabled_features?: unknown;
    privacy_preferences?: unknown;
    transaction_preferences?: unknown;
    dashboard_config?: unknown;
    dashboard_preferences?: unknown;
    [key: string]: unknown;
};

export const fetchUserProfile = (
    fetcher: ApiFetcher,
): Promise<ProfileResponse> =>
    requestJsonWithFetcher<ProfileResponse>(fetcher, "/auth/profile/");

export const updateUserProfile = (
    fetcher: ApiFetcher,
    payload: ProfilePayload,
): Promise<ProfileResponse> =>
    requestJsonWithFetcher<ProfileResponse>(fetcher, "/auth/profile/", {
        method: "PATCH",
        body: payload,
    });
