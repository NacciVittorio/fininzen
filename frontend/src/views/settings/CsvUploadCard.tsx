import type { ChangeEvent, RefObject } from "react";
import type { Translator } from "../../types";

export function CsvUploadCard({
    T,
    csvFileInputRef,
    csvFile,
    csvSep,
    handleCSVUpload,
    handleCsvSepChange,
}: {
    T: Translator;
    csvFileInputRef: RefObject<HTMLInputElement | null>;
    csvFile: File | null;
    csvSep: string;
    handleCSVUpload: (event: ChangeEvent<HTMLInputElement>) => void;
    handleCsvSepChange: (sep: string) => void;
}) {
    return (
        <div className="card">
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>
                {T("upload_file")}
            </div>
            <input
                ref={csvFileInputRef}
                type="file"
                accept=".csv"
                onChange={handleCSVUpload}
                style={{ display: "none" }}
            />
            <button
                type="button"
                className="btn"
                onClick={() => csvFileInputRef.current?.click()}
                style={{ marginBottom: 14 }}
            >
                {T("upload_file")}
            </button>
            <div
                style={{
                    fontSize: 12,
                    color: "var(--fg-soft)",
                    marginBottom: 10,
                }}
            >
                {csvFile
                    ? `${T("csv_file_selected")}: ${csvFile.name}`
                    : T("csv_no_file_selected")}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 13, color: "var(--fg-soft)" }}>
                    {T("separator")}:
                </span>
                {[";", ","].map((sep) => (
                    <button
                        key={sep}
                        onClick={() => handleCsvSepChange(sep)}
                        style={{
                            padding: "5px 14px",
                            borderRadius: 8,
                            cursor: "pointer",
                            border: "1px solid",
                            fontFamily: "var(--font-mono)",
                            fontSize: 14,
                            fontWeight: 600,
                            transition: "all 0.15s",
                            background:
                                csvSep === sep
                                    ? "var(--accent-ring)"
                                    : "var(--card-inset)",
                            color:
                                csvSep === sep
                                    ? "var(--accent)"
                                    : "var(--fg-soft)",
                            borderColor:
                                csvSep === sep
                                    ? "var(--accent-ring)"
                                    : "var(--rule)",
                        }}
                    >
                        {sep}
                    </button>
                ))}
            </div>
        </div>
    );
}
