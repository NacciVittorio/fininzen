import { describe, it, expect } from "vitest";
import { translations } from "../i18n";

describe("CF bulk i18n keys", () => {
  const BULK_KEYS = [
    "cf_bulk_select",
    "cf_bulk_done",
    "cf_bulk_selected_count",
    "cf_bulk_select_visible",
    "cf_bulk_select_all_filtered",
    "cf_bulk_clear_selection",
    "cf_bulk_verify",
    "cf_bulk_unverify",
    "cf_bulk_edit",
    "cf_bulk_delete",
    "cf_bulk_edit_title",
    "cf_bulk_delete_title",
    "cf_bulk_field_date",
    "cf_bulk_field_verified",
    "cf_bulk_field_description",
    "cf_bulk_field_category",
    "cf_bulk_field_linked_asset",
    "cf_bulk_field_notes",
    "cf_bulk_preview_summary",
    "cf_bulk_delete_summary",
    "cf_bulk_apply",
    "cf_bulk_confirm_delete",
    "cf_bulk_mixed_types_warning",
    "cf_bulk_mixed_direction_warning",
    "cf_bulk_no_selection",
    "cf_bulk_missing_rows",
    // K-3.8 — new keys for the checkbox-enables-field modal redesign.
    "cf_bulk_clear_value",
    "cf_bulk_clear_value_aria",
    "cf_bulk_undo_clear_aria",
    "cf_bulk_preview_live",
    "cf_bulk_preview_calculating",
    "cf_bulk_applying",
    "cf_bulk_more_actions",
    "cf_bulk_no_changes_yet",
    "cf_bulk_rejected_rows",
    "cf_bulk_rejected_show",
    "cf_bulk_select_mode_visible",
    "cf_bulk_select_mode_filtered",
    "cf_bulk_err_category_direction_mismatch",
    "cf_bulk_err_account_not_bank",
    "cf_bulk_err_invalid_date",
    "cf_bulk_err_refresh_failed",
    "cf_bulk_err_empty_patch",
    "cf_bulk_err_filtered_too_large",
    "cf_bulk_err_generic",
    // Iter 2 — keep/clear modal + kind gating.
    "cf_bulk_keep_value",
    "cf_bulk_remove_value_btn",
    "cf_bulk_keep_placeholder",
    "cf_bulk_kind_mismatch_toast",
    "cf_bulk_adjustment_locked",
    "cf_bulk_filter_to_select_all",
    "cf_bulk_field_from_account",
    "cf_bulk_field_to_account",
    "cf_bulk_kind_income",
    "cf_bulk_kind_outcome",
    "cf_bulk_kind_transfer",
    "cf_bulk_kind_adjustment",
    "cf_bulk_edit_title_kind",
    "cf_bulk_verified_keep",
    "cf_bulk_err_mixed_kinds",
    "cf_bulk_err_adjustment_not_editable",
    "cf_bulk_err_same_account_transfer",
  ];

  it("all bulk keys present in en locale", () => {
    for (const key of BULK_KEYS) {
      expect(translations.en[key], `missing en.${key}`).toBeDefined();
      expect(translations.en[key].length).toBeGreaterThan(0);
    }
  });

  it("all bulk keys present in it locale", () => {
    for (const key of BULK_KEYS) {
      expect(translations.it[key], `missing it.${key}`).toBeDefined();
      expect(translations.it[key].length).toBeGreaterThan(0);
    }
  });

  it("interpolation placeholders survive in both locales", () => {
    expect(translations.en.cf_bulk_selected_count).toContain("{count}");
    expect(translations.it.cf_bulk_selected_count).toContain("{count}");
    expect(translations.en.cf_bulk_preview_summary).toContain("{count}");
    expect(translations.en.cf_bulk_preview_summary).toContain("{amount}");
    expect(translations.en.cf_bulk_clear_value_aria).toContain("{field}");
    expect(translations.it.cf_bulk_clear_value_aria).toContain("{field}");
  });
});

