"use client";

import type { ComponentType, CSSProperties, Dispatch, ReactNode } from "react";
import CategorySelectRaw from "../CategorySelect";
import Icon from "../ui/Icons";

// CategorySelect is still .jsx; consume it as a loosely-typed component until
// it migrates, rather than coupling to its JS-inferred prop shape.
const CategorySelect = CategorySelectRaw as unknown as ComponentType<
    Record<string, unknown>
>;
import {
    CLEAR,
    KEEP,
    type BulkEditAction,
    type TextField,
} from "./bulkEditModel";

type T = (key: string, fallback?: string) => string;

type FieldProps = {
    label?: ReactNode;
    error?: string | boolean | null;
    children?: ReactNode;
};

export function Field({ label, error, children }: FieldProps) {
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
                    border: error
                        ? "1px solid var(--danger)"
                        : "1px solid transparent",
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

type TextOrClearProps = {
    fieldKey: TextField;
    state: { value: string; cleared: boolean };
    dispatch: Dispatch<BulkEditAction>;
    placeholder?: string;
    T: T;
};

export function TextOrClear({
    fieldKey,
    state,
    dispatch,
    placeholder,
    T,
}: TextOrClearProps) {
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
                        style={{
                            fontStyle: value === "" ? "italic" : "normal",
                        }}
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
                    border: cleared
                        ? "1px solid var(--accent)"
                        : "1px solid var(--rule)",
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

type SelectOption = { id: number | string; name: ReactNode };

type SelectWithKeepProps = {
    fieldKey: string;
    value: string;
    onChange: (value: string) => void;
    options: SelectOption[];
    placeholder?: ReactNode;
    T: T;
};

export function SelectWithKeep({
    fieldKey,
    value,
    onChange,
    options,
    placeholder,
    T,
}: SelectWithKeepProps) {
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
                {"──────────"}
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

type CategoryWithKeepProps = {
    value: string;
    onChange: (value: string) => void;
    categories?: unknown;
    T: T;
};

export function CategoryWithKeep({
    value,
    onChange,
    categories,
    T,
}: CategoryWithKeepProps) {
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
                    onChange={(v: string) => onChange(v)}
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
                    <span>
                        {T("cf_bulk_field_category")}
                        {"…"}
                    </span>
                    <Icon name="chevronDown" size={14} aria-hidden="true" />
                </button>
            )}
        </div>
    );
}

function pillStyle(active: boolean): CSSProperties {
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
