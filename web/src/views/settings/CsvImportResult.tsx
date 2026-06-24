"use client";

import type { ReactNode } from "react";
import type { CsvImportResult as CsvImportResultData } from "../../context/useImportAndTicker";
import type { Translator } from "../../types";

type ImportedRow = {
    row?: number | string;
    asset_id?: number | string;
    asset_name?: ReactNode;
    transaction_type?: ReactNode;
    date?: ReactNode;
    shares?: ReactNode;
    price_per_share?: ReactNode;
};

type CsvResultView = {
    imported?: number;
    skipped?: number;
    errors?: unknown[];
    warnings?: unknown[];
    skipped_details?: unknown[];
    imported_rows?: ImportedRow[];
};

export function CsvImportResult({
    T,
    csvImportResult,
}: {
    T: Translator;
    csvImportResult: CsvImportResultData | null;
}) {
    if (!csvImportResult) return null;

    const result = csvImportResult as CsvResultView;
    const hasErrors =
        (result.errors && result.errors.length > 0) ||
        (result.skipped_details && result.skipped_details.length > 0);
    const warnings = result.warnings || [];
    const genericErrors = result.errors || [];
    const importedRows = result.imported_rows || [];
    const imported = result.imported ?? 0;
    const skipped = result.skipped ?? 0;

    return (
        <div
            style={{
                background: hasErrors
                    ? "var(--danger-soft)"
                    : warnings.length > 0
                      ? "var(--warning-soft)"
                      : "var(--success-soft)",
                border: hasErrors
                    ? "1px solid var(--danger-soft)"
                    : warnings.length > 0
                      ? "1px solid var(--warning-ring)"
                      : "1px solid var(--success-soft)",
                borderRadius: 12,
                padding: "14px 16px",
            }}
        >
            <div
                style={{
                    fontSize: 14,
                    color: hasErrors
                        ? "var(--danger)"
                        : warnings.length > 0
                          ? "var(--warning)"
                          : "var(--success)",
                    fontWeight: 600,
                }}
            >
                {imported} {T("import_success")}
                {skipped > 0 ? `, ${skipped} ${T("import_skipped")}` : ""}
            </div>

            {imported > 0 && (
                <div
                    style={{
                        marginTop: 8,
                        fontSize: 12,
                        color: "var(--success)",
                    }}
                >
                    Import completato: le righe valide sono state salvate
                    correttamente.
                </div>
            )}

            {importedRows.length > 0 && (
                <div style={{ marginTop: 10 }}>
                    <div
                        style={{
                            fontSize: 12,
                            color: "var(--fg-soft)",
                            marginBottom: 6,
                        }}
                    >
                        Righe importate con successo:
                    </div>
                    <div style={{ maxHeight: 180, overflow: "auto" }}>
                        {importedRows.map((row) => (
                            <div
                                key={`ok-${row.row}-${row.asset_id}-${row.date}`}
                                style={{
                                    fontSize: 12,
                                    color: "var(--fg)",
                                    marginTop: 4,
                                }}
                            >
                                {T("csv_row_label")} {row.row}: {row.asset_name}{" "}
                                {row.transaction_type} {row.date} ({row.shares}{" "}
                                @ {row.price_per_share})
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {result.skipped_details && result.skipped_details.length > 0 && (
                <ResultLines prefix="skip" lines={result.skipped_details} />
            )}
            {warnings.length > 0 && (
                <ResultLines
                    prefix="warn"
                    lines={warnings}
                    color="var(--warning)"
                />
            )}
            {genericErrors.length > 0 && (
                <ResultLines prefix="gen" lines={genericErrors} />
            )}
        </div>
    );
}

function ResultLines({
    prefix,
    lines,
    color = "var(--danger)",
}: {
    prefix: string;
    lines: readonly unknown[];
    color?: string;
}) {
    return (
        <div style={{ marginTop: 8 }}>
            {lines.map((line, index) => (
                <div
                    key={`${prefix}-${index}`}
                    style={{ fontSize: 12, color, marginTop: 4 }}
                >
                    {line as ReactNode}
                </div>
            ))}
        </div>
    );
}
