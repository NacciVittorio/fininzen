import type { AssetTransactionFilters, CashflowFilters } from "./feedDefaults";

const PORTFOLIO_TX_TYPES = ["buy", "sell", "adjustment"] as const;
type SelectionId = number | string;

type SelectionState = {
    selectAllFiltered: boolean;
    selectedIds: ReadonlySet<SelectionId>;
    totalCount: number;
};

type CategoryRef = {
    id: SelectionId;
    parent?: SelectionId | null;
};

type BulkSelectionArgs<Filters> = {
    filters: Filters;
    selectAllFiltered: boolean;
    selectedIds: ReadonlySet<SelectionId>;
};

type IdPayload = { mode: "ids"; ids: SelectionId[] };
type FilteredPayload<Filters> = {
    mode: "filtered";
    filters: Filters;
    exclude_ids: SelectionId[];
};

export const getSelectedCount = ({
    selectAllFiltered,
    selectedIds,
    totalCount,
}: SelectionState): number => {
    if (selectAllFiltered) {
        return Math.max(0, (totalCount || 0) - selectedIds.size);
    }
    return selectedIds.size;
};

export const getCfBulkActionsAllowed = (
    selectionKind?: string | null,
): { verify: boolean; edit: boolean; delete: boolean } => {
    if (selectionKind === "adjustment") {
        return { verify: false, edit: false, delete: true };
    }
    return { verify: true, edit: true, delete: true };
};

export const buildAssetTxBulkSelectionPayload = ({
    filters,
    selectAllFiltered,
    selectedIds,
}: BulkSelectionArgs<AssetTransactionFilters>):
    IdPayload | FilteredPayload<Record<string, string | boolean>> => {
    if (!selectAllFiltered) {
        return { mode: "ids", ids: Array.from(selectedIds) };
    }

    const backendFilters: Record<string, string | boolean> = {};
    const types = Array.isArray(filters.types)
        ? filters.types.filter((type) =>
              PORTFOLIO_TX_TYPES.includes(
                  type as (typeof PORTFOLIO_TX_TYPES)[number],
              ),
          )
        : PORTFOLIO_TX_TYPES;
    if (types.length > 0) backendFilters.type = types.join(",");
    if (Array.isArray(filters.asset_ids) && filters.asset_ids.length > 0) {
        backendFilters.asset = filters.asset_ids.join(",");
    }
    if (filters.date_from) backendFilters.date_from = filters.date_from;
    if (filters.date_to) backendFilters.date_to = filters.date_to;
    if (filters.verified !== null && filters.verified !== undefined) {
        backendFilters.verified = filters.verified;
    }
    if (filters.search && filters.search.trim()) {
        backendFilters.search = filters.search.trim();
    }
    if (filters.ordering && filters.ordering !== "-date") {
        backendFilters.ordering = filters.ordering;
    }
    return {
        mode: "filtered",
        filters: backendFilters,
        exclude_ids: Array.from(selectedIds),
    };
};

export const buildCfBulkSelectionPayload = ({
    filters,
    selectAllFiltered,
    selectedIds,
    categories,
}: BulkSelectionArgs<CashflowFilters> & { categories: CategoryRef[] }):
    | IdPayload
    | FilteredPayload<
          Record<string, string | boolean | Array<string | number> | number[]>
      > => {
    if (!selectAllFiltered) {
        return { mode: "ids", ids: Array.from(selectedIds) };
    }

    const backendFilters: Record<
        string,
        string | boolean | Array<string | number> | number[]
    > = {};
    if (filters.types && filters.types.length > 0 && filters.types.length < 4) {
        backendFilters.types = filters.types;
    }
    if (filters.date_from) backendFilters.date_from = filters.date_from;
    if (filters.date_to) backendFilters.date_to = filters.date_to;
    if (
        Array.isArray(filters.category_ids) &&
        filters.category_ids.length > 0
    ) {
        const parents: number[] = [];
        const children: number[] = [];
        filters.category_ids.forEach((id) => {
            const category = categories.find(
                (item) => String(item.id) === String(id),
            );
            if (category && !category.parent) parents.push(Number(id));
            else children.push(Number(id));
        });
        if (children.length > 0) backendFilters.category_ids = children;
        if (parents.length > 0) backendFilters.parent_category_ids = parents;
    }
    if (Array.isArray(filters.account_ids) && filters.account_ids.length > 0) {
        backendFilters.account_ids = filters.account_ids;
    }
    if (filters.verified !== null && filters.verified !== undefined) {
        backendFilters.verified = filters.verified;
    }
    if (filters.search && filters.search.trim()) {
        backendFilters.search = filters.search.trim();
    }
    return {
        mode: "filtered",
        filters: backendFilters,
        exclude_ids: Array.from(selectedIds),
    };
};
