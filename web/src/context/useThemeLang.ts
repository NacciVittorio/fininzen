import { useState, useEffect, useMemo, useCallback } from "react";
import { createT } from "../i18n";
import type { Language } from "../i18n";

export type Theme = "light" | "dark";
export type ThemePreference = Theme | "auto";

const hasWindow = typeof window !== "undefined";

/**
 * Language (i18n) + theme (light/dark/auto) state. Depends only on
 * localStorage, matchMedia and document — no other app state. Ported verbatim
 * from the Vite app, with the localStorage/matchMedia reads guarded so the
 * initializers are safe during Next's server render (the values hydrate on the
 * client). Returns exactly the surface the providers expose.
 */
export function useThemeLang() {
    // i18n
    const [lang, setLang] = useState<Language>(() => {
        if (!hasWindow) return "en";
        const stored = localStorage.getItem("lang");
        return stored === "it" ? "it" : "en";
    });
    const T = useMemo(() => createT(lang), [lang]);

    // theme (light/dark/auto)
    const [themePreference, setThemePreference] = useState<ThemePreference>(
        () => {
            if (!hasWindow) return "auto";
            const pref = localStorage.getItem("theme_preference");
            if (pref === "light" || pref === "dark" || pref === "auto")
                return pref;
            const legacy = localStorage.getItem("theme");
            if (legacy === "light" || legacy === "dark") return legacy;
            return "auto";
        },
    );
    const [systemPrefersDark, setSystemPrefersDark] = useState(
        () =>
            hasWindow &&
            window.matchMedia &&
            window.matchMedia("(prefers-color-scheme: dark)").matches,
    );
    const theme =
        themePreference === "auto"
            ? systemPrefersDark
                ? "dark"
                : "light"
            : themePreference;

    useEffect(() => {
        if (!hasWindow || !window.matchMedia) return undefined;
        const mq = window.matchMedia("(prefers-color-scheme: dark)");
        const onChange = (event: MediaQueryListEvent) =>
            setSystemPrefersDark(event.matches);
        if (mq.addEventListener) mq.addEventListener("change", onChange);
        else mq.addListener(onChange);
        return () => {
            if (mq.removeEventListener)
                mq.removeEventListener("change", onChange);
            else mq.removeListener(onChange);
        };
    }, []);

    // Hydrate the persisted language on mount (the initializer ran with the
    // server default of "en").
    useEffect(() => {
        const stored = localStorage.getItem("lang");
        if (stored === "it" || stored === "en") setLang(stored);
    }, []);

    useEffect(() => {
        const onStorage = (event: StorageEvent) => {
            if (event.key !== "theme_preference" && event.key !== "theme")
                return;
            const value = event.newValue;
            if (value === "light" || value === "dark" || value === "auto") {
                setThemePreference(value);
            }
        };
        window.addEventListener("storage", onStorage);
        return () => window.removeEventListener("storage", onStorage);
    }, []);

    useEffect(() => {
        document.documentElement.dataset.theme = theme;
        localStorage.setItem("theme_preference", themePreference);
        // Keep the status bar on the active canvas color (E2 light / E3 dark).
        const canvas = theme === "dark" ? "#06101e" : "#f4f8ff";
        document
            .querySelectorAll('meta[name="theme-color"]')
            .forEach((meta) => meta.setAttribute("content", canvas));
    }, [theme, themePreference]);

    const setTheme = useCallback((t: ThemePreference) => {
        if (t === "light" || t === "dark" || t === "auto")
            setThemePreference(t);
    }, []);
    const toggleTheme = useCallback(
        () =>
            setThemePreference((t) => {
                if (t === "auto") return systemPrefersDark ? "light" : "dark";
                return t === "dark" ? "light" : "dark";
            }),
        [systemPrefersDark],
    );
    const MONTHS = useMemo(
        () => Array.from({ length: 12 }, (_, i) => T(`month_${i + 1}`)),
        [T],
    );

    const persistLang = useCallback((next: Language) => {
        setLang(next);
        if (hasWindow) localStorage.setItem("lang", next);
    }, []);

    return {
        lang,
        setLang: persistLang,
        T,
        theme,
        themePreference,
        setTheme,
        toggleTheme,
        MONTHS,
    };
}

export type ThemeController = ReturnType<typeof useThemeLang>;
