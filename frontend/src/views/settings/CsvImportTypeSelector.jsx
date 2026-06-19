export function CsvImportTypeSelector({
  T,
  importTypeOptions,
  csvImportType,
  setCsvImportType,
  setCsvMap,
  setCsvImportPreview,
}) {
  return (
    <div className="card">
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>
        {T("import_type_label")}
      </div>
      <div
        className="row"
        style={{
          flexWrap: "wrap",
          gap: 6,
          background: "var(--rule-soft)",
          borderRadius: 8,
          padding: 3,
        }}
      >
        {importTypeOptions.map((opt) => {
          const active = csvImportType === opt.key;
          return (
            <button
              key={opt.key}
              onClick={() => {
                setCsvImportType(opt.key);
                setCsvMap({});
                setCsvImportPreview(null);
              }}
              style={{
                flex: "1 1 auto",
                border: "none",
                background: active ? "var(--card-bg)" : "transparent",
                color: active ? "var(--fg)" : "var(--fg-soft)",
                fontSize: 12,
                fontWeight: active ? 600 : 500,
                padding: "6px 12px",
                borderRadius: 6,
                cursor: "pointer",
                boxShadow: active ? "var(--shadow-soft)" : "none",
              }}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
