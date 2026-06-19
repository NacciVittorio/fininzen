import { useCallback } from "react";
import { API } from "../utils/api";
import {
    currentMonth,
    currentYear,
    parseAmount,
    parseMoneyToString,
    today,
} from "../utils/formatters";
import { REFRESH_REASONS } from "../utils/refreshReasons";
import { buildPacForm } from "./formBuilders";
import type { ApiFetcher } from "../api/client";
import type { RecurringInvestmentPlan } from "../api/types";
import type { Translator } from "../types";
import type { DecimalSeparator } from "../utils/formatters";
import type { RefreshReason } from "../utils/refreshReasons";
import type { AppProviderState } from "./useAppProviderState";

type PacActionState = Pick<
    AppProviderState,
    | "editingPacId"
    | "pacForm"
    | "setEditingPacId"
    | "setGeneratePacMsg"
    | "setPacError"
    | "setPacForm"
    | "setPacSaving"
    | "setShowPacModal"
>;

export type PacActionsOptions = PacActionState & {
    T: Translator;
    apiFetch: ApiFetcher;
    decimalSeparator: DecimalSeparator;
    fetchRecurringInvestmentPlans: () => unknown;
    guardDemo: () => boolean;
    refreshAfter: (reason: RefreshReason) => unknown;
};

type GenerationPeriod = { month?: number; year?: number };
type ApiMessage = Record<string, unknown>;

const asApiMessage = (payload: unknown): ApiMessage =>
    payload && typeof payload === "object" && !Array.isArray(payload)
        ? (payload as ApiMessage)
        : {};

const responseErrorMessage = (payload: unknown): string =>
    Object.values(asApiMessage(payload)).flat().filter(Boolean).join(" ");

