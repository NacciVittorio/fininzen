"use client";

import type { ReactNode } from "react";
import { formatBulkTemplate } from "./bulkEditModel";

type RejectedRow = { id: number | string; reason?: ReactNode };

type BulkEditPreviewPanelProps = {
    hasAnyChange: boolean;
    previewOk: boolean;
    loading: boolean;
    preview?: {
        total_selected?: number;
        total_amount?: number | string;
    } | null;
    rejectedRows: RejectedRow[];
    missingIds: (number | string)[];
    formatEur: (value: number | string) => string;
    T: (key: string, fallback?: string) => string;
};

export function BulkEditPreviewPanel({
    hasAnyChange,
    previewOk,
    loading,
    preview,
    rejectedRows,
    missingIds,
    formatEur,
    T,
}: BulkEditPreviewPanelProps) {
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
                background: previewOk
                    ? "var(--accent-soft)"
                    : "var(--card-inset)",
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
                        ? formatBulkTemplate(T("cf_bulk_preview_summary"), {
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
                    style={{
                        marginTop: 6,
                        fontSize: 12,
                        color: "var(--fg-soft)",
                    }}
                >
                    <summary
                        style={{
                            cursor: "pointer",
                            color: "var(--danger)",
                            fontWeight: 600,
                        }}
                    >
                        {formatBulkTemplate(T("cf_bulk_rejected_rows"), {
                            count: rejectedRows.length,
                        })}{" "}
                        {"·"} {T("cf_bulk_rejected_show")}
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
                                <code style={{ fontSize: 11 }}>{r.id}</code>{" "}
                                {"—"} {r.reason}
                            </li>
                        ))}
                        {rejectedRows.length > 50 && (
                            <li style={{ fontStyle: "italic" }}>
                                {"…"} +{rejectedRows.length - 50}
                            </li>
                        )}
                    </ul>
                </details>
            )}
            {missingIds.length > 0 && (
                <div
                    style={{
                        marginTop: 6,
                        fontSize: 12,
                        color: "var(--fg-soft)",
                    }}
                >
                    {formatBulkTemplate(T("cf_bulk_missing_rows"), {
                        count: missingIds.length,
                    })}
                </div>
            )}
        </div>
    );
}
