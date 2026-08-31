"use client";

import { DataExportSection } from "./DataExportSection";
import { DataImportSection } from "./DataImportSection";

export function DataSections() {
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
            <DataImportSection />
            <DataExportSection />
        </div>
    );
}
