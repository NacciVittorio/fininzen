import { createContext } from "react";
import type { AppActionControllers } from "./useAppActionControllers";
import type { AppDataControllers } from "./useAppDataControllers";
import type { AppProviderState } from "./useAppProviderState";
import type { SessionController } from "./useSessionController";
import type { ThemeController } from "./useThemeLang";
import type { AccountingMonth, DateRange } from "./appContextHelpers";

type DataContextValue = AppDataControllers["contextValue"];
type ActionContextValue = AppActionControllers["contextValue"];

export type AppContextValue = Omit<AppProviderState, "setWealthTimeRange"> &
    SessionController &
    SessionController["sharingController"] &
    ThemeController &
    DataContextValue &
    ActionContextValue & {
        API: string;
        accountingMonthDateRange: (year: number, month: number) => DateRange;
        currentAccountingMonth: () => AccountingMonth;
        setWealthTimeRange: DataContextValue["changeWealthTimeRange"];
    };

export const AppContext = createContext<AppContextValue | null>(null);

export {
    mergeDashConfig,
    normalizeMonthlyOverviewPrefs,
    normalizeWealthMetrics,
} from "./appContextHelpers";
