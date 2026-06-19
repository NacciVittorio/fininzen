import { useEffect, useMemo, useReducer, useState } from "react";
import Modal from "./Modal";
import CategorySelect from "./CategorySelect";
import Icon from "./ui/Icons";
import { SegmentedControl } from "./ui";
import { useApp } from "../context/useApp";
import { useFormatters } from "../utils/useFormatters";

function format(template, vars) {
  return Object.entries(vars || {}).reduce(
    (acc, [k, v]) => acc.replace(`{${k}}`, String(v)),
    template,
  );
}

/**
 * Bulk-edit modal — Iter 2 design.
 *
 * Pattern "Mantieni" instead of checkbox-enables-field: each select has
 * `— Mantieni —` as the default option (omits the field from the patch).
 * Text fields use an empty placeholder for "keep" plus an explicit
 * `[🗑 Rimuovi valore]` button that swaps the input for a "— Rimuovi —" pill
 * so the user can distinguish "leave alone" from "explicitly clear".
 *
 * Field availability is driven by `cfSelectionKind` from the context:
 *   - income / outcome (Expense)  →  date, description, category, account
 *   - transfer                    →  date, notes, from_account, to_account
 *   - adjustment                  →  modal does not open (toolbar omits Edit)
 *
 * Verify lives in a 3-state SegmentedControl (Mantieni / ✓ / ○).
 */

const KEEP = "__keep__";
const CLEAR = "__clear__";

const initialState = () => ({
  verified: "keep", // "keep" | "on" | "off"
  date: "", // "" = keep
  description: { value: "", cleared: false },
  notes: { value: "", cleared: false },
  category: KEEP,
  account: KEEP,
  from_account: KEEP,
  to_account: KEEP,
});

function reducer(state, action) {
  switch (action.type) {
    case "SET":
      return { ...state, [action.field]: action.value };
    case "SET_TEXT_VALUE":
      return {
        ...state,
        [action.field]: { value: action.value, cleared: false },
      };
    case "TOGGLE_TEXT_CLEARED":
      return {
        ...state,
        [action.field]: {
          value: state[action.field].value,
          cleared: !state[action.field].cleared,
        },
      };
    default:
      return state;
  }
}

const FIELD_ERROR_MAP = {
  category_direction_mismatch: "category",
  category_not_found: "category",
  invalid_category: "category",
  account_not_bank: "account",
  invalid_account: "account",
  invalid_date: "date",
  same_account_transfer: "to_account",
};

function selectIdFromState(value) {
  // "__keep__" → omit; "__clear__" → null; "" → null; numeric string → Number.
  if (value === KEEP) return undefined;
  if (value === CLEAR || value === "") return null;
  return Number(value);
}

