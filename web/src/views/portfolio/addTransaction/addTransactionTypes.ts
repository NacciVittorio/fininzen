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

// State of the historical-price autofill, rendered as a hint under the price
// field. "unavailable" means the backend answered but has no quote for that
// date (weekend/holiday/pre-IPO) — the user has to type the price by hand.
export type AddTxPriceStatus = "idle" | "loading" | "unavailable";
