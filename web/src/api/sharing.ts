import type { ApiFetcher } from "./client";
import { requestJsonWithFetcher } from "./client";

export type GrantPermission = "read" | "write" | "full";

export type ShareGrantPayload = {
    email: string;
    permission: GrantPermission;
};

export type UpdateGrantPayload = {
    permission: GrantPermission;
};

export type ShareGrant = {
    id: number | string;
    permission: GrantPermission;
    owner_id?: number | string;
    owner_email?: string;
    grantee_email?: string;
};

export type GrantsResponse = {
    given?: ShareGrant[];
    received?: ShareGrant[];
};

export const fetchGrantsList = (fetcher: ApiFetcher): Promise<GrantsResponse> =>
    requestJsonWithFetcher<GrantsResponse>(fetcher, "/auth/grants/");

export const createGrant = (
    fetcher: ApiFetcher,
    payload: ShareGrantPayload,
): Promise<unknown> =>
    requestJsonWithFetcher(fetcher, "/auth/grants/", {
        method: "POST",
        body: payload,
    });

export const revokeGrant = (
    fetcher: ApiFetcher,
    grantId: number | string,
): Promise<unknown> =>
    requestJsonWithFetcher(fetcher, `/auth/grants/${grantId}/`, {
        method: "DELETE",
    });

export const updateGrantPermission = (
    fetcher: ApiFetcher,
    grantId: number | string,
    payload: UpdateGrantPayload,
): Promise<unknown> =>
    requestJsonWithFetcher(fetcher, `/auth/grants/${grantId}/`, {
        method: "PATCH",
        body: payload,
    });
