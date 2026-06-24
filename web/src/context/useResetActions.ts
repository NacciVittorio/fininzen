import { API, LONG_FETCH_TIMEOUT_MS } from "../utils/api";
import { REFRESH_REASONS } from "../utils/refreshReasons";
import type { ApiFetcher } from "../api/client";
import type { Translator } from "../types";
import type { RefreshReason } from "../utils/refreshReasons";
import type { AppProviderState } from "./useAppProviderState";

type ResetActionState = Pick<
    AppProviderState,
    | "setDemoConfirm"
    | "setDemoError"
    | "setDemoLoading"
    | "setDemoUnderstood"
    | "setResetConfirm"
    | "setResetMsg"
    | "setResetUnderstood"
>;

export type ResetActionsOptions = ResetActionState & {
    T: Translator;
    apiFetch: ApiFetcher;
    refreshAfter: (reason: RefreshReason) => unknown;
};

type ResetResponse = { deleted?: number };

export function useResetActions({
    apiFetch,
    refreshAfter,
    setDemoConfirm,
    setDemoError,
    setDemoLoading,
    setDemoUnderstood,
    setResetConfirm,
    setResetMsg,
    setResetUnderstood,
    T,
}: ResetActionsOptions) {
    // ── Reset / demo ──

    const resetTransactions = async () => {
        const res = await apiFetch(`${API}/expenses/reset/`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ confirm: true }),
        });
        const data = (await res.json()) as ResetResponse;
        setResetConfirm(null);
        setResetUnderstood(false);
        setResetMsg({ deleted: data.deleted ?? 0, target: "transactions" });
        refreshAfter(REFRESH_REASONS.EXPENSES_RESET);
    };

    const resetPortfolio = async () => {
        const res = await apiFetch(`${API}/portfolio/reset/`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ confirm: true }),
        });
        const data = (await res.json()) as ResetResponse;
        setResetConfirm(null);
        setResetUnderstood(false);
        setResetMsg({ deleted: data.deleted ?? 0, target: "portfolio" });
        refreshAfter(REFRESH_REASONS.PORTFOLIO_RESET);
    };

    const loadDemoData = async () => {
        setDemoLoading(true);
        setDemoError("");
        try {
            const res = await apiFetch(`${API}/expenses/seed-demo/`, {
                method: "POST",
                timeoutMs: LONG_FETCH_TIMEOUT_MS,
            });
            if (!res.ok) {
                setDemoError(T("error_save_failed"));
                setDemoLoading(false);
                return;
            }
        } catch {
            setDemoError(T("error_network"));
            setDemoLoading(false);
            return;
        }
        setDemoLoading(false);
        setDemoConfirm(false);
        setDemoUnderstood(false);
        refreshAfter(REFRESH_REASONS.DEMO_LOADED);
    };

    return { resetTransactions, resetPortfolio, loadDemoData };
}
