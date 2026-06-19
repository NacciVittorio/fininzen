import type { Translator } from "../types";

export type ExportType = "transactions" | "assets" | "cashflow";

export type ExportOption = {
  type: ExportType;
  label: string;
};

type BuildExportOptionsArgs = {
  isFeatureEnabled: (feature: string) => boolean;
  T: Translator;
};

export function buildExportOptions({
  isFeatureEnabled,
  T,
}: BuildExportOptionsArgs): ExportOption[] {
  return [
    isFeatureEnabled("investments") && {
      type: "transactions",
      label: T("export_transactions"),
    },
    // "assets" exports the Asset rows themselves (positions), distinct from the
    // "transactions" stream. The backend already serves type=assets; surface it
    // whenever investments are enabled.
    isFeatureEnabled("investments") && {
      type: "assets",
      label: T("export_assets"),
    },
    isFeatureEnabled("cashflow") && {
      type: "cashflow",
      label: T("export_cashflow"),
    },
  ].filter((option): option is ExportOption => Boolean(option));
}
