"use client";

import { createContext, useContext } from "react";
import { useThemeLang } from "./useThemeLang";
import type { ThemeController } from "./useThemeLang";

const I18nContext = createContext<ThemeController | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
    const value = useThemeLang();
    return (
        <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
    );
}

export function useI18n(): ThemeController {
    const ctx = useContext(I18nContext);
    if (!ctx) throw new Error("useI18n must be used within an I18nProvider");
    return ctx;
}
