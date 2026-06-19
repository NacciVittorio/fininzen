import { useEffect, useMemo, useReducer, useState } from "react";
import Modal from "./Modal";
import { SegmentedControl } from "./ui";
import {
  CategoryWithKeep,
  Field,
  SelectWithKeep,
  TextOrClear,
} from "./bulkEdit/BulkEditFields";
import { BulkEditPreviewPanel } from "./bulkEdit/BulkEditPreviewPanel";
import {
  bulkEditReducer,
  FIELD_ERROR_MAP,
  formatBulkTemplate,
  initialBulkEditState,
  selectIdFromState,
} from "./bulkEdit/bulkEditModel";
import { useApp } from "../context/useApp";
import { useFormatters } from "../utils/useFormatters";

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

  const [fields, dispatch] = useReducer(
    bulkEditReducer,
    undefined,
    initialBulkEditState,
  );
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
  const title = formatBulkTemplate(T("cf_bulk_edit_title_kind"), {
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

        <BulkEditPreviewPanel
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
