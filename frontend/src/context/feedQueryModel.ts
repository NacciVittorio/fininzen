const PORTFOLIO_TRANSACTION_TYPES = ["buy", "sell", "adjustment"];

interface CategoryRef {
    id: string | number;
    parent?: string | number | null;
}

interface QueryOptions {
    page?: number;
    pageSize?: number;
}

interface CashflowQueryOptions extends QueryOptions {
    categories?: CategoryRef[];
}

interface CashflowQueryFilters {
    types?: string[];
    date_from?: string;
    date_to?: string;
    category_ids?: Array<string | number>;
    account_ids?: Array<string | number>;
    verified?: boolean | null;
    search?: string;
    ordering?: string;
}

interface AssetTransactionQueryFilters {
    types?: string[];
    asset_ids?: Array<string | number>;
    date_from?: string;
    date_to?: string;
    verified?: boolean | null;
    search?: string;
    ordering?: string;
}

export function buildCashflowQueryParams(
    filters: CashflowQueryFilters,
    { categories = [], page, pageSize = 50 }: CashflowQueryOptions = {},
) {
    const params = new URLSearchParams();
    const types = filters.types ?? [];
    const categoryIds = filters.category_ids ?? [];
    const accountIds = filters.account_ids ?? [];
    params.set("page", String(page || 1));
    params.set("page_size", String(pageSize));

    if (types.length > 0 && types.length < 4) {
        params.set("types", types.join(","));
    }
    if (filters.date_from) params.set("date_from", filters.date_from);
    if (filters.date_to) params.set("date_to", filters.date_to);

    if (categoryIds.length > 0) {
        const parentIds: string[] = [];
        const childIds: string[] = [];
        categoryIds.forEach((id) => {
            const category = categories.find(
                (candidate) => String(candidate.id) === String(id),
            );
            if (category && !category.parent) parentIds.push(String(id));
            else childIds.push(String(id));
        });
        if (parentIds.length > 0) {
            params.set("parent_category", parentIds.join(","));
        }
        if (childIds.length > 0) params.set("category", childIds.join(","));
    }

    if (accountIds.length > 0) {
        params.set("account", accountIds.join(","));
    }
    if (filters.verified !== null && filters.verified !== undefined) {
        params.set("verified", String(filters.verified));
    }
    if (filters.search?.trim()) params.set("search", filters.search.trim());
    if (filters.ordering && filters.ordering !== "-date") {
        params.set("ordering", filters.ordering);
    }
    return params;
}

export function buildAssetTxQueryParams(
    filters: AssetTransactionQueryFilters,
    { page, pageSize = 50 }: QueryOptions = {},
) {
    const params = new URLSearchParams();
    const assetIds = filters.asset_ids ?? [];
    params.set("page", String(page || 1));
    params.set("page_size", String(pageSize));

    const requestedTypes = Array.isArray(filters.types) ? filters.types : [];
    const effectiveTypes = requestedTypes.filter((type) =>
        PORTFOLIO_TRANSACTION_TYPES.includes(type),
    );
    const types =
        effectiveTypes.length > 0
            ? effectiveTypes
            : PORTFOLIO_TRANSACTION_TYPES;
    params.set("type", types.join(","));

    if (assetIds.length > 0) {
        params.set("asset", assetIds.join(","));
    }
    if (filters.date_from) params.set("date_from", filters.date_from);
    if (filters.date_to) params.set("date_to", filters.date_to);
    if (filters.verified !== null && filters.verified !== undefined) {
        params.set("verified", String(filters.verified));
    }
    if (filters.search?.trim()) params.set("search", filters.search.trim());
    if (filters.ordering && filters.ordering !== "-date") {
        params.set("ordering", filters.ordering);
    }
    return params;
}
