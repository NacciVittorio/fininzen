"use client";

import type { Dispatch, SetStateAction } from "react";
import CategorySelect from "../../components/CategorySelect";
import { getCsvImportFields } from "./csvImportConfig";
import type { CsvImportType, CsvMapping } from "./csvImportConfig";
import type { Category } from "../../api/types";
import type { CsvImportResponse } from "../../context/useImportAndTicker";
import type { ParsedCsv } from "../../utils/formatters";
import type { Translator } from "../../types";

type CsvSignConv = "neg" | "pos";

export function CsvColumnMappingCard({
    T,
    categories,
    csvParsed,
    csvImportType,
    csvMap,
    setCsvMap,
    csvSignConv,
    setCsvSignConv,
    setCsvImportPreview,
}: {
    T: Translator;
    categories: readonly Category[];
    csvParsed: ParsedCsv | null;
    csvImportType: CsvImportType;
    csvMap: CsvMapping;
    setCsvMap: Dispatch<SetStateAction<CsvMapping>>;
    csvSignConv: CsvSignConv;
    setCsvSignConv: Dispatch<SetStateAction<CsvSignConv>>;
    setCsvImportPreview: Dispatch<SetStateAction<CsvImportResponse | null>>;
}) {
    if (!csvParsed) return null;

    const schemas = getCsvImportFields(T);
    const fields = schemas[csvImportType] || schemas.cashflow;

    return (
        <div className="card">
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>
                {T("column_mapping")}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {fields.map(({ field, label, required }) => (
                    <div key={field}>
                        <div
                            style={{
                                fontSize: 12,
                                color: "var(--fg-soft)",
                                marginBottom: 4,
                            }}
                        >
                            {label}
                            {required ? " *" : ""}
                        </div>
                        <select
                            className="inp"
                            value={csvMap[field] || ""}
                            onChange={(e) => {
                                setCsvMap((prev) => ({
                                    ...prev,
                                    [field]: e.target.value,
                                }));
                                setCsvImportPreview(null);
                            }}
                        >
                            <option value="">{T("not_mapped")}</option>
                            {csvParsed.headers.map((header) => (
                                <option key={header} value={header}>
                                    {header}
                                </option>
                            ))}
                        </select>
                    </div>
                ))}

                {csvImportType === "cashflow" && (
                    <CashflowFallbackCategories
                        T={T}
                        categories={categories}
                        csvMap={csvMap}
                        setCsvMap={setCsvMap}
                        setCsvImportPreview={setCsvImportPreview}
                    />
                )}
            </div>

            {csvImportType === "cashflow" && (
                <div style={{ marginTop: 14 }}>
                    <div
                        style={{
                            fontSize: 12,
                            color: "var(--fg-soft)",
                            marginBottom: 8,
                        }}
                    >
                        {T("sign_convention")}
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                        {(
                            [
                                ["neg", T("sign_neg_expense")],
                                ["pos", T("sign_pos_expense")],
                            ] as [CsvSignConv, string][]
                        ).map(([val, label]) => (
                            <button
                                key={val}
                                onClick={() => setCsvSignConv(val)}
                                style={{
                                    flex: 1,
                                    padding: "8px 12px",
                                    borderRadius: 8,
                                    cursor: "pointer",
                                    border: "1px solid",
                                    fontFamily: "inherit",
                                    fontSize: 12,
                                    fontWeight: 500,
                                    transition: "all 0.15s",
                                    background:
                                        csvSignConv === val
                                            ? "var(--accent-ring)"
                                            : "var(--card-inset)",
                                    color:
                                        csvSignConv === val
                                            ? "var(--accent)"
                                            : "var(--fg-soft)",
                                    borderColor:
                                        csvSignConv === val
                                            ? "var(--accent-ring)"
                                            : "var(--rule)",
                                }}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

function CashflowFallbackCategories({
    T,
    categories,
    csvMap,
    setCsvMap,
    setCsvImportPreview,
}: {
    T: Translator;
    categories: readonly Category[];
    csvMap: CsvMapping;
    setCsvMap: Dispatch<SetStateAction<CsvMapping>>;
    setCsvImportPreview: Dispatch<SetStateAction<CsvImportResponse | null>>;
}) {
    const updateFallbackCategory = (field: string, value: string) => {
        setCsvMap((prev) => ({ ...prev, [field]: value }));
        setCsvImportPreview(null);
    };

    return (
        <div>
            <div
                style={{
                    fontSize: 12,
                    color: "var(--fg-soft)",
                    marginBottom: 8,
                }}
            >
                {T("import_fallback_categories")}
            </div>
            <div
                style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                    gap: 10,
                }}
            >
                <div>
                    <div
                        style={{
                            fontSize: 12,
                            color: "var(--fg-soft)",
                            marginBottom: 4,
                        }}
                    >
                        {T("import_expense_fallback_category")}
                    </div>
                    <CategorySelect
                        value={csvMap.expense_category_id || ""}
                        onChange={(value) =>
                            updateFallbackCategory("expense_category_id", value)
                        }
                        categoryType="expense"
                        categories={categories}
                        placeholder={T("not_mapped")}
                        usePortal
                    />
                </div>
                <div>
                    <div
                        style={{
                            fontSize: 12,
                            color: "var(--fg-soft)",
                            marginBottom: 4,
                        }}
                    >
                        {T("import_income_fallback_category")}
                    </div>
                    <CategorySelect
                        value={csvMap.income_category_id || ""}
                        onChange={(value) =>
                            updateFallbackCategory("income_category_id", value)
                        }
                        categoryType="income"
                        categories={categories}
                        placeholder={T("not_mapped")}
                        usePortal
                    />
                </div>
            </div>
        </div>
    );
}