export default function BulkEditModal({ onClose }) {
  const {
    T,
    categories,
    bankAccounts,
    cfBulkLoading,
    cfBulkError,
    cfBulkPreview,
    runCfBulkPreview,
    applyCfBulk,
    cfSelectedCount,
    cfSelectionKind,
    setCfBulkError,
    setCfBulkPreview,
  } = useApp();
  const { formatEur } = useFormatters();

  const [fields, dispatch] = useReducer(reducer, undefined, initialState);
  const [isApplying, setIsApplying] = useState(false);

  useEffect(() => {
    setCfBulkPreview(null);
    setCfBulkError(null);
    return () => {
      setCfBulkPreview(null);
      setCfBulkError(null);
    };
  }, [setCfBulkPreview, setCfBulkError]);

  const isExpenseKind =
    cfSelectionKind === "income" || cfSelectionKind === "outcome";
  const isTransfer = cfSelectionKind === "transfer";

  const patch = useMemo(() => {
    const p = {};
    if (fields.verified === "on") p.is_verified = true;
    if (fields.verified === "off") p.is_verified = false;
    if (fields.date) p.date = fields.date;

    if (isExpenseKind) {
      if (fields.description.cleared) p.description = "";
      else if (fields.description.value !== "")
        p.description = fields.description.value;

      const cat = selectIdFromState(fields.category);
      if (cat !== undefined) p.category_id = cat;

      const acc = selectIdFromState(fields.account);
      if (acc !== undefined) p.linked_asset_id = acc;
    }

    if (isTransfer) {
      if (fields.notes.cleared) p.notes = "";
      else if (fields.notes.value !== "") p.notes = fields.notes.value;

      const from = selectIdFromState(fields.from_account);
      if (from !== undefined) p.from_account_id = from;

      const to = selectIdFromState(fields.to_account);
      if (to !== undefined) p.to_account_id = to;
    }

    return p;
  }, [fields, isExpenseKind, isTransfer]);

  const hasAnyChange = Object.keys(patch).length > 0;

  // Live preview with debounce; the context AbortControllers the in-flight one.
  useEffect(() => {
    if (!hasAnyChange) return;
    const t = setTimeout(() => {
      runCfBulkPreview({ action: "edit", patch });
    }, 400);
    return () => clearTimeout(t);
  }, [patch, hasAnyChange, runCfBulkPreview]);

  const handleApply = async () => {
    if (!hasAnyChange || isApplying) return;
    setIsApplying(true);
    const result = await applyCfBulk({ action: "edit", patch });
    if (!result) setIsApplying(false);
  };

  const handleClose = () => {
    setCfBulkError(null);
    onClose();
  };

  const fieldErrors = useMemo(() => {
    const codes = Array.isArray(cfBulkPreview?.error_codes)
      ? cfBulkPreview.error_codes
      : [];
    const map = {};
    codes.forEach((code) => {
      const field = FIELD_ERROR_MAP[code];
      if (field) map[field] = code;
    });
    return map;
  }, [cfBulkPreview]);

  const previewOk = cfBulkPreview && cfBulkPreview.ok !== false;
  const rejectedRows =
    (cfBulkPreview && Array.isArray(cfBulkPreview.rejected_rows)
      ? cfBulkPreview.rejected_rows
      : []) || [];
  const previewMissingIds =
    (cfBulkPreview && Array.isArray(cfBulkPreview.missing_ids)
      ? cfBulkPreview.missing_ids
      : []) || [];

  const kindLabel = T(
    {
      income: "cf_bulk_kind_income",
      outcome: "cf_bulk_kind_outcome",
      transfer: "cf_bulk_kind_transfer",
    }[cfSelectionKind] || "cf_bulk_kind_outcome",
  );
  const title = format(T("cf_bulk_edit_title_kind"), {
    count: cfSelectedCount,
    kind: kindLabel,
  });

  return (
    <Modal title={title} onClose={handleClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <Field label={T("cf_bulk_field_verified")} error={fieldErrors.verified}>
          <SegmentedControl
            value={fields.verified}
            onChange={(v) =>
              dispatch({ type: "SET", field: "verified", value: v })
            }
            options={[
              { value: "keep", label: T("cf_bulk_verified_keep") },
              { value: "on", label: `✓ ${T("cf_verified")}` },
              { value: "off", label: `○ ${T("cf_unverified")}` },
            ]}
          />
        </Field>

        <Field label={T("cf_bulk_field_date")} error={fieldErrors.date}>
          <input
            type="date"
            className="inp"
            data-testid="cf-bulk-field-date"
            value={fields.date}
            onChange={(e) =>
              dispatch({ type: "SET", field: "date", value: e.target.value })
            }
          />
        </Field>

        {isExpenseKind && (
          <>
            <Field
              label={T("cf_bulk_field_description")}
              error={fieldErrors.description}
            >
              <TextOrClear
                fieldKey="description"
                state={fields.description}
                dispatch={dispatch}
                placeholder={T("cf_bulk_keep_placeholder")}
                T={T}
              />
            </Field>

            <Field
              label={T("cf_bulk_field_category")}
              error={fieldErrors.category}
            >
              <CategoryWithKeep
                value={fields.category}
                onChange={(v) =>
                  dispatch({ type: "SET", field: "category", value: v })
                }
                categories={categories}
                T={T}
              />
            </Field>

            <Field
              label={T("cf_bulk_field_linked_asset")}
              error={fieldErrors.account}
            >
              <SelectWithKeep
                fieldKey="account"
                value={fields.account}
                onChange={(v) =>
                  dispatch({ type: "SET", field: "account", value: v })
                }
                options={bankAccounts}
                placeholder={T("no_linked_account")}
                T={T}
              />
            </Field>
          </>
        )}

        {isTransfer && (
          <>
            <Field label={T("cf_bulk_field_notes")} error={fieldErrors.notes}>
              <TextOrClear
                fieldKey="notes"
                state={fields.notes}
                dispatch={dispatch}
                placeholder={T("cf_bulk_keep_placeholder")}
                T={T}
              />
            </Field>

            <Field
              label={T("cf_bulk_field_from_account")}
              error={fieldErrors.from_account}
            >
              <SelectWithKeep
                fieldKey="from_account"
                value={fields.from_account}
                onChange={(v) =>
                  dispatch({ type: "SET", field: "from_account", value: v })
                }
                options={bankAccounts}
                placeholder={T("cf_bulk_keep_value")}
                T={T}
              />
            </Field>

            <Field
              label={T("cf_bulk_field_to_account")}
              error={fieldErrors.to_account}
            >
              <SelectWithKeep
                fieldKey="to_account"
                value={fields.to_account}
                onChange={(v) =>
                  dispatch({ type: "SET", field: "to_account", value: v })
                }
                options={bankAccounts}
                placeholder={T("cf_bulk_keep_value")}
                T={T}
              />
            </Field>
          </>
        )}

        <PreviewPanel
          hasAnyChange={hasAnyChange}
          previewOk={previewOk}
          loading={cfBulkLoading}
          preview={cfBulkPreview}
          rejectedRows={rejectedRows}
          missingIds={previewMissingIds}
          formatEur={formatEur}
          T={T}
        />

        {cfBulkError && (
          <div
            role="alert"
            style={{
              color: "var(--danger)",
              background: "var(--danger-soft, rgba(220, 38, 38, 0.08))",
              border: "1px solid var(--danger)",
              borderRadius: 8,
              padding: "8px 10px",
              fontSize: 13,
            }}
          >
            {cfBulkError}
          </div>
        )}

        <div
          className="row"
          style={{ justifyContent: "flex-end", gap: 8, marginTop: 6 }}
        >
          <button
            className="btn btn-g"
            onClick={handleClose}
            disabled={cfBulkLoading || isApplying}
          >
            {T("btn_cancel")}
          </button>
          <button
            className="btn btn-p"
            data-testid="cf-bulk-edit-apply"
            onClick={handleApply}
            disabled={
              !hasAnyChange || cfBulkLoading || isApplying || !previewOk
            }
            aria-busy={isApplying}
          >
            {isApplying ? T("cf_bulk_applying") : T("cf_bulk_apply")}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ── Internal components ─────────────────────────────────────────────────────

function Field({ label, error, children }) {
  return (
    <div>
      <div
        style={{
          fontSize: 11,
          color: error ? "var(--danger)" : "var(--fg-soft)",
          marginBottom: 6,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: 0.2,
        }}
      >
        {label}
      </div>
      <div
        style={{
          borderRadius: 10,
          border: error ? "1px solid var(--danger)" : "1px solid transparent",
          background: error
            ? "var(--danger-soft, rgba(220, 38, 38, 0.06))"
            : "transparent",
          padding: error ? 8 : 0,
          transition: "border-color 0.15s, background 0.15s",
        }}
      >
        {children}
      </div>
    </div>
  );
}

function TextOrClear({ fieldKey, state, dispatch, placeholder, T }) {
  const { value, cleared } = state;
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "stretch" }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        {cleared ? (
          <div
            data-testid={`cf-bulk-field-cleared-${fieldKey}`}
            style={{
              background: "var(--card-inset, rgba(0,0,0,0.04))",
              border: "1px dashed var(--rule)",
              color: "var(--fg-soft)",
              padding: "10px 12px",
              borderRadius: 10,
              fontSize: 14,
              fontStyle: "italic",
            }}
          >
            {T("cf_bulk_clear_value")}
          </div>
        ) : (
          <input
            className="inp"
            data-testid={`cf-bulk-field-text-${fieldKey}`}
            value={value}
            onChange={(e) =>
              dispatch({
                type: "SET_TEXT_VALUE",
                field: fieldKey,
                value: e.target.value,
              })
            }
            placeholder={placeholder}
            style={{ fontStyle: value === "" ? "italic" : "normal" }}
          />
        )}
      </div>
      <button
        type="button"
        data-testid={`cf-bulk-field-remove-${fieldKey}`}
        onClick={() =>
          dispatch({ type: "TOGGLE_TEXT_CLEARED", field: fieldKey })
        }
        aria-pressed={cleared}
        title={T("cf_bulk_remove_value_btn")}
        style={{
          padding: "0 10px",
          borderRadius: 8,
          border: cleared ? "1px solid var(--accent)" : "1px solid var(--rule)",
          background: cleared ? "var(--accent-soft)" : "transparent",
          color: cleared ? "var(--accent-deep)" : "var(--fg-soft)",
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          fontFamily: "inherit",
          fontSize: 13,
          fontWeight: 600,
        }}
      >
        <Icon name="trash" size={14} aria-hidden="true" />
        <span>{T("cf_bulk_remove_value_btn")}</span>
      </button>
    </div>
  );
}

function SelectWithKeep({
  fieldKey,
  value,
  onChange,
  options,
  placeholder,
  T,
}) {
  return (
    <select
      className="inp"
      data-testid={`cf-bulk-field-select-${fieldKey}`}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value={KEEP}>{T("cf_bulk_keep_value")}</option>
      <option value={CLEAR}>{T("cf_bulk_clear_value")}</option>
      <option value="" disabled>
        ──────────
      </option>
      <option value="">{placeholder}</option>
      {options.map((opt) => (
        <option key={opt.id} value={opt.id}>
          {opt.name}
        </option>
      ))}
    </select>
  );
}

function CategoryWithKeep({ value, onChange, categories, T }) {
  // Keep / Clear / pick — implemented as two top-level pills that wrap the
  // existing CategorySelect (which doesn't itself know about Keep/Clear).
  // Selecting a concrete category from the dropdown moves the state to that
  // numeric id; the pills reflect that by visually deactivating.
  const isKeep = value === KEEP;
  const isClear = value === CLEAR;
  const concrete = !isKeep && !isClear ? value : "";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", gap: 6 }}>
        <button
          type="button"
          data-testid="cf-bulk-cat-keep"
          onClick={() => onChange(KEEP)}
          style={pillStyle(isKeep)}
        >
          {T("cf_bulk_keep_value")}
        </button>
        <button
          type="button"
          data-testid="cf-bulk-cat-clear"
          onClick={() => onChange(CLEAR)}
          style={pillStyle(isClear)}
        >
          {T("cf_bulk_clear_value")}
        </button>
      </div>
      {!isKeep && !isClear && (
        <CategorySelect
          value={concrete}
          onChange={(v) => onChange(v)}
          categoryType="all"
          placeholder={T("no_category")}
          categories={categories}
        />
      )}
      {(isKeep || isClear) && (
        <button
          type="button"
          data-testid="cf-bulk-cat-pick"
          onClick={() => onChange("")}
          style={{
            ...pillStyle(false),
            justifyContent: "space-between",
            color: "var(--fg-soft)",
          }}
        >
          <span>{T("cf_bulk_field_category")}…</span>
          <Icon name="chevronDown" size={14} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

function pillStyle(active) {
  return {
    flex: 1,
    padding: "8px 10px",
    borderRadius: 8,
    border: active ? "1px solid var(--accent)" : "1px solid var(--rule)",
    background: active ? "var(--accent-soft)" : "transparent",
    color: active ? "var(--accent-deep)" : "var(--fg)",
    cursor: "pointer",
    fontFamily: "inherit",
    fontSize: 13,
    fontWeight: active ? 700 : 500,
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
  };
}

function PreviewPanel({
  hasAnyChange,
  previewOk,
  loading,
  preview,
  rejectedRows,
  missingIds,
  formatEur,
  T,
}) {
  if (!hasAnyChange) {
    return (
      <div
        style={{
          padding: "10px 12px",
          background: "var(--card-inset)",
          borderRadius: 8,
          fontSize: 13,
          color: "var(--fg-soft)",
        }}
      >
        {T("cf_bulk_no_changes_yet")}
      </div>
    );
  }
  const total = preview?.total_selected ?? 0;
  const amount = preview?.total_amount ?? "0";
  return (
    <div
      aria-live="polite"
      data-testid="cf-bulk-preview-panel"
      style={{
        padding: "10px 12px",
        background: previewOk ? "var(--accent-soft)" : "var(--card-inset)",
        border: `1px solid ${previewOk ? "var(--accent)" : "var(--rule)"}`,
        borderRadius: 10,
        fontSize: 13,
        opacity: loading ? 0.7 : 1,
        transition: "opacity 0.2s",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          minHeight: 32,
        }}
      >
        <span
          style={{
            color: previewOk ? "var(--accent-deep)" : "var(--fg)",
            fontWeight: 600,
            minWidth: 0,
          }}
        >
          {previewOk
            ? format(T("cf_bulk_preview_summary"), {
                count: total,
                amount: formatEur(amount),
              })
            : T("cf_bulk_preview_live")}
        </span>
        <span
          aria-hidden={!loading}
          style={{
            flex: "0 0 auto",
            fontSize: 12,
            color: "var(--fg-soft)",
            textAlign: "right",
            visibility: loading ? "visible" : "hidden",
          }}
        >
          {T("cf_bulk_preview_calculating")}
        </span>
      </div>
      {rejectedRows.length > 0 && (
        <details
          data-testid="cf-bulk-preview-rejected"
          style={{ marginTop: 6, fontSize: 12, color: "var(--fg-soft)" }}
        >
          <summary
            style={{
              cursor: "pointer",
              color: "var(--danger)",
              fontWeight: 600,
            }}
          >
            {format(T("cf_bulk_rejected_rows"), {
              count: rejectedRows.length,
            })}{" "}
            · {T("cf_bulk_rejected_show")}
          </summary>
          <ul
            style={{
              margin: "6px 0 0 0",
              paddingLeft: 18,
              maxHeight: 120,
              overflowY: "auto",
            }}
          >
            {rejectedRows.slice(0, 50).map((r) => (
              <li key={r.id}>
                <code style={{ fontSize: 11 }}>{r.id}</code> — {r.reason}
              </li>
            ))}
            {rejectedRows.length > 50 && (
              <li style={{ fontStyle: "italic" }}>
                … +{rejectedRows.length - 50}
              </li>
            )}
          </ul>
        </details>
      )}
      {missingIds.length > 0 && (
        <div style={{ marginTop: 6, fontSize: 12, color: "var(--fg-soft)" }}>
          {format(T("cf_bulk_missing_rows"), { count: missingIds.length })}
        </div>
      )}
    </div>
  );
}
