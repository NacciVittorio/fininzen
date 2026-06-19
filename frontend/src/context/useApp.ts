import { useContext } from "react";
import { AppContext } from "./AppContext";
import type { AppContextValue } from "./AppContext";

export function useApp(): AppContextValue {
    return useContext(AppContext) as AppContextValue;
}
