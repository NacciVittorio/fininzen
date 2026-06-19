import { describe, it, expect } from "vitest";
import fs from "fs";
import { translations, createT } from "../i18n";

function duplicateKeysForLocale(source, lang) {
  const start = source.indexOf(`  ${lang}: {`);
  const end =
    lang === "en"
      ? source.indexOf("  it: {", start)
      : source.indexOf("};", start);
  const body = source.slice(start, end);
  const seen = new Set();
  const duplicates = [];
  const re = /^\s*([A-Za-z0-9_]+):/gm;
  let match;
  while ((match = re.exec(body))) {
    const key = match[1];
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
    const source = fs.readFileSync("src/i18n.js", "utf8");
    expect(duplicateKeysForLocale(source, "en")).toEqual([]);
    expect(duplicateKeysForLocale(source, "it")).toEqual([]);
  });

  it("createT returns value for known key and falls back to key for unknown", () => {
    const T = createT("en");
    expect(T("btn_edit")).toBe("Edit");
    expect(T("definitely_not_a_key")).toBe("definitely_not_a_key");
  });
});
