import type { ApiFetcher, PaginatedResponse } from "./client";
import { fetchAllPagesWithFetcher } from "./client";
import type { InvestmentType } from "./types";

// InvestmentType is sourced from the generated OpenAPI types (see ./types),
// so the backend serializer stays the single source of truth.
export type { InvestmentType };

export type InvestmentTypeCollection =
    | InvestmentType[]
    | PaginatedResponse<InvestmentType>;

export const fetchInvestmentTypesList = (
    fetcher: ApiFetcher,
): Promise<InvestmentTypeCollection> =>
    fetchAllPagesWithFetcher<InvestmentType>(
        fetcher,
        "/portfolio/investment-types/",
    );
