import { ApiRequestError, requestJsonWithFetcher } from "./client";
import type { ApiFetcher } from "./client";

export type FireModelMode = "classic" | "real" | "dual";

export type FireSettings = {
    user_age?: number;
    retirement_age?: number;
    withdrawal_rate?: string;
    annual_expenses_override?: string | null;
    growth_rate_bear?: string;
    growth_rate_base?: string;
    growth_rate_bull?: string;
    inflation_rate?: string;
    net_worth_goal?: string | null;
    model_mode?: FireModelMode;
    swr_base?: string;
    swr_min?: string;
    swr_max?: string;
    annual_expenses_retirement?: string | null;
    annual_passive_income_retirement?: string;
    expected_real_return?: string;
    expected_nominal_return?: string;
    annual_contribution?: string | null;
    tax_drag_rate?: string;
    target_retirement_age?: number;
    life_expectancy?: number;
    portfolio_equity_pct?: string;
};

export type FireProjectionPoint = {
    year: number;
    fire_number: string;
    nw_bear: string;
    nw_base: string;
    nw_bull: string;
    fired_bear: boolean;
    fired_base: boolean;
    fired_bull: boolean;
};

export type FireScenario = "bear" | "base" | "bull";
export type FiredYear = Record<FireScenario, number | null>;

export type FireSensitivity = {
    saving_multipliers: string[];
    spending_multipliers: string[];
    matrix: (number | null)[][];
};

type FireMetrics = {
    fire_number: string;
    progress_pct: string;
    already_fire: boolean;
    years_to_fire: number | null;
    runway_years: string | null;
    current_nw: string;
    annual_expenses: string;
    withdrawal_rate: string;
    safe_spending_annual: string;
    fire_number_classic: string;
    fire_number_real: string;
    model_mode: FireModelMode;
};

type FireKpis = {
    fire_number_classic: string;
    fire_number_real: string;
    years_to_fire: number | null;
    coast_status: boolean;
    safe_spending_annual: string;
};

type CoastFire = {
    coast_number: string;
    fire_number_at_retirement: string;
    progress_pct: string;
    already_coast: boolean;
    real_return: string;
    years_to_retirement: number;
};

type FireProbability = {
    years_to_fire: number | null;
    scenario: FireScenario;
};

type FireLever = {
    lever: string;
    years_to_fire: number | null;
    delta_years: number;
};

export type FireResponse = {
    metrics: FireMetrics;
    kpis: FireKpis;
    coast_fire: CoastFire;
    projection: FireProjectionPoint[];
    accumulation_projection: FireProjectionPoint[];
    fired_year: FiredYear;
    sensitivity: FireSensitivity;
    probability_band: Record<"p20" | "p50" | "p80", FireProbability>;
    actionable_levers: FireLever[];
    settings: FireSettings;
    computed_annual_expenses: string;
    computed_annual_income: string;
    computed_annual_savings: string;
    effective_annual_contribution: string;
    annual_expenses_net: string;
    current_nw: string;
};

type ErrorPayload = {
    error?: string;
};

export function getPayloadError(error: unknown): string | null {
    if (!(error instanceof ApiRequestError)) return null;
    const payload = error.payload;
    if (
        payload &&
        typeof payload === "object" &&
        "error" in payload &&
        typeof (payload as ErrorPayload).error === "string"
    ) {
        return (payload as ErrorPayload).error ?? null;
    }
    return `Errore ${error.status}`;
}

export function fetchFire(fetcher: ApiFetcher): Promise<FireResponse> {
    return requestJsonWithFetcher<FireResponse>(fetcher, "/portfolio/fire/");
}

export function saveFireSettings(
    fetcher: ApiFetcher,
    settings: FireSettings,
): Promise<FireResponse> {
    return requestJsonWithFetcher<FireResponse>(
        fetcher,
        "/portfolio/fire/settings/",
        {
            method: "PATCH",
            body: settings,
        },
    );
}
