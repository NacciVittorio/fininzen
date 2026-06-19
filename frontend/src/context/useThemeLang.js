import { useState, useEffect, useMemo, useCallback } from "react";
import { createT } from "../i18n";

/**
 * Stato di lingua (i18n) e tema (light/dark/auto) — estratto da AppContext.jsx
 * (HIGH-30). È un concern autonomo: dipende solo da localStorage, matchMedia e
 * document, non da altro stato del provider. Restituisce esattamente i valori
 * che il provider espone nel context, così la superficie pubblica resta
 * invariata.
 */
export function useThemeLang() {
  // i18n
  const [lang, setLang] = useState(() => {
    const stored = localStorage.getItem("lang");
    return ["en", "it"].includes(stored) ? stored : "en";
  });
  const T = useMemo(() => createT(lang), [lang]);

  // theme (light/dark/auto)
  const [themePreference, setThemePreference] = useState(() => {
    const pref = localStorage.getItem("theme_preference");
    if (pref === "light" || pref === "dark" || pref === "auto") return pref;
    const legacy = localStorage.getItem("theme");
    if (legacy === "light" || legacy === "dark") return legacy;
    return "auto";
  });
  const [systemPrefersDark, setSystemPrefersDark] = useState(
    () =>
      typeof window !== "undefined" &&
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
    if (typeof window === "undefined" || !window.matchMedia) return undefined;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (e) => setSystemPrefersDark(e.matches);
    if (mq.addEventListener) mq.addEventListener("change", onChange);
    else mq.addListener(onChange);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener("change", onChange);
      else mq.removeListener(onChange);
    };
  }, []);

  useEffect(() => {
    const onStorage = (event) => {
      if (event.key !== "theme_preference" && event.key !== "theme") return;
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
    // index.html ships a prefers-color-scheme pair; the manual override
    // rewrites both so Safari picks the right one in every mode.
    const canvas = theme === "dark" ? "#06101e" : "#f4f8ff";
    document
      .querySelectorAll('meta[name="theme-color"]')
      .forEach((meta) => meta.setAttribute("content", canvas));
  }, [theme, themePreference]);
  const setTheme = useCallback((t) => {
    if (t === "light" || t === "dark" || t === "auto") setThemePreference(t);
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
    [lang],
  );

  return {
    lang,
    setLang,
    T,
    theme,
    themePreference,
    setTheme,
    toggleTheme,
    MONTHS,
  };
}
