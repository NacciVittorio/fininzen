"use client";

import { useState } from "react";
import { fetchExportDataset } from "../../api/export";
import type { ExportDatasetType } from "../../api/export";
import { Card } from "../../components/ui";
import { useSettings } from "../../context/useSettings";
import { LONG_FETCH_TIMEOUT_MS } from "../../utils/api";
import { logError } from "../../utils/logger";

export function DataExportSection() {
    const { T, apiFetch, isDemo, viewAs } = useSettings();
    const [exportingType, setExportingType] = useState<string | null>(null);
    const [exportError, setExportError] = useState<string | null>(null);

    const downloadExport = async (type: ExportDatasetType) => {
        if (isDemo) {
            setExportError(T("export_demo_blocked"));
            return;
        }
        if (viewAs) {
            setExportError(T("export_viewas_blocked"));
            return;
        }

        setExportingType(type);
        setExportError(null);
        try {
            const res = await fetchExportDataset(
                apiFetch,
                type,
                LONG_FETCH_TIMEOUT_MS,
            );
            if (!res.ok) {
                let msg = `${T("export_error")} (${res.status})`;
                try {
                    const data = await res.json();
                    if (data?.error === "demo_export_disabled") {
                        msg = T("export_demo_blocked");
                    } else if (data?.error === "export_viewas_disabled") {
                        msg = T("export_viewas_blocked");
                    }
                } catch {
                    /* non-JSON body: keep generic message */
                }
                setExportError(msg);
                return;
            }

            const blob = await res.blob();
            const disposition = res.headers.get("Content-Disposition") || "";
            const match = disposition.match(/filename="?([^";]+)"?/i);
            const today = new Date().toISOString().slice(0, 10);
            const fallback =
                type === "all"
                    ? `fininzen_export_${today}.zip`
                    : `fininzen_${type}_${today}.csv`;
            const filename = match?.[1] ?? fallback;
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            setTimeout(() => URL.revokeObjectURL(url), 100);
        } catch (error) {
            logError("downloadExport:", error);
            setExportError(T("export_error"));
        } finally {
            setExportingType(null);
        }
    };

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
                <div className="grouped-list__title">{T("export_title")}</div>
                <div style={{ fontSize: 13, color: "var(--fg-soft)" }}>
                    {T("export_desc")}
                </div>
            </div>

            <Card variant="settings">
                <button
                    type="button"
                    onClick={() => downloadExport("all")}
                    disabled={exportingType !== null || isDemo || !!viewAs}
                    className="btn btn-p"
                    style={{ width: "100%" }}
                    aria-label={T("export_all")}
                >
                    {exportingType === "all" ? "..." : `📦 ${T("export_all")}`}
                </button>

                {exportError && (
                    <div
                        style={{
                            marginTop: 12,
                            fontSize: 13,
                            color: "var(--danger)",
                        }}
                    >
                        {exportError}
                    </div>
                )}
            </Card>
        </div>
    );
}
