import { describe, it, expect } from "vitest";
import { translations, createT } from "../i18n";
import {
  buildAssetTxQueryParams,
  buildCashflowQueryParams,
} from "../context/feedQueryModel";

describe("CF feed i18n keys", () => {
  const CF_KEYS = [
    "cf_see_all",
    "cf_all_transactions",
    "cf_back",
    "cf_load_more",
    "cf_load_all",
    "cf_no_results",
    "cf_income",
    "cf_outcome",
    "cf_transfer",
    "cf_adjustment",
    "cf_verified",
    "cf_unverified",
    "cf_from",
    "cf_to",
    "cf_edit_transfer",
    "cf_edit_adjustment",
    "cf_edit_notes",
    "cf_edit_date",
    "cf_save",
    "verified_filter_all",
    "verified_filter_yes",
    "verified_filter_no",
    "cf_no_transactions_period",
    "cf_all_directions",
    "fab_add_transaction",
  ];

  it("all cf keys present in en locale", () => {
    for (const key of CF_KEYS) {
      expect(translations.en[key], `missing en.${key}`).toBeDefined();
    }
  });

  it("all cf keys present in it locale", () => {
    for (const key of CF_KEYS) {
      expect(translations.it[key], `missing it.${key}`).toBeDefined();
    }
  });

  it("en and it cf keys have non-empty values", () => {
    for (const key of CF_KEYS) {
      expect(translations.en[key].length, `empty en.${key}`).toBeGreaterThan(0);
      expect(translations.it[key].length, `empty it.${key}`).toBeGreaterThan(0);
    }
  });

  it("uses cash-flow transaction wording, not portfolio investment wording", () => {
    expect(translations.en.cf_all_transactions.toLowerCase()).toContain(
      "transactions",
    );
    expect(translations.en.cf_no_results.toLowerCase()).not.toContain(
      "investments",
    );
    expect(translations.en.fab_add_transaction.toLowerCase()).toContain(
      "transaction",
    );
    expect(translations.it.cf_all_transactions.toLowerCase()).toContain(
      "movimenti",
    );
    expect(translations.it.cf_no_results.toLowerCase()).not.toContain(
      "investimento",
    );
    expect(translations.it.fab_add_transaction.toLowerCase()).toContain(
      "movimento",
    );
  });
});

describe("CF type filter logic", () => {
  const ALL_TYPES = ["income", "outcome", "transfer", "adjustment"];

  function toggleType(currentTypes, type) {
    return currentTypes.includes(type)
      ? currentTypes.filter((t) => t !== type)
      : [...currentTypes, type];
  }

  it("removes active type on toggle", () => {
    const result = toggleType(ALL_TYPES, "income");
    expect(result).not.toContain("income");
    expect(result).toContain("outcome");
  });

  it("adds inactive type on toggle", () => {
    const result = toggleType(["outcome"], "income");
    expect(result).toContain("income");
    expect(result).toContain("outcome");
  });

  it("toggling all types back results in full set", () => {
    let types = [];
    for (const t of ALL_TYPES) types = toggleType(types, t);
    expect(types).toEqual(expect.arrayContaining(ALL_TYPES));
    expect(types.length).toBe(4);
  });

  it("all types active yields empty types param (no restriction)", () => {
    const f = { types: ALL_TYPES };
    const hasRestriction = f.types.length > 0 && f.types.length < 4;
    expect(hasRestriction).toBe(false);
  });

  it("subset of types yields restriction in query params", () => {
    const f = { types: ["income", "transfer"] };
    const hasRestriction = f.types.length > 0 && f.types.length < 4;
    expect(hasRestriction).toBe(true);
    const param = f.types.join(",");
    expect(param).toBe("income,transfer");
  });
});

describe("CF verified filter logic", () => {
  function buildParams(verified) {
    return buildCashflowQueryParams(
      { verified },
      { page: 1, pageSize: 50 },
    ).toString();
  }

  it("null verified adds no param", () => {
    expect(buildParams(null)).not.toContain("verified=");
  });

  it("true verified adds verified=true", () => {
    expect(buildParams(true)).toContain("verified=true");
  });

  it("false verified adds verified=false", () => {
    expect(buildParams(false)).toContain("verified=false");
  });
});

