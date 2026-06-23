import en from "./en";
import it from "./it";
import type { Translator } from "../types";

export const translations = { en, it };
export type Language = keyof typeof translations;

export const createT =
    (lang: Language): Translator =>
    (key, fallback) =>
        translations[lang]?.[key] ?? fallback ?? key;
