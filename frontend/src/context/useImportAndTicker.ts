import { useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { API, LONG_FETCH_TIMEOUT_MS } from "../utils/api";
import { parseCSV } from "../utils/formatters";
import { REFRESH_REASONS } from "../utils/refreshReasons";
import {
    buildCsvImportPayload,
    inferCashflowCsvMap,
    normalizeCsvImportErrors,
} from "./csvImportModel";
import { buildCsvMap } from "./feedDefaults";
import { normalizeBorsaFundInput } from "./appContextHelpers";
import type { ApiFetcher } from "../api/client";
import type { Asset, Category } from "../api/types";
import type { Translator } from "../types";
import type { ParsedCsv } from "../utils/formatters";
import type { RefreshReason } from "../utils/refreshReasons";
import type { AssetForm } from "./useAppProviderState";
import type { Dispatch, SetStateAction } from "react";
import type {
    CsvImportType,
    CsvMapping,
} from "../views/settings/csvImportConfig";

export type TickerSearchOrigin = "ticker" | "isin";
export type TickerResult = {
    symbol?: string;
    source?: string;
    url?: string;
    name?: string;
    exchange?: string;
    match_reason?: string;
    [key: string]: unknown;
};

type UseImportAndTickerArgs = {
    T: Translator;
    apiFetch: ApiFetcher;
    assetForm: AssetForm;
    bankAccounts: Asset[];
    categories: Category[];
    refreshAfter: (reason: RefreshReason) => unknown;
    setAssetForm: Dispatch<SetStateAction<AssetForm>>;
};

type CsvDuplicateRow = {
    row: number;
    include: boolean;
    [key: string]: unknown;
};

type CsvImportResponse = {
    imported?: number;
    skipped?: number;
    errors?: unknown[];
    warnings?: unknown[];
    duplicate_rows?: CsvDuplicateRow[];
    [key: string]: unknown;
};

type CsvImportResult = CsvImportResponse & {
    errors: string[];
    warnings?: unknown[];
};

const readCsv = (
    file: File,
    separator: string,
    onParsed: (parsed: ParsedCsv | null) => void,
): void => {
    const reader = new FileReader();
    reader.onload = (event) => {
        const result = event.target?.result;
        onParsed(parseCSV(typeof result === "string" ? result : "", separator));
    };
    reader.readAsText(file, "UTF-8");
};

const asCsvResponse = (payload: unknown): CsvImportResponse =>
    payload && typeof payload === "object" && !Array.isArray(payload)
        ? (payload as CsvImportResponse)
        : {};

export function useImportAndTicker({
    apiFetch,
    assetForm,
    bankAccounts,
    categories,
    refreshAfter,
    setAssetForm,
    T,
}: UseImportAndTickerArgs) {
    // Ticker autocomplete
    const [tickerQuery, setTickerQuery] = useState("");
    const [tickerResults, setTickerResults] = useState<TickerResult[]>([]);
    const [tickerLoading, setTickerLoading] = useState(false);
    const [showTickerDrop, setShowTickerDrop] = useState(false);
    const [tickerSearchOrigin, setTickerSearchOrigin] =
        useState<TickerSearchOrigin>("ticker");
    const tickerDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(
        null,
    );

    // CSV import
    const [csvFile, setCsvFile] = useState<File | null>(null);
    const [csvParsed, setCsvParsed] = useState<ParsedCsv | null>(null);
    const [csvSep, setCsvSep] = useState(";");
    const [csvImportType, setCsvImportType] =
        useState<CsvImportType>("cashflow");
    const [csvMap, setCsvMap] = useState<CsvMapping>(() => ({
        ...buildCsvMap(),
    }));
    const [csvSignConv, setCsvSignConv] = useState<"neg" | "pos">("neg");
    const [csvImportResult, setCsvImportResult] =
        useState<CsvImportResult | null>(null);
    const [csvImporting, setCsvImporting] = useState(false);
    const [csvImportPreview, setCsvImportPreview] =
        useState<CsvImportResponse | null>(null);

    // ── Ticker autocomplete ──

    useEffect(
        () => () => {
            if (tickerDebounceRef.current)
                clearTimeout(tickerDebounceRef.current);
        },
        [],
    );

    const searchTickerCandidates = (
        val: string,
        origin: TickerSearchOrigin,
        fallbackName = "",
    ): void => {
        setTickerSearchOrigin(origin);
        setShowTickerDrop(true);
        if (tickerDebounceRef.current) clearTimeout(tickerDebounceRef.current);
        if (!val || val.length < 1) {
            setTickerResults([]);
            setShowTickerDrop(false);
            return;
        }
        tickerDebounceRef.current = setTimeout(async () => {
            setTickerLoading(true);
            try {
                const fallback = fallbackName
                    ? `&name=${encodeURIComponent(fallbackName)}`
                    : "";
                const res = await apiFetch(
                    `${API}/portfolio/search-ticker/?q=${encodeURIComponent(val)}${fallback}`,
                );
                const data = (await res.json()) as unknown;
                setTickerResults(Array.isArray(data) ? data : []);
                setShowTickerDrop(true);
            } catch {
                setTickerResults([]);
            } finally {
                setTickerLoading(false);
            }
        }, 350);
    };

    const handleTickerInput = (val: string): void => {
        const borsa = normalizeBorsaFundInput(val);
        const symbol = borsa?.symbol || val;
        setTickerQuery(val);
        setAssetForm((prev) => {
            const selectedSource = prev.price_source || "AUTO";
            const shouldKeepBorsaUrl =
                borsa &&
                (selectedSource === "AUTO" ||
                    selectedSource === "BORSA_ITALIANA");
            return {
                ...prev,
                ticker: symbol,
                price_source: selectedSource,
                source_symbol: symbol,
                source_url: shouldKeepBorsaUrl ? borsa.url : "",
            };
        });
        searchTickerCandidates(val, "ticker");
    };

    const handleIsinInput = (val: string): void => {
        const isin = String(val || "").toUpperCase();
        setAssetForm((prev) => ({ ...prev, isin }));
        searchTickerCandidates(isin, "isin", assetForm.name);
    };

    const selectTicker = (result: string | TickerResult): void => {
        const item =
            typeof result === "string"
                ? { symbol: result, source: "YAHOO" }
                : result;
        const symbol = item.symbol || "";
        const source = item.source || "YAHOO";
        setAssetForm((prev) => ({
            ...prev,
            ticker: symbol,
            price_source: source,
            source_symbol: symbol,
            source_url: item.url || "",
        }));
        setTickerQuery(symbol);
        setShowTickerDrop(false);
        setTickerResults([]);
        setTickerSearchOrigin("ticker");
    };

    const handlePriceSourceChange = (source: string): void => {
        setAssetForm((prev) => {
            const borsa = normalizeBorsaFundInput(
                prev.source_symbol || prev.ticker,
            );
            const symbol =
                borsa?.symbol || prev.source_symbol || prev.ticker || "";
            return {
                ...prev,
                price_source: source,
                ticker: symbol,
                source_symbol: symbol,
                source_url:
                    borsa && (source === "AUTO" || source === "BORSA_ITALIANA")
                        ? borsa.url
                        : "",
            };
        });
    };

    // ── CSV ──

    const _applyInferredCsvMap = (parsed: ParsedCsv | null): void => {
        if (!parsed || csvImportType !== "cashflow") return;
        const inferred = inferCashflowCsvMap(parsed.headers || []);
        setCsvMap((prev) => ({ ...prev, ...inferred }));
    };

    const handleCSVUpload = (event: ChangeEvent<HTMLInputElement>): void => {
        const file = event.target.files?.[0];
        if (!file) return;
        if (file.size > 2 * 1024 * 1024) {
            setCsvImportResult({
                imported: 0,
                skipped: 0,
                errors: [T("error_csv_too_large")],
            });
            event.target.value = "";
            return;
        }
        setCsvFile(file);
        setCsvImportResult(null);
        setCsvImportPreview(null);
        readCsv(file, csvSep, (parsed) => {
            setCsvParsed(parsed);
            _applyInferredCsvMap(parsed);
        });
    };

    const handleCsvSepChange = (sep: string): void => {
        setCsvSep(sep);
        setCsvImportPreview(null);
        if (csvFile) {
            readCsv(csvFile, sep, (parsed) => {
                setCsvParsed(parsed);
                _applyInferredCsvMap(parsed);
            });
        }
    };

    const _buildImportPayload = () =>
        buildCsvImportPayload({
            apiBase: API,
            csvImportType,
            csvParsed,
            csvMap,
            csvSignConv,
            categories,
            bankAccounts,
        });

    const doImportCSV = async () => {
        let includeDuplicateRows: number[] = [];
        if (
            csvImportType === "assets" &&
            csvImportPreview &&
            Array.isArray(csvImportPreview.duplicate_rows)
        ) {
            includeDuplicateRows = csvImportPreview.duplicate_rows
                .filter((row) => row.include === true)
                .map((row) => row.row);
        }
        const payload = _buildImportPayload();
        if (!payload) return;
        setCsvImporting(true);
        try {
            const res = await apiFetch(payload.endpoint, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                timeoutMs: LONG_FETCH_TIMEOUT_MS,
                body: JSON.stringify({
                    rows: payload.rows,
                    include_duplicate_rows: includeDuplicateRows,
                }),
            });
            const data = asCsvResponse(await res.json());
            const warnings = Array.isArray(data.warnings)
                ? [...data.warnings]
                : [];
            if (
                csvImportType === "cashflow" &&
                data.imported === 0 &&
                data.skipped === 0 &&
                payload.rows.length > 0 &&
                warnings.length === 0 &&
                !data.errors?.length
            ) {
                warnings.push(T("import_no_rows_diagnostic"));
            }
            setCsvImportResult({
                ...data,
                errors: normalizeCsvImportErrors(data.errors, T),
                warnings,
            });
            if ((data.imported ?? 0) > 0) {
                if (csvImportType === "cashflow") {
                    refreshAfter(REFRESH_REASONS.CSV_IMPORTED);
                } else {
                    refreshAfter(REFRESH_REASONS.ASSET_CREATED);
                }
            }
        } catch {
            setCsvImportResult({
                imported: 0,
                skipped: 0,
                errors: [T("error_network")],
            });
        } finally {
            setCsvImporting(false);
        }
    };

    const previewImportCSV = async () => {
        const payload = _buildImportPayload();
        if (!payload || csvImportType !== "assets") return null;
        setCsvImporting(true);
        try {
            const res = await apiFetch(payload.endpoint, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                timeoutMs: LONG_FETCH_TIMEOUT_MS,
                body: JSON.stringify({
                    rows: payload.rows,
                    preview_only: true,
                }),
            });
            const data = asCsvResponse(await res.json());
            const normalized = {
                ...data,
                duplicate_rows: (data.duplicate_rows || []).map((r) => ({
                    ...r,
                    include: false,
                })),
            };
            setCsvImportPreview(normalized);
            return normalized;
        } catch {
            setCsvImportPreview(null);
            return null;
        } finally {
            setCsvImporting(false);
        }
    };

    return {
        tickerQuery,
        setTickerQuery,
        tickerResults,
        setTickerResults,
        tickerLoading,
        showTickerDrop,
        tickerSearchOrigin,
        setTickerSearchOrigin,
        setShowTickerDrop,
        handleTickerInput,
        handleIsinInput,
        handlePriceSourceChange,
        selectTicker,
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
    };
}
