import type { Asset } from "../api/types";

export const DEEP_DIVE_EPSILON = 0.005;

export type DeepDiveAssetRow = {
    asset: Asset;
    value: number;
    pctOfCategory: number;
    pctOfTotal: number;
    gainPct: number;
    color: string;
};

export type DeepDiveGroup = {
    id: number | string;
    name: string;
    color: string;
    isBankAccount: boolean;
    total: number;
    pctOfTotal: number;
    assets: DeepDiveAssetRow[];
};

type DraftGroup = Omit<DeepDiveGroup, "total" | "pctOfTotal" | "assets"> & {
    assets: Asset[];
};

const assetValue = (asset: Asset): number =>
    Number(asset.current_value_eur ?? asset.current_value ?? 0);

export function buildInvestmentDeepDiveGroups(assets: Asset[] = []): {
    groups: DeepDiveGroup[];
    grandTotal: number;
} {
    const byType = new Map<number | string, DraftGroup>();
    for (const asset of assets) {
        const type = asset.investment_type_detail;
        const typeId = type?.id ?? "none";
        if (!byType.has(typeId)) {
            byType.set(typeId, {
                id: typeId,
                name: type?.name || "—",
                color: type?.color || "var(--accent)",
                isBankAccount: !!type?.is_bank_account,
                assets: [],
            });
        }
        byType.get(typeId)?.assets.push(asset);
    }

    const grandTotal = assets.reduce(
        (sum, asset) => sum + assetValue(asset),
        0,
    );
    const groups: DeepDiveGroup[] = [];
    for (const group of byType.values()) {
        const total = group.assets.reduce(
            (sum, asset) => sum + assetValue(asset),
            0,
        );
        if (Math.abs(total) <= DEEP_DIVE_EPSILON) continue;
        const groupAssets = group.assets
            .map((asset) => {
                const value = assetValue(asset);
                return {
                    asset,
                    value,
                    pctOfCategory: total > 0 ? (value / total) * 100 : 0,
                    pctOfTotal: grandTotal > 0 ? (value / grandTotal) * 100 : 0,
                    gainPct: Number(asset.gain_percent || 0),
                };
            })
            .filter((row) => Math.abs(row.value) > DEEP_DIVE_EPSILON)
            .sort((a, b) => b.value - a.value)
            .map((row, index) => ({
                ...row,
                color: `var(--chart-${(index % 6) + 1})`,
            }));
        groups.push({
            id: group.id,
            name: group.name,
            color: group.color,
            isBankAccount: group.isBankAccount,
            total,
            pctOfTotal: grandTotal > 0 ? (total / grandTotal) * 100 : 0,
            assets: groupAssets,
        });
    }
    groups.sort((a, b) => b.total - a.total);
    return { groups, grandTotal };
}
