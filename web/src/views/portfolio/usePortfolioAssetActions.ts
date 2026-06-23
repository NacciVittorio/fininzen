import { useState } from "react";
import { API } from "../../utils/api";
import { parseFlexibleDecimal } from "../../utils/formatters";
import type { ApiFetcher } from "../../api/client";
import type { Asset } from "../../api/types";
import type { Translator } from "../../types";
import type { EntityId } from "../../context/feedTypes";
import type { ArchiveBlockedModal } from "./ArchiveBlockedSheet";
import type { RealizeForm } from "./RealizeAssetSheet";

type ArchiveResult = {
    ok?: boolean;
    data?: {
        error?: string;
        shares?: string;
        current_value?: string;
        currency?: string;
    };
} | null;

type UsePortfolioAssetActionsArgs = {
    T: Translator;
    apiFetch: ApiFetcher;
    archiveAsset: (id: EntityId) => Promise<ArchiveResult>;
    fetchAssets: () => Promise<unknown>;
    fetchPortfolioSummary: () => Promise<unknown>;
    loadAssetTxFeed: (page: number) => Promise<unknown> | unknown;
    unarchiveAsset: (id: EntityId) => unknown;
};

export function usePortfolioAssetActions({
    T,
    apiFetch,
    archiveAsset,
    fetchAssets,
    fetchPortfolioSummary,
    loadAssetTxFeed,
    unarchiveAsset,
}: UsePortfolioAssetActionsArgs) {
    const [archiveBlockedModal, setArchiveBlockedModal] =
        useState<ArchiveBlockedModal | null>(null);
    const [realizeModal, setRealizeModal] = useState<Asset | null>(null);
    const [realizeForm, setRealizeForm] = useState<RealizeForm>({
        sale_price: "",
        dest_account_id: "",
        fee: "",
    });
    const [realizeError, setRealizeError] = useState<string | null>(null);
    const [realizeLoading, setRealizeLoading] = useState(false);

    const handleArchiveInvestment = async (asset: Asset) => {
        const result = await archiveAsset(asset.id);
        if (!result || result.ok) return;
        if (result.data?.error === "non_zero_shares") {
            setArchiveBlockedModal({
                type: "shares",
                assetName: asset.name,
                shares: result.data.shares ?? "",
            });
            return;
        }
        if (result.data?.error === "non_zero_balance") {
            setArchiveBlockedModal({
                type: "balance",
                assetName: asset.name,
                currentValue: result.data.current_value ?? "",
                currency: result.data.currency ?? "",
            });
        }
    };

    const handleUnarchiveInvestment = (id: EntityId) => unarchiveAsset(id);

    const openRealizeAsset = (asset: Asset) => {
        setRealizeModal(asset);
        setRealizeForm({
            sale_price: String(asset.current_value ?? ""),
            dest_account_id: "",
            fee: "",
        });
        setRealizeError(null);
    };

    const submitRealizeAsset = async () => {
        if (!realizeModal) return;
        const salePrice = parseFlexibleDecimal(realizeForm.sale_price);
        const fee = realizeForm.fee ? parseFlexibleDecimal(realizeForm.fee) : 0;
        if (
            Number.isNaN(salePrice) ||
            Number.isNaN(fee) ||
            salePrice <= 0 ||
            fee < 0 ||
            !realizeForm.dest_account_id
        ) {
            setRealizeError(T("error_invalid_amount"));
            return;
        }

        setRealizeLoading(true);
        setRealizeError(null);
        try {
            const response = await apiFetch(
                `${API}/portfolio/${realizeModal.id}/realize/`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        sale_price: String(salePrice),
                        dest_account_id: realizeForm.dest_account_id,
                        fee: String(fee),
                    }),
                },
            );
            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                setRealizeError(
                    Object.values(error).flat().join(" ") ||
                        T("error_save_failed"),
                );
                return;
            }
            setRealizeModal(null);
            await Promise.all([
                fetchAssets(),
                fetchPortfolioSummary(),
                loadAssetTxFeed(1),
            ]);
        } catch {
            setRealizeError(T("error_network"));
        } finally {
            setRealizeLoading(false);
        }
    };

    return {
        archiveBlockedModal,
        setArchiveBlockedModal,
        realizeModal,
        setRealizeModal,
        realizeForm,
        setRealizeForm,
        realizeError,
        realizeLoading,
        handleArchiveInvestment,
        handleUnarchiveInvestment,
        openRealizeAsset,
        submitRealizeAsset,
    };
}