describe("CF bulk selection isSelected predicate", () => {
  // Mirror the AppContext predicate. With cfSelectAllFiltered=false the set
  // contains explicit picks. With cfSelectAllFiltered=true the set contains
  // exclusions (un-ticked rows) and everything else is selected.
  function isSelected(id, { selectedIds, selectAllFiltered }) {
    if (selectAllFiltered) return !selectedIds.has(id);
    return selectedIds.has(id);
  }

  it("explicit selection: only ids in the set are selected", () => {
    const sel = new Set(["expense_1", "transfer_2"]);
    expect(
      isSelected("expense_1", { selectedIds: sel, selectAllFiltered: false }),
    ).toBe(true);
    expect(
      isSelected("expense_3", { selectedIds: sel, selectAllFiltered: false }),
    ).toBe(false);
  });

  it("select-all-filtered: ids NOT in the exclusion set are selected", () => {
    const sel = new Set(["expense_42"]);
    expect(
      isSelected("expense_42", { selectedIds: sel, selectAllFiltered: true }),
    ).toBe(false);
    expect(
      isSelected("expense_1", { selectedIds: sel, selectAllFiltered: true }),
    ).toBe(true);
  });
});

describe("CF bulk selection count derivation", () => {
  function computeCount({ selectedIds, selectAllFiltered, totalCount }) {
    if (selectAllFiltered) {
      return Math.max(0, (totalCount || 0) - selectedIds.size);
    }
    return selectedIds.size;
  }

  it("explicit selection count equals set size", () => {
    expect(
      computeCount({
        selectedIds: new Set(["a", "b", "c"]),
        selectAllFiltered: false,
        totalCount: 10,
      }),
    ).toBe(3);
  });

  it("select-all-filtered count subtracts exclusions from total", () => {
    expect(
      computeCount({
        selectedIds: new Set(["a", "b"]),
        selectAllFiltered: true,
        totalCount: 10,
      }),
    ).toBe(8);
  });

  it("select-all-filtered never goes negative", () => {
    expect(
      computeCount({
        selectedIds: new Set(Array.from({ length: 20 }, (_, i) => `e_${i}`)),
        selectAllFiltered: true,
        totalCount: 10,
      }),
    ).toBe(0);
  });
});

describe("CF bulk selectionTypes derivation", () => {
  // Same logic as the useMemo in ExpensesView: from the loaded items plus the
  // current selection, decide which patch fields are universal vs disabled.
  function deriveTypes({
    selectionMode,
    selectAllFiltered,
    filterTypes,
    items,
    isSelected,
  }) {
    if (!selectionMode)
      return { expense: false, transfer: false, adjustment: false };
    if (selectAllFiltered) {
      const t = filterTypes || [];
      return {
        expense: t.includes("income") || t.includes("outcome"),
        transfer: t.includes("transfer"),
        adjustment: t.includes("adjustment"),
      };
    }
    const out = { expense: false, transfer: false, adjustment: false };
    items.forEach((item) => {
      if (!isSelected(item.id)) return;
      const key = item.source_type === "expense" ? "expense" : item.source_type;
      out[key] = true;
    });
    return out;
  }

  const items = [
    { id: "expense_1", source_type: "expense" },
    { id: "transfer_2", source_type: "transfer" },
    { id: "adjustment_3", source_type: "asset_transaction" },
  ];

  it("all-filtered + types=[outcome] → only expense", () => {
    const t = deriveTypes({
      selectionMode: true,
      selectAllFiltered: true,
      filterTypes: ["outcome"],
      items: [],
      isSelected: () => false,
    });
    expect(t).toEqual({ expense: true, transfer: false, adjustment: false });
  });

  it("explicit selection picks only expense → expense flag set", () => {
    const t = deriveTypes({
      selectionMode: true,
      selectAllFiltered: false,
      filterTypes: ["income", "outcome", "transfer", "adjustment"],
      items,
      isSelected: (id) => id === "expense_1",
    });
    expect(t.expense).toBe(true);
    expect(t.transfer).toBe(false);
  });

  it("explicit selection across types yields mixed flags", () => {
    const t = deriveTypes({
      selectionMode: true,
      selectAllFiltered: false,
      filterTypes: ["income", "outcome", "transfer", "adjustment"],
      items,
      isSelected: () => true,
    });
    expect(t.expense).toBe(true);
    expect(t.transfer).toBe(true);
  });
});

