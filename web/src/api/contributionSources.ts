import type { ApiFetcher } from "./client";
import {
    fetchAllPagesWithFetcher,
    requestJsonWithFetcher,
    type PaginatedResponse,
} from "./client";

export type ContributionSourcePayload = {
    name: string;
    sort_order: number;
    is_active: boolean;
};

export type ContributionSourceDeletePayload = {
    transactions_action: string;
    reassign_to: number | null;
};

export type ContributionSource = {
    id: number;
    name: string;
    sort_order?: number;
    is_active?: boolean;
    transaction_count?: number;
    asset_count?: number;
};

export type ContributionSourceCollection =
    ContributionSource[] | PaginatedResponse<ContributionSource>;

export const fetchContributionSourcesList = (
    fetcher: ApiFetcher,
): Promise<ContributionSourceCollection> =>
    fetchAllPagesWithFetcher<ContributionSource>(
        fetcher,
        "/portfolio/contribution-sources/",
    );

export const createContributionSource = (
    fetcher: ApiFetcher,
    payload: ContributionSourcePayload,
): Promise<unknown> =>
    requestJsonWithFetcher(fetcher, "/portfolio/contribution-sources/", {
        method: "POST",
        body: payload,
    });

export const updateContributionSource = (
    fetcher: ApiFetcher,
    sourceId: number,
    payload: ContributionSourcePayload,
): Promise<unknown> =>
    requestJsonWithFetcher(
        fetcher,
        `/portfolio/contribution-sources/${sourceId}/`,
        {
            method: "PATCH",
            body: payload,
        },
    );

export const deleteContributionSource = (
    fetcher: ApiFetcher,
    sourceId: number,
    payload: ContributionSourceDeletePayload,
): Promise<unknown> =>
    requestJsonWithFetcher(
        fetcher,
        `/portfolio/contribution-sources/${sourceId}/`,
        {
            method: "DELETE",
            body: payload,
        },
    );
