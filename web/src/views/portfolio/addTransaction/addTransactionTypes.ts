import type { Dispatch, SetStateAction } from "react";
import type { Asset, ContributionSource } from "../../../api/types";
import type { AddTransactionForm } from "../portfolioViewModel";

// Shared prop contracts for the add-transaction form cluster. The form state and
// its setter are threaded through every leaf; centralising the aliases keeps the
// pieces in lock-step with `AddTransactionForm` and the generated `Asset` type.
export type SetAddTxForm = Dispatch<SetStateAction<AddTransactionForm>>;
export type SetAddTxAssetId = (value: string) => void;
export type SetTouched = (value: boolean) => void;
export type GetAvailableContributionSources = (
    asset: Asset,
) => ContributionSource[];

// Bank accounts are surfaced here only as <option> rows, so a minimal structural
// shape keeps the leaf decoupled from the full account model.
export type AccountOption = { id: number | string; name?: string | null };
