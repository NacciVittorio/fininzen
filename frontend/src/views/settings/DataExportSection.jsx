import { useMemo, useState } from "react";
import { fetchExportDataset } from "../../api/export";
import { useSettings } from "../../context/useSettings";
import { LONG_FETCH_TIMEOUT_MS } from "../../utils/api";
import { buildExportOptions } from "../../utils/exportOptions";
import { logError } from "../../utils/logger";
import { AccordionSection } from "./SettingsSections";

export function DataExportSection({ accordionProps }) {
  const { T, apiFetch, isDemo, viewAs, isFeatureEnabled } = useSettings();
  const [exportingType, setExportingType] = useState(null);
  const [exportError, setExportError] = useState(null);
  const exportOptions = useMemo(
    () => buildExportOptions({ isFeatureEnabled, T }),
    [T, isFeatureEnabled],
  );

  const downloadExport = async (type) => {
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
          ? `finnet_export_${today}.zip`
          : `finnet_${type}_${today}.csv`;
      const filename = match ? match[1] : fallback;
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

  if (exportOptions.length === 0) return null;

  return (
    <AccordionSection sectionKey="export" {...accordionProps}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>
            {T("export_title")}
          </div>
          <div style={{ fontSize: 13, color: "var(--fg-soft)" }}>
            {T("export_desc")}
          </div>
        </div>

        <div className="card">
          {isFeatureEnabled("cashflow") &&
            isFeatureEnabled("accounts") &&
            isFeatureEnabled("investments") && (
              <button
                type="button"
                onClick={() => downloadExport("all")}
                disabled={exportingType !== null || isDemo || !!viewAs}
                className="btn btn-p"
                style={{ width: "100%", marginBottom: 12 }}
                aria-label={T("export_all")}
              >
                {exportingType === "all" ? "..." : `📦 ${T("export_all")}`}
              </button>
            )}

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {exportOptions.map(({ type, label }) => (
              <div
                key={type}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  padding: "8px 12px",
                  borderRadius: 8,
                  background: "var(--card-inset)",
                }}
              >
                <span style={{ fontSize: 14, color: "var(--fg)" }}>
                  {label}
                </span>
                <button
                  type="button"
                  onClick={() => downloadExport(type)}
                  disabled={exportingType !== null || isDemo || !!viewAs}
                  className="btn btn-sm"
                  aria-label={`${T("export_btn_download")} ${label}`}
                >
                  {exportingType === type ? "..." : T("export_btn_download")}
                </button>
              </div>
            ))}
          </div>

          {exportError && (
            <div
              style={{ marginTop: 12, fontSize: 13, color: "var(--danger)" }}
            >
              {exportError}
            </div>
          )}
        </div>
      </div>
    </AccordionSection>
  );
}
