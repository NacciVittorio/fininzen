import { DataExportSection } from "./DataExportSection";
import { DataImportSection } from "./DataImportSection";

export function DataSections({ accordionProps }) {
  return (
    <>
      <DataImportSection accordionProps={accordionProps} />
      <DataExportSection accordionProps={accordionProps} />
    </>
  );
}