export function usePacActions({
    apiFetch,
    decimalSeparator,
    editingPacId,
    fetchRecurringInvestmentPlans,
    guardDemo,
    pacForm,
    refreshAfter,
    setEditingPacId,
    setGeneratePacMsg,
    setPacError,
    setPacForm,
    setPacSaving,
    setShowPacModal,
    T,
}: PacActionsOptions) {
    const openPacModal = useCallback(
        (plan: RecurringInvestmentPlan | null = null) => {
            setPacError(null);
            setGeneratePacMsg(null);
            if (plan) {
                const rawAmount =
                    plan.amount == null || plan.amount === ""
                        ? ""
                        : String(plan.amount);
                setEditingPacId(plan.id);
                setPacForm(
                    buildPacForm({
                        name: plan.name || "",
                        asset: plan.asset ? String(plan.asset) : "",
                        source_account: plan.source_account
                            ? String(plan.source_account)
                            : "",
                        amount:
                            decimalSeparator === ","
                                ? rawAmount.replace(".", ",")
                                : rawAmount.replace(",", "."),
                        frequency: plan.frequency || "MONTHLY",
                        day_of_week: plan.day_of_week
                            ? String(plan.day_of_week)
                            : "1",
                        day_of_month: String(plan.day_of_month || 1),
                        anchor_month: plan.anchor_month
                            ? String(plan.anchor_month)
                            : "",
                        generated_transactions_verified:
                            plan.generated_transactions_verified === true,
                        start_date: plan.start_date || today(),
                        end_date: plan.end_date || "",
                        is_active:
                            plan.status != null
                                ? plan.status === "ACTIVE"
                                : plan.is_active !== false,
                        status:
                            plan.status ||
                            (plan.is_active === false ? "DISABLED" : "ACTIVE"),
                    }),
                );
            } else {
                setEditingPacId(null);
                setPacForm(buildPacForm());
            }
            setShowPacModal(true);
        },
        [
            decimalSeparator,
            setEditingPacId,
            setGeneratePacMsg,
            setPacError,
            setPacForm,
            setShowPacModal,
        ],
    );

    const closePacModal = useCallback(() => {
        setShowPacModal(false);
        setEditingPacId(null);
        setPacError(null);
        setPacForm(buildPacForm());
    }, [setEditingPacId, setPacError, setPacForm, setShowPacModal]);

    const refreshPacMutation = useCallback(() => {
        fetchRecurringInvestmentPlans();
        refreshAfter(REFRESH_REASONS.TRANSACTION_CREATED);
    }, [fetchRecurringInvestmentPlans, refreshAfter]);

    const submitPac = useCallback(async () => {
        if (guardDemo()) return false;
        const missing: string[] = [];
        if (!pacForm.name.trim()) missing.push(T("label_name"));
        if (!pacForm.asset) missing.push(T("label_asset"));
        if (!pacForm.source_account) missing.push(T("pac_source_account"));
        if (!pacForm.amount) missing.push(T("required_amount"));
        if (!pacForm.start_date) missing.push(T("recurring_start_date"));
        if (missing.length) {
            setPacError(`${T("error_required_fields")} ${missing.join(", ")}`);
            return false;
        }
        const parsedAmount = parseAmount(pacForm.amount, decimalSeparator);
        if (isNaN(parsedAmount) || parsedAmount <= 0) {
            setPacError(T("error_invalid_amount"));
            return false;
        }
        const dayNum = parseInt(pacForm.day_of_month, 10);
        if (!Number.isFinite(dayNum) || dayNum < 1 || dayNum > 31) {
            setPacError(T("recurring_day_error"));
            return false;
        }
        const dayOfWeek = parseInt(pacForm.day_of_week, 10);
        if (
            pacForm.frequency === "WEEKLY" &&
            (!Number.isFinite(dayOfWeek) || dayOfWeek < 1 || dayOfWeek > 7)
        ) {
            setPacError(T("pac_weekday_error"));
            return false;
        }
        const anchorMonth = parseInt(pacForm.anchor_month, 10);
        const needsAnchor = ["QUARTERLY", "SEMIANNUAL", "ANNUAL"].includes(
            pacForm.frequency,
        );
        if (
            needsAnchor &&
            (!Number.isFinite(anchorMonth) ||
                anchorMonth < 1 ||
                anchorMonth > 12)
        ) {
            setPacError(T("recurring_month_error"));
            return false;
        }

        const amount = parseMoneyToString(pacForm.amount, decimalSeparator);
        if (amount == null) {
            setPacError(T("error_invalid_amount"));
            return false;
        }
        const bodyPayload = {
            name: pacForm.name.trim(),
            asset: parseInt(pacForm.asset, 10),
            source_account: parseInt(pacForm.source_account, 10),
            amount,
            frequency: pacForm.frequency || "MONTHLY",
            day_of_week: pacForm.frequency === "WEEKLY" ? dayOfWeek : null,
            day_of_month: dayNum,
            anchor_month: needsAnchor ? anchorMonth : null,
            generated_transactions_verified:
                pacForm.generated_transactions_verified === true,
            is_active: pacForm.is_active,
            status: pacForm.is_active ? "ACTIVE" : "DISABLED",
            start_date: pacForm.start_date,
            end_date: pacForm.end_date || null,
        };

        setPacSaving(true);
        setPacError(null);
        try {
            const url = editingPacId
                ? `${API}/portfolio/recurring-investments/${editingPacId}/`
                : `${API}/portfolio/recurring-investments/`;
            const res = await apiFetch(url, {
                method: editingPacId ? "PATCH" : "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(bodyPayload),
            });
            if (!res.ok) {
                const err = (await res.json().catch(() => ({}))) as unknown;
                setPacError(
                    responseErrorMessage(err) || T("error_save_failed"),
                );
                return false;
            }
            closePacModal();
            refreshPacMutation();
            return true;
        } catch {
            setPacError(T("error_network"));
            return false;
        } finally {
            setPacSaving(false);
        }
    }, [
        apiFetch,
        closePacModal,
        decimalSeparator,
        editingPacId,
        guardDemo,
        pacForm,
        refreshPacMutation,
        setPacError,
        setPacSaving,
        T,
    ]);

    const togglePacStatus = useCallback(
        async (plan: RecurringInvestmentPlan) => {
            if (guardDemo()) return false;
            if (!plan?.id) return false;
            const action = plan.status === "ACTIVE" ? "disable" : "enable";
            setPacSaving(true);
            setPacError(null);
            try {
                const res = await apiFetch(
                    `${API}/portfolio/recurring-investments/${plan.id}/${action}/`,
                    { method: "POST" },
                );
                if (!res.ok) {
                    const err = asApiMessage(
                        await res.json().catch(() => ({})),
                    );
                    setPacError(
                        typeof err.error === "string"
                            ? err.error
                            : T("error_save_failed"),
                    );
                    return false;
                }
                refreshPacMutation();
                return true;
            } catch {
                setPacError(T("error_network"));
                return false;
            } finally {
                setPacSaving(false);
            }
        },
        [apiFetch, guardDemo, refreshPacMutation, setPacError, setPacSaving, T],
    );

    const deletePac = useCallback(
        async (plan: RecurringInvestmentPlan) => {
            if (guardDemo()) return false;
            if (!plan?.id) return false;
            setPacSaving(true);
            setPacError(null);
            try {
                const res = await apiFetch(
                    `${API}/portfolio/recurring-investments/${plan.id}/`,
                    { method: "DELETE" },
                );
                if (!res.ok) {
                    const err = asApiMessage(
                        await res.json().catch(() => ({})),
                    );
                    setPacError(
                        typeof err.error === "string"
                            ? err.error
                            : T("error_save_failed"),
                    );
                    return false;
                }
                refreshPacMutation();
                return true;
            } catch {
                setPacError(T("error_network"));
                return false;
            } finally {
                setPacSaving(false);
            }
        },
        [apiFetch, guardDemo, refreshPacMutation, setPacError, setPacSaving, T],
    );

    const generatePacForMonth = useCallback(
        async ({
            month = currentMonth,
            year = currentYear,
        }: GenerationPeriod = {}) => {
            if (guardDemo()) return null;
            setPacSaving(true);
            setPacError(null);
            try {
                const res = await apiFetch(
                    `${API}/portfolio/recurring-investments/generate/`,
                    {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ month, year }),
                    },
                );
                if (!res.ok) {
                    const err = asApiMessage(
                        await res.json().catch(() => ({})),
                    );
                    setPacError(
                        typeof err.error === "string"
                            ? err.error
                            : T("error_save_failed"),
                    );
                    return null;
                }
                const data = asApiMessage(await res.json());
                setGeneratePacMsg(data);
                refreshPacMutation();
                return data;
            } catch {
                setPacError(T("error_network"));
                return null;
            } finally {
                setPacSaving(false);
            }
        },
        [
            apiFetch,
            guardDemo,
            refreshPacMutation,
            setGeneratePacMsg,
            setPacError,
            setPacSaving,
            T,
        ],
    );

    return {
        openPacModal,
        closePacModal,
        submitPac,
        togglePacStatus,
        deletePac,
        generatePacForMonth,
    };
}
