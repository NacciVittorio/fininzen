import type { Translator } from "../../types";
import type { MonthlyOverviewPreferences } from "../../context/appContextHelpers";

// Monthly net-worth view models. The context exposes the overview payload as a
// loose DataObject; these types describe the shape the networth components
// actually read (assets indexed by 0-11 month, plus the summary rows).

export type MnwMode = "single" | "compare";
export type MnwMonthRange = 3 | 6 | 9 | 12;

// monthly_values is a 0-11 indexed series; nulls mark months with no data.
export type MnwMonthlyValues = (number | null)[];

export type MnwInvestmentType = {
    id?: number | string | null;
    color?: string;
    name?: string;
};

export type MnwAsset = {
    id: number | string;
    name: string;
    currency?: string;
    investment_type?: MnwInvestmentType | null;
    monthly_values?: MnwMonthlyValues;
};

export type MnwSummary = Partial<Record<string, MnwMonthlyValues>>;

export type MnwOverview = {
    assets: MnwAsset[];
    summary: MnwSummary;
};

export type MnwToolbarProps = {
    mode: MnwMode;
    setMode: (mode: MnwMode) => void;
    monthRange: number;
    changeRange: (range: MnwMonthRange) => void;
    yearA: number;
    yearB: number;
    updatePrefs: (patch: Partial<MonthlyOverviewPreferences>) => void;
    year: number;
    changeYear: (delta: number) => void;
    availableYears: number[];
    T: Translator;
};

export type MnwGridProps = MnwToolbarProps & {
    monthlyOverview: MnwOverview | null;
    prevYearOverview: MnwOverview | null;
    compareLoading?: boolean;
    overviewA?: MnwOverview | null;
    overviewB?: MnwOverview | null;
};