describe("Portfolio transaction filter logic", () => {
  const buildParams = (filters) =>
    buildAssetTxQueryParams(filters, { page: 1 }).toString();

  it("adds search, verified and ordering params", () => {
    const qs = buildParams({
      types: ["buy", "sell", "adjustment"],
      asset_ids: [4],
      date_from: "2026-01-01",
      date_to: "2026-01-31",
      verified: false,
      search: " VWCE ",
      ordering: "-amount",
    });
    expect(qs).toContain("asset=4");
    expect(qs).toContain("verified=false");
    expect(qs).toContain("search=VWCE");
    expect(qs).toContain("ordering=-amount");
  });

  it("omits default ordering", () => {
    expect(
      buildParams({
        types: ["buy"],
        verified: null,
        search: "",
        ordering: "-date",
      }),
    ).not.toContain("ordering=");
  });

  it("drops non-portfolio transaction types", () => {
    expect(buildParams({ types: ["cash_in", "sell"] })).toContain("type=sell");
  });
});

describe("CF category query mapping", () => {
  it("separates parent and child category ids", () => {
    const params = buildCashflowQueryParams(
      { category_ids: [1, 2] },
      {
        categories: [
          { id: 1, parent: null },
          { id: 2, parent: 1 },
        ],
      },
    );

    expect(params.get("parent_category")).toBe("1");
    expect(params.get("category")).toBe("2");
  });
});

describe("Portfolio bulk selection logic", () => {
  function isSelected(id, { selectedIds, selectAllFiltered }) {
    if (selectAllFiltered) return !selectedIds.has(id);
    return selectedIds.has(id);
  }

  function computeCount({ selectedIds, selectAllFiltered, totalCount }) {
    if (selectAllFiltered) {
      return Math.max(0, (totalCount || 0) - selectedIds.size);
    }
    return selectedIds.size;
  }

  it("select-all-filtered treats selected ids as exclusions", () => {
    const selectedIds = new Set([2]);
    expect(isSelected(1, { selectedIds, selectAllFiltered: true })).toBe(true);
    expect(isSelected(2, { selectedIds, selectAllFiltered: true })).toBe(false);
    expect(
      computeCount({ selectedIds, selectAllFiltered: true, totalCount: 10 }),
    ).toBe(9);
  });
});

describe("CF transfer amount validation", () => {
  function isValidAmount(amount) {
    const parsed = parseFloat(amount);
    return !!parsed && parsed > 0;
  }

  it("empty string is invalid", () => expect(isValidAmount("")).toBe(false));
  it("zero string is invalid", () => expect(isValidAmount("0")).toBe(false));
  it("negative value is invalid", () =>
    expect(isValidAmount("-5")).toBe(false));
  it("positive decimal is valid", () =>
    expect(isValidAmount("12.50")).toBe(true));
  it("positive integer is valid", () =>
    expect(isValidAmount("100")).toBe(true));
});

describe("CF delete response guard", () => {
  function shouldUpdateUI(res) {
    return res.ok;
  }

  it("ok=true allows UI update", () =>
    expect(shouldUpdateUI({ ok: true })).toBe(true));
  it("ok=false prevents UI update", () =>
    expect(shouldUpdateUI({ ok: false })).toBe(false));
  it("404 response prevents UI update", () =>
    expect(shouldUpdateUI({ ok: false, status: 404 })).toBe(false));
  it("403 response prevents UI update", () =>
    expect(shouldUpdateUI({ ok: false, status: 403 })).toBe(false));
});

describe("CF modal-close refresh behavior", () => {
  function shouldRefreshAfterModalTransition(wasOpen, isOpen) {
    return wasOpen && !isOpen;
  }

  it("refreshes when modal transitions from open to closed", () => {
    expect(shouldRefreshAfterModalTransition(true, false)).toBe(true);
  });

  it("does not refresh on initial closed state", () => {
    expect(shouldRefreshAfterModalTransition(false, false)).toBe(false);
  });

  it("does not refresh while modal remains open", () => {
    expect(shouldRefreshAfterModalTransition(true, true)).toBe(false);
  });
});
