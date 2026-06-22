import { describe, it, expect } from "vitest";
import enSource from "../i18n/en.ts?raw";
import itSource from "../i18n/it.ts?raw";
import { translations, createT } from "../i18n";

function duplicateKeysForLocale(source: string): string[] {
    const seen = new Set<string>();
    const duplicates: string[] = [];
    const re = /^\s*([A-Za-z0-9_]+):/gm;
    let match: RegExpExecArray | null;
    while ((match = re.exec(source))) {
        const key = match[1]!;
        if (seen.has(key)) duplicates.push(key);
        seen.add(key);
    }
    return duplicates;
}

describe("i18n", () => {
    it("exposes en and it locales", () => {
        expect(translations.en).toBeDefined();
        expect(translations.it).toBeDefined();
    });

    it("has parity between en and it keys", () => {
        const enKeys = new Set(Object.keys(translations.en));
        const itKeys = new Set(Object.keys(translations.it));
        const missingInIt = [...enKeys].filter((k) => !itKeys.has(k));
        const missingInEn = [...itKeys].filter((k) => !enKeys.has(k));
        expect(missingInIt).toEqual([]);
        expect(missingInEn).toEqual([]);
    });

    it("has no duplicate keys in locale source objects", () => {
        expect(duplicateKeysForLocale(enSource)).toEqual([]);
        expect(duplicateKeysForLocale(itSource)).toEqual([]);
    });

    it("createT returns value for known key and falls back to key for unknown", () => {
        const T = createT("en");
        expect(T("btn_edit")).toBe("Edit");
        expect(T("definitely_not_a_key")).toBe("definitely_not_a_key");
    });
});
