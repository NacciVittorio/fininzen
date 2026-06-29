import type { ApiFetcher, PaginatedResponse } from "./client";
import { fetchAllPagesWithFetcher, requestJsonWithFetcher } from "./client";
import type { Asset } from "./types";

export type UnknownCollection<TItem = unknown> =
    | TItem[]
    | PaginatedResponse<TItem>;

export type PortfolioSummaryResponse = {
    total_invested?: number | string;
    total_current?: number | string;
    total_gain?: number | string;
    total_gain_percent?: number | string;
    total_tax_liability?: number | string;
    total_post_tax_value?: number | string;
    by_type?: PortfolioTypeSummary[];
    by_currency?: PortfolioCurrencySummary[];
    [key: string]: unknown;
};
export type PortfolioTypeSummary = {
    type_id: number | null;
    type_name: string;
    type_color: string | null;
    is_bank_account: boolean;
    total_invested: number | string;
    total_current: number | string;
};
export type PortfolioCurrencySummary = {
    currency: string;
    total_eur: number | string;
    percent?: number;
};
export type MonthlyInvestmentStatsResponse = Record<string, unknown>;
export type PortfolioHistoryPoint = {
    snapshot_date: string;
    total_value?: number | string | null;
    by_asset_class?: Record<string, number> | null;
};
export type MonthlyOverviewResponse = {
    available_years?: number[];
    [key: string]: unknown;
};

const withQuery = (path: string, params?: URLSearchParams): `/${string}` => {
    const query = params?.toString();
    return `${path}${query ? `?${query}` : ""}` as `/${string}`;
};

export const fetchPortfolioAssetsList = (
    fetcher: ApiFetcher,
): Promise<UnknownCollection<Asset>> =>
    fetchAllPagesWithFetcher<Asset>(
        fetcher,
        "/portfolio/?include_archived=true",
    );

export const fetchPortfolioSummaryData = (
    fetcher: ApiFetcher,
): Promise<PortfolioSummaryResponse> =>
    requestJsonWithFetcher<PortfolioSummaryResponse>(
        fetcher,
        "/portfolio/summary/",
    );

export const fetchMonthlyOverviewData = (
    fetcher: ApiFetcher,
    year: number,
): Promise<MonthlyOverviewResponse> => {
    const params = new URLSearchParams();
    params.set("year", String(year));
    return requestJsonWithFetcher<MonthlyOverviewResponse>(
        fetcher,
        withQuery("/portfolio/monthly-overview/", params),
    );
};

export const fetchMonthlyInvestmentStatsData = (
    fetcher: ApiFetcher,
    params: URLSearchParams,
): Promise<MonthlyInvestmentStatsResponse> =>
    requestJsonWithFetcher<MonthlyInvestmentStatsResponse>(
        fetcher,
        withQuery("/portfolio/monthly-investment-stats/", params),
    );

export const fetchPortfolioHistoryData = (
    fetcher: ApiFetcher,
    params: URLSearchParams,
): Promise<PortfolioHistoryPoint[]> =>
    requestJsonWithFetcher<PortfolioHistoryPoint[]>(
        fetcher,
        withQuery("/portfolio/history/", params),
    );