describe("CF bulk patch builder (keep/clear model — Iter 2)", () => {
  // Mirror the patch builder in BulkEditModal after the Iter 2 redesign:
  //  - verified: "keep" | "on" | "off"     → omitted if "keep"
  //  - date: ""                              → omitted; non-empty sent verbatim
  //  - text fields: { value, cleared }      → omitted when value==="" && !cleared
  //  - id selects: "__keep__" | "__clear__" | id
  //                                          → __keep__ omitted, __clear__ → null
  const KEEP = "__keep__";
  const CLEAR = "__clear__";
  function selectIdFromState(value) {
    if (value === KEEP) return undefined;
    if (value === CLEAR || value === "") return null;
    return Number(value);
  }
  function buildPatch(fields, kind) {
    const p = {};
    if (fields.verified === "on") p.is_verified = true;
    if (fields.verified === "off") p.is_verified = false;
    if (fields.date) p.date = fields.date;

    const isExpense = kind === "income" || kind === "outcome";
    const isTransfer = kind === "transfer";

    if (isExpense) {
      if (fields.description?.cleared) p.description = "";
      else if (fields.description?.value !== "" && fields.description)
        p.description = fields.description.value;
      const cat = selectIdFromState(fields.category ?? KEEP);
      if (cat !== undefined) p.category_id = cat;
      const acc = selectIdFromState(fields.account ?? KEEP);
      if (acc !== undefined) p.linked_asset_id = acc;
    }
    if (isTransfer) {
      if (fields.notes?.cleared) p.notes = "";
      else if (fields.notes?.value !== "" && fields.notes)
        p.notes = fields.notes.value;
      const from = selectIdFromState(fields.from_account ?? KEEP);
      if (from !== undefined) p.from_account_id = from;
      const to = selectIdFromState(fields.to_account ?? KEEP);
      if (to !== undefined) p.to_account_id = to;
    }
    return p;
  }

  it("everything 'keep' produces an empty patch", () => {
    const p = buildPatch({ verified: "keep", date: "" }, "outcome");
    expect(p).toEqual({});
  });

  it("verify on / off emits is_verified", () => {
    expect(buildPatch({ verified: "on" }, "outcome")).toEqual({
      is_verified: true,
    });
    expect(buildPatch({ verified: "off" }, "outcome")).toEqual({
      is_verified: false,
    });
  });

  it("non-empty date is forwarded", () => {
    expect(
      buildPatch({ verified: "keep", date: "2026-06-01" }, "outcome"),
    ).toEqual({
      date: "2026-06-01",
    });
  });

  it("category __keep__ omits the field", () => {
    expect(
      buildPatch(
        { verified: "keep", date: "", category: "__keep__" },
        "outcome",
      ),
    ).toEqual({});
  });

  it("category __clear__ sends null", () => {
    expect(
      buildPatch(
        { verified: "keep", date: "", category: "__clear__" },
        "outcome",
      ),
    ).toEqual({ category_id: null });
  });

  it("concrete category id sends Number", () => {
    expect(
      buildPatch({ verified: "keep", date: "", category: "5" }, "outcome"),
    ).toEqual({ category_id: 5 });
  });

  it("text cleared sends empty string; plain typed value sent verbatim", () => {
    expect(
      buildPatch(
        {
          verified: "keep",
          date: "",
          description: { value: "old", cleared: true },
        },
        "outcome",
      ).description,
    ).toBe("");
    expect(
      buildPatch(
        {
          verified: "keep",
          date: "",
          description: { value: "new", cleared: false },
        },
        "outcome",
      ).description,
    ).toBe("new");
  });

  it("expense fields are not emitted for transfer kind", () => {
    const p = buildPatch(
      { verified: "keep", date: "", category: "5" },
      "transfer",
    );
    expect(p).toEqual({});
  });

  it("transfer kind emits from_account_id and to_account_id", () => {
    const p = buildPatch(
      {
        verified: "keep",
        date: "",
        from_account: "1",
        to_account: "__clear__",
      },
      "transfer",
    );
    expect(p).toEqual({ from_account_id: 1, to_account_id: null });
  });
});

