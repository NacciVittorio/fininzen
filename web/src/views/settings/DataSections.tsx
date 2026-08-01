"use client";

import { DataExportSection } from "./DataExportSection";
import { DataImportSection } from "./DataImportSection";

export function DataSections() {
    return (
        <>
            <DataImportSection />
            <DataExportSection />
        </>
    );
}
