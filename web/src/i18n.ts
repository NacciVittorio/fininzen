import en from "./i18n/en";
import it from "./i18n/it";
import type { Translator } from "./types";

export const translations = { en, it };
export type Language = keyof typeof translations;

export const createT =
    (lang: Language): Translator =>
    (key, fallback) =>
        translations[lang]?.[key] ?? fallback ?? key;
