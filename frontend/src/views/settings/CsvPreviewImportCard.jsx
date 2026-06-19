import { getPreviewCsvFields, hasRequiredCsvMapping } from "./csvImportConfig";

export function CsvPreviewImportCard({
  T,
  csvParsed,
  csvImportType,
  csvMap,
  csvImporting,
  csvImportPreview,
  setCsvImportPreview,
  previewImportCSV,
  doImportCSV,
}) {
  if (!csvParsed || !hasRequiredCsvMapping(csvImportType, csvMap)) {
    return null;
  }

  const previewCols = getPreviewCsvFields(csvImportType, csvMap);

  return (
    <div className="card">
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>
        {T("preview_title")}
      </div>
      <CsvPreviewTable
        csvParsed={csvParsed}
        csvMap={csvMap}
        previewCols={previewCols}
      />

      {csvImportType === "assets" ? (
        <div style={{ marginTop: 14, display: "flex", gap: 8 }}>
          <button
            className="btn"
            onClick={previewImportCSV}
            disabled={csvImporting}
            style={{ flex: 1, opacity: csvImporting ? 0.6 : 1 }}
          >
            Controlla duplicati
          </button>
          <button
            className="btn btn-p"
            onClick={doImportCSV}
            disabled={csvImporting}
            style={{ flex: 1, opacity: csvImporting ? 0.6 : 1 }}
          >
            {csvImporting ? "..." : T("import_btn")}
          </button>
        </div>
      ) : (
        <button
          className="btn btn-p"
          style={{
            width: "100%",
            marginTop: 14,
            padding: "12px",
            opacity: csvImporting ? 0.6 : 1,
          }}
          onClick={doImportCSV}
          disabled={csvImporting}
        >
          {csvImporting ? "..." : T("import_btn")}
        </button>
      )}

      {csvImportType === "assets" &&
        csvImportPreview &&
        Array.isArray(csvImportPreview.duplicate_rows) &&
        csvImportPreview.duplicate_rows.length > 0 && (
          <DuplicateRowsPanel
            T={T}
            csvImportPreview={csvImportPreview}
            setCsvImportPreview={setCsvImportPreview}
          />
        )}
    </div>
  );
}

function CsvPreviewTable({ csvParsed, csvMap, previewCols }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table
        style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}
      >
        <thead>
          <tr>
            {previewCols.map((field) => (
              <th
                key={field}
                style={{
                  padding: "6px 10px",
                  textAlign: "left",
                  color: "var(--fg-soft)",
                  borderBottom: "1px solid var(--rule)",
                  fontWeight: 500,
                }}
              >
                {csvMap[field]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {csvParsed.rows.slice(0, 5).map((row, rowIndex) => (
            <tr key={rowIndex}>
              {previewCols.map((field) => {
                const cellIndex = csvParsed.headers.indexOf(csvMap[field]);
                return (
                  <td
                    key={field}
                    style={{
                      padding: "6px 10px",
                      color: "var(--fg)",
                      borderBottom: "1px solid var(--card-inset)",
                      fontFamily: [
                        "amount",
                        "shares",
                        "price_per_share",
                        "invested_capital",
                        "current_value",
                      ].includes(field)
                        ? "var(--font-mono)"
                        : undefined,
                    }}
                  >
                    {cellIndex >= 0 ? row[cellIndex] : ""}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DuplicateRowsPanel({ T, csvImportPreview, setCsvImportPreview }) {
  const setAllDuplicateRows = (include) => {
    setCsvImportPreview((prev) => ({
      ...prev,
      duplicate_rows: (prev?.duplicate_rows || []).map((row) => ({
        ...row,
        include,
      })),
    }));
  };

  const setDuplicateRow = (rowNumber, include) => {
    setCsvImportPreview((prev) => ({
      ...prev,
      duplicate_rows: (prev?.duplicate_rows || []).map((row) =>
        row.row === rowNumber ? { ...row, include } : row,
      ),
    }));
  };

  return (
    <div
      style={{
        marginTop: 12,
        border: "1px solid var(--rule)",
        borderRadius: 8,
        padding: 10,
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div style={{ fontSize: 12, color: "var(--fg-soft)" }}>
        Duplicati trovati: {csvImportPreview.duplicate_rows.length}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn" onClick={() => setAllDuplicateRows(true)}>
          Importa tutti i duplicati
        </button>
        <button className="btn" onClick={() => setAllDuplicateRows(false)}>
          Escludi tutti
        </button>
      </div>
      <div style={{ maxHeight: 180, overflow: "auto" }}>
        {csvImportPreview.duplicate_rows.map((row) => (
          <label
            key={row.row}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 12,
              marginBottom: 6,
            }}
          >
            <input
              type="checkbox"
              checked={!!row.include}
              onChange={(event) =>
                setDuplicateRow(row.row, event.target.checked)
              }
            />
            <span>
              {T("csv_row_label")} {row.row}: {row.asset_name}{" "}
              {row.transaction_type} {row.date} ({row.shares} @{" "}
              {row.price_per_share})
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}
