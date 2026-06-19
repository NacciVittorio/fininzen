import { useCallback } from "react";
import { fetchContributionSourcesList } from "../api/contributionSources";
import type { ContributionSource } from "../api/contributionSources";
import { fetchInvestmentTypesList } from "../api/investmentTypes";
import type { InvestmentType } from "../api/investmentTypes";
import type { ApiFetcher } from "../api/client";
import { logError } from "../utils/logger";
import type { Dispatch, SetStateAction } from "react";
import type { AssetForm } from "./useAppProviderState";

type UseCatalogDataArgs = {
    apiFetch: ApiFetcher;
    setAssetForm: Dispatch<SetStateAction<AssetForm>>;
    setContributionSources: Dispatch<SetStateAction<ContributionSource[]>>;
    setInvestmentTypes: Dispatch<SetStateAction<InvestmentType[]>>;
};

export function useCatalogData({
    apiFetch,
    setAssetForm,
    setContributionSources,
    setInvestmentTypes,
}: UseCatalogDataArgs) {
    const fetchInvestmentTypes = useCallback(async () => {
        try {
            const data = await fetchInvestmentTypesList(apiFetch);
            const types = Array.isArray(data) ? data : data.results;
            setInvestmentTypes(types);
            setAssetForm((previous) =>
                !previous.investment_type && types.length > 0
                    ? { ...previous, investment_type: types[0]!.id }
                    : previous,
            );
        } catch (error) {
            logError("fetchInvestmentTypes:", error);
        }
    }, [apiFetch, setAssetForm, setInvestmentTypes]);

    const fetchContributionSources = useCallback(async () => {
        try {
            const data = await fetchContributionSourcesList(apiFetch);
            setContributionSources(Array.isArray(data) ? data : data.results);
        } catch (error) {
            logError("fetchContributionSources:", error);
        }
    }, [apiFetch, setContributionSources]);

    return { fetchContributionSources, fetchInvestmentTypes };
}
