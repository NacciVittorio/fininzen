import type { ApiFetcher } from "./client";
import { requestJsonWithFetcher } from "./client";

export type ApiToken = {
    id: number;
    label: string;
    prefix: string;
    scope: string;
    created_at: string;
    last_used_at: string | null;
    revoked_at: string | null;
};

export type ApiTokenCreated = ApiToken & { token: string };

export const listApiTokens = (fetcher: ApiFetcher) =>
    requestJsonWithFetcher<ApiToken[]>(fetcher, "/auth/api-tokens/");

export const createApiToken = (fetcher: ApiFetcher, label: string) =>
    requestJsonWithFetcher<ApiTokenCreated>(fetcher, "/auth/api-tokens/", {
        method: "POST",
        body: { label },
    });

export const revokeApiToken = (fetcher: ApiFetcher, id: number) =>
    requestJsonWithFetcher<null>(fetcher, `/auth/api-tokens/${id}/`, {
        method: "DELETE",
    });