describe("CF bulk selection kind gating", () => {
  // Mirror AppContext.toggleCfItemSelected: the first add locks the kind; a
  // mismatched add bumps the rejection tick and is ignored.
  function makeReducer() {
    return { ids: new Set(), kind: null, tick: 0 };
  }
  function toggle(state, id, itemType) {
    if (state.ids.has(id)) {
      const next = new Set(state.ids);
      next.delete(id);
      const kind = next.size === 0 ? null : state.kind;
      return { ...state, ids: next, kind };
    }
    if (state.kind && itemType && state.kind !== itemType) {
      return { ...state, tick: state.tick + 1 };
    }
    const next = new Set(state.ids);
    next.add(id);
    return {
      ...state,
      ids: next,
      kind: state.kind || itemType,
    };
  }

  it("first added row locks the kind", () => {
    let s = makeReducer();
    s = toggle(s, "expense_1", "outcome");
    expect(s.kind).toBe("outcome");
    expect(s.ids.has("expense_1")).toBe(true);
  });

  it("mismatched kind is rejected; tick bumps; set unchanged", () => {
    let s = makeReducer();
    s = toggle(s, "expense_1", "outcome");
    const before = s.tick;
    s = toggle(s, "expense_2", "income");
    expect(s.ids.has("expense_2")).toBe(false);
    expect(s.tick).toBe(before + 1);
    expect(s.kind).toBe("outcome");
  });

  it("removing the last row unlocks the kind", () => {
    let s = makeReducer();
    s = toggle(s, "expense_1", "outcome");
    s = toggle(s, "expense_1", "outcome");
    expect(s.ids.size).toBe(0);
    expect(s.kind).toBeNull();
  });

  it("adjustment can coexist with adjustments only", () => {
    let s = makeReducer();
    s = toggle(s, "adjustment_1", "adjustment");
    s = toggle(s, "adjustment_2", "adjustment");
    expect(s.kind).toBe("adjustment");
    expect(s.ids.size).toBe(2);
    const before = s.tick;
    s = toggle(s, "transfer_1", "transfer");
    expect(s.tick).toBe(before + 1);
    expect(s.ids.has("transfer_1")).toBe(false);
  });
});

describe("CF bulk error code mapping", () => {
  // Mirror AppContext.formatCfBulkError — backend returns an `error_codes`
  // list, frontend renders the corresponding i18n string. Codes without a
  // mapping fall back to errors[] or a generic message.
  const codeKeys = {
    asset_refresh_failed: "cf_bulk_err_refresh_failed",
    category_direction_mismatch: "cf_bulk_err_category_direction_mismatch",
    account_not_bank: "cf_bulk_err_account_not_bank",
    invalid_date: "cf_bulk_err_invalid_date",
    empty_patch: "cf_bulk_err_empty_patch",
    filtered_too_large: "cf_bulk_err_filtered_too_large",
    mixed_kinds: "cf_bulk_err_mixed_kinds",
    adjustment_not_editable: "cf_bulk_err_adjustment_not_editable",
    same_account_transfer: "cf_bulk_err_same_account_transfer",
  };

  function format(data, T) {
    const codes = Array.isArray(data?.error_codes) ? data.error_codes : [];
    const localized = codes
      .map((c) => codeKeys[c])
      .filter(Boolean)
      .map((k) => T(k));
    if (localized.length > 0) return localized.join(" ");
    if (Array.isArray(data?.errors) && data.errors.length > 0) {
      return data.errors.join(", ");
    }
    return T("cf_bulk_err_generic");
  }

  const T = (k) => translations.it[k] || k;

  it("maps known code to its localized message", () => {
    const msg = format({ error_codes: ["asset_refresh_failed"] }, T);
    expect(msg).toBe(translations.it.cf_bulk_err_refresh_failed);
  });

  it("joins multiple codes with a space", () => {
    const msg = format({ error_codes: ["invalid_date", "empty_patch"] }, T);
    expect(msg).toContain(translations.it.cf_bulk_err_invalid_date);
    expect(msg).toContain(translations.it.cf_bulk_err_empty_patch);
  });

  it("falls back to errors[] when no codes are known", () => {
    const msg = format(
      { error_codes: ["unknown_code_xyz"], errors: ["raw message"] },
      T,
    );
    expect(msg).toBe("raw message");
  });

  it("falls back to generic when nothing is provided", () => {
    const msg = format({}, T);
    expect(msg).toBe(translations.it.cf_bulk_err_generic);
  });
});
