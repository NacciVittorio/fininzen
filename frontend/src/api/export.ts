import { API } from "../utils/api";
import type { ApiFetcher } from "./client";

export type ExportDatasetType = "all" | string;

export const fetchExportDataset = (
    fetcher: ApiFetcher,
    type: ExportDatasetType,
    timeoutMs: number,
): Promise<Response> =>
    fetcher(`${API}/export/?type=${encodeURIComponent(type)}`, {
        timeoutMs,
    });
