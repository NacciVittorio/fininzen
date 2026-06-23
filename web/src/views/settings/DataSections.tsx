"use client";

import { DataExportSection } from "./DataExportSection";
import { DataImportSection } from "./DataImportSection";
import type { AccordionProps } from "./SettingsNavigation";

export function DataSections({
    accordionProps,
}: {
    accordionProps: AccordionProps;
}) {
    return (
        <>
            <DataImportSection accordionProps={accordionProps} />
            <DataExportSection accordionProps={accordionProps} />
        </>
    );
}
