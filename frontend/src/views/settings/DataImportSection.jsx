import { useEffect, useMemo, useRef } from "react";
import { useSettings } from "../../context/useSettings";
import { AccordionSection } from "./SettingsSections";
import { CsvColumnMappingCard } from "./CsvColumnMappingCard";
import { CsvImportResult } from "./CsvImportResult";
import { CsvImportTypeSelector } from "./CsvImportTypeSelector";
import { CsvPreviewImportCard } from "./CsvPreviewImportCard";
import { CsvUploadCard } from "./CsvUploadCard";

export function DataImportSection({ accordionProps }) {
  const csvFileInputRef = useRef(null);
  const {
    T,
    categories,
    csvFile,
    csvParsed,
    csvSep,
    csvImportType,
    setCsvImportType,
    csvMap,
    setCsvMap,
    csvSignConv,
    setCsvSignConv,
    csvImportResult,
    csvImporting,
    csvImportPreview,
    setCsvImportPreview,
    handleCSVUpload,
    handleCsvSepChange,
    previewImportCSV,
    doImportCSV,
    isFeatureEnabled,
  } = useSettings();

  const importTypeOptions = useMemo(
    () =>
      [
        isFeatureEnabled("cashflow") && {
          key: "cashflow",
          label: T("import_type_cashflow"),
        },
        isFeatureEnabled("investments") && {
          key: "assets",
          label: T("import_type_assets"),
        },
      ].filter(Boolean),
    [T, isFeatureEnabled],
  );

  useEffect(() => {
    if (
      importTypeOptions.length > 0 &&
      !importTypeOptions.some((option) => option.key === csvImportType)
    ) {
      setCsvImportType(importTypeOptions[0].key);
      setCsvMap({});
      setCsvImportPreview(null);
    }
  }, [
    importTypeOptions,
    csvImportType,
    setCsvImportType,
    setCsvMap,
    setCsvImportPreview,
  ]);

  return (
    <AccordionSection sectionKey="import" {...accordionProps}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>
            {T("import_title")}
          </div>
          <div style={{ fontSize: 13, color: "var(--fg-soft)" }}>
            {T("import_desc")}
          </div>
        </div>

        {importTypeOptions.length > 0 ? (
          <>
            <CsvImportTypeSelector
              T={T}
              importTypeOptions={importTypeOptions}
              csvImportType={csvImportType}
              setCsvImportType={setCsvImportType}
              setCsvMap={setCsvMap}
              setCsvImportPreview={setCsvImportPreview}
            />
            <CsvUploadCard
              T={T}
              csvFileInputRef={csvFileInputRef}
              csvFile={csvFile}
              csvSep={csvSep}
              handleCSVUpload={handleCSVUpload}
              handleCsvSepChange={handleCsvSepChange}
            />
            <CsvColumnMappingCard
              T={T}
              categories={categories}
              csvParsed={csvParsed}
              csvImportType={csvImportType}
              csvMap={csvMap}
              setCsvMap={setCsvMap}
              csvSignConv={csvSignConv}
              setCsvSignConv={setCsvSignConv}
              setCsvImportPreview={setCsvImportPreview}
            />
            <CsvPreviewImportCard
              T={T}
              csvParsed={csvParsed}
              csvImportType={csvImportType}
              csvMap={csvMap}
              csvImporting={csvImporting}
              csvImportPreview={csvImportPreview}
              setCsvImportPreview={setCsvImportPreview}
              previewImportCSV={previewImportCSV}
              doImportCSV={doImportCSV}
            />
            <CsvImportResult T={T} csvImportResult={csvImportResult} />
          </>
        ) : (
          <div
            className="card"
            style={{ fontSize: 13, color: "var(--fg-soft)" }}
          >
            {T("features_no_import")}
          </div>
        )}
      </div>
    </AccordionSection>
  );
}
