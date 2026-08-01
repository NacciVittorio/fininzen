import { useEffect, useMemo } from "react";
import { currentMonth, currentYear } from "../utils/formatters";
import {
    buildKpiData,
    buildMonthlyTrend,
    filterExpensesByCategories,
    getAvailableMonths,
    getAvailableYears,
    getRootCategories,
    groupAssets,
} from "./derivedDataModel";
import type { Translator } from "../types";
import type { AppProviderState } from "./useAppProviderState";
import type { AppQueries } from "./useAppQueries";
import type { SessionController } from "./useSessionController";

type DerivedProviderState = Pick<
    AppProviderState,
    "assetForm" | "cashflowDir" | "filterCat" | "filterYear" | "setFilterYear"
> &
    Pick<
        AppQueries,
        | "assets"
        | "categories"
        | "expSummary"
        | "expenses"
        | "investmentTypes"
        | "summary"
        | "trendExpenses"
        | "trendIncomes"
    >;

type UseDerivedAppDataArgs = DerivedProviderState &
    Pick<SessionController, "enabledFeatures" | "accountingMonthStartDay"> & {
        MONTHS: string[];
        T: Translator;
    };

export type SettingsNavigationItem = {
    key: string;
    icon: string;
    label: string;
    href: string;
};

export function useDerivedAppData({
    MONTHS,
    T,
    accountingMonthStartDay,
    assetForm,
    assets,
    cashflowDir,
    categories,
    enabledFeatures,
    expSummary,
    expenses,
    filterCat,
    filterYear,
    investmentTypes,
    setFilterYear,
    summary,
    trendExpenses,
    trendIncomes,
}: UseDerivedAppDataArgs) {
    // ── Derived / memos ──

    const s = useMemo(() => summary || {}, [summary]);

    const filteredExpenses = useMemo(
        () => filterExpensesByCategories(expenses, filterCat, categories),
        [expenses, filterCat, categories],
    );

    const rootCategoriesForDir = useMemo(
        () => getRootCategories(categories, cashflowDir),
        [categories, cashflowDir],
    );

    const rootExpenseCategories = useMemo(
        () => getRootCategories(categories, "expense"),
        [categories],
    );

    const cashflowBaseData = useMemo(
        () => (cashflowDir === "income" ? trendIncomes : trendExpenses),
        [cashflowDir, trendIncomes, trendExpenses],
    );

    const availableYears = useMemo(
        () => getAvailableYears(cashflowBaseData, currentYear),
        [cashflowBaseData],
    );

    const availableMonthsForYear = useMemo(
        () =>
            getAvailableMonths(
                cashflowBaseData,
                filterYear,
                currentYear,
                currentMonth,
            ),
        [cashflowBaseData, filterYear],
    );

    useEffect(() => {
        if (availableYears.length === 0) return;
        if (!availableYears.includes(filterYear)) {
            setFilterYear(availableYears[0]!);
        }
    }, [availableYears, filterYear, setFilterYear]);

    const {
        bankAccounts,
        archivedBankAccounts,
        investments,
        archivedInvestments,
    } = useMemo(() => groupAssets(assets), [assets]);

    const selectedInvType = useMemo(
        () =>
            investmentTypes.find(
                (type) =>
                    type.id ===
                    Number.parseInt(String(assetForm.investment_type), 10),
            ),
        [investmentTypes, assetForm.investment_type],
    );

    const kpiData = useMemo(() => buildKpiData(expSummary, s), [expSummary, s]);

    const monthlyTrend = useMemo(
        () => buildMonthlyTrend(trendExpenses, MONTHS, accountingMonthStartDay),
        [trendExpenses, MONTHS, accountingMonthStartDay],
    );

    const monthlyIncomeTrend = useMemo(
        () => buildMonthlyTrend(trendIncomes, MONTHS, accountingMonthStartDay),
        [trendIncomes, MONTHS, accountingMonthStartDay],
    );

    const hasConfigurableDataFeatures =
        enabledFeatures.cashflow ||
        enabledFeatures.accounts ||
        enabledFeatures.investments;
    const settingsNavItems = [
        {
            key: "account",
            icon: "👤",
            label: T("settings_user"),
            href: "/settings/account",
        },
        (hasConfigurableDataFeatures || enabledFeatures.fire) && {
            key: "planning",
            icon: "🗂️",
            label: T("settings_planning"),
            href: "/settings/planning",
        },
        {
            key: "preferences",
            icon: "⚙️",
            label: T("settings_preferences"),
            href: "/settings/preferences",
        },
        {
            key: "data",
            icon: "📥",
            label: T("settings_data"),
            href: "/settings/data",
        },
        {
            key: "about",
            icon: "ℹ️",
            label: T("settings_about"),
            href: "/settings/about",
        },
    ].filter((item): item is SettingsNavigationItem => Boolean(item));

    return {
        s,
        filteredExpenses,
        rootCategoriesForDir,
        rootExpenseCategories,
        availableYears,
        availableMonthsForYear,
        bankAccounts,
        archivedBankAccounts,
        investments,
        archivedInvestments,
        selectedInvType,
        kpiData,
        monthlyTrend,
        monthlyIncomeTrend,
        settingsNavItems,
    };
}
