import { useMemo } from "react";
import { useApp } from "../context/useApp";
import { localeFromSeparator, makeEurFormatters } from "./formatters";

export function useFormatters() {
    const ctx = useApp();
    const decimalSeparator = ctx?.decimalSeparator === "." ? "." : ",";
    return useMemo(
        () => makeEurFormatters(localeFromSeparator(decimalSeparator)),
        [decimalSeparator],
    );
}
