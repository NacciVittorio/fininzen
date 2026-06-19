/* @refresh reset */
import type { ReactNode } from "react";
import { API } from "../utils/api";
import {
    accountingMonthDateRange,
    currentAccountingMonth,
} from "./appContextHelpers";
import { useAppActionControllers } from "./useAppActionControllers";
import { useAppDataControllers } from "./useAppDataControllers";
import { useAppProviderState } from "./useAppProviderState";
import { useSessionController } from "./useSessionController";
import { useThemeLang } from "./useThemeLang";
import { AppContext } from "./AppContext";
import type { AppContextValue } from "./AppContext";

export function AppProvider({ children }: { children: ReactNode }) {
    const providerState = useAppProviderState();
    const sessionController = useSessionController(providerState);
    const themeController = useThemeLang();
    const dataControllers = useAppDataControllers({
        providerState,
        sessionController,
        themeController,
    });
    const actionControllers = useAppActionControllers({
        providerState,
        sessionController,
        themeController,
        dataControllers,
    });

    const { accountingMonthStartDay, apiFetch, sharingController } =
        sessionController;
    const { contextValue: dataContext } = dataControllers;
    const value: AppContextValue = {
        ...providerState,
        ...sessionController,
        ...sharingController,
        ...themeController,
        ...dataContext,
        ...actionControllers.contextValue,
        API,
        accountingMonthDateRange: (year: number, month: number) =>
            accountingMonthDateRange(year, month, accountingMonthStartDay),
        currentAccountingMonth: () =>
            currentAccountingMonth(accountingMonthStartDay),
        apiFetch,
        setWealthTimeRange: dataContext.changeWealthTimeRange,
    };

    return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
