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
import { buildRecurringForm } from "./formBuilders";
import type { ApiFetcher } from "../api/client";
import type { RecurringExpense } from "../api/types";
import type { Translator } from "../types";
import type { DecimalSeparator } from "../utils/formatters";
import type { RefreshReason } from "../utils/refreshReasons";
import type { AppProviderState } from "./useAppProviderState";

type RecurringExpenseState = Pick<
    AppProviderState,
    | "editingRecurringId"
    | "recurringForm"
    | "setEditingRecurringId"
    | "setGenerateRecurringMsg"
    | "setRecurringError"
    | "setRecurringForm"
    | "setRecurringSaving"
    | "setShowRecurringModal"
>;

export type RecurringExpenseActionsOptions = RecurringExpenseState & {
    T: Translator;
    apiFetch: ApiFetcher;
    decimalSeparator: DecimalSeparator;
    fetchRecurringExpenses: () => unknown;
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

export function useRecurringExpenseActions({
    apiFetch,
    decimalSeparator,
    editingRecurringId,
    fetchRecurringExpenses,
    guardDemo,
    recurringForm,
    refreshAfter,
    setEditingRecurringId,
    setGenerateRecurringMsg,
    setRecurringError,
    setRecurringForm,
    setRecurringSaving,
    setShowRecurringModal,
    T,
}: RecurringExpenseActionsOptions) {
    const openRecurringModal = useCallback(
        (recurring: RecurringExpense | null = null) => {
            setRecurringError(null);
            setGenerateRecurringMsg(null);
            if (recurring) {
                const rawAmount =
                    recurring.amount == null || recurring.amount === ""
                        ? ""
                        : String(recurring.amount);
                setEditingRecurringId(recurring.id);
                setRecurringForm(
                    buildRecurringForm({
                        description: recurring.description || "",
                        amount:
                            decimalSeparator === ","
                                ? rawAmount.replace(".", ",")
                                : rawAmount.replace(",", "."),
                        category: recurring.category
                            ? String(recurring.category)
                            : "",
                        linked_asset: recurring.linked_asset
                            ? String(recurring.linked_asset)
                            : "",
                        frequency: recurring.frequency || "MONTHLY",
                        day_of_month: String(recurring.day_of_month || 1),
                        month_of_year: recurring.month_of_year
                            ? String(recurring.month_of_year)
                            : "",
                        start_date: recurring.start_date || today(),
                        end_date: recurring.end_date || "",
                        is_active:
                            recurring.status != null
                                ? recurring.status === "ACTIVE"
                                : recurring.is_active !== false,
                        status:
                            recurring.status ||
                            (recurring.is_active === false
                                ? "DISABLED"
                                : "ACTIVE"),
                    }),
                );
            } else {
                setEditingRecurringId(null);
                setRecurringForm(buildRecurringForm());
            }
            setShowRecurringModal(true);
        },
        [
            decimalSeparator,
            setEditingRecurringId,
            setGenerateRecurringMsg,
            setRecurringError,
            setRecurringForm,
            setShowRecurringModal,
        ],
    );

    const closeRecurringModal = useCallback(() => {
        setShowRecurringModal(false);
        setEditingRecurringId(null);
        setRecurringError(null);
        setRecurringForm(buildRecurringForm());
    }, [
        setEditingRecurringId,
        setRecurringError,
        setRecurringForm,
        setShowRecurringModal,
    ]);

    const refreshRecurringMutation = useCallback(() => {
        fetchRecurringExpenses();
        refreshAfter(REFRESH_REASONS.RECURRING_GENERATED);
    }, [fetchRecurringExpenses, refreshAfter]);

    const submitRecurring = useCallback(async () => {
        if (guardDemo()) return false;
        const missing: string[] = [];
        if (!recurringForm.description.trim())
            missing.push(T("required_description"));
        if (!recurringForm.amount) missing.push(T("required_amount"));
        if (!recurringForm.start_date) missing.push(T("recurring_start_date"));
        if (missing.length) {
            setRecurringError(
                `${T("error_required_fields")} ${missing.join(", ")}`,
            );
            return false;
        }

        const parsedAmount = parseAmount(
            recurringForm.amount,
            decimalSeparator,
        );
        if (isNaN(parsedAmount) || parsedAmount <= 0) {
            setRecurringError(T("error_invalid_amount"));
            return false;
        }

        const dayNum = parseInt(recurringForm.day_of_month, 10);
        if (!Number.isFinite(dayNum) || dayNum < 1 || dayNum > 31) {
            setRecurringError(T("recurring_day_error"));
            return false;
        }
        if (recurringForm.frequency === "YEARLY") {
            const monthNum = parseInt(recurringForm.month_of_year, 10);
            if (!Number.isFinite(monthNum) || monthNum < 1 || monthNum > 12) {
                setRecurringError(T("recurring_month_error"));
                return false;
            }
        }

        const amount = parseMoneyToString(
            recurringForm.amount,
            decimalSeparator,
        );
        if (amount == null) {
            setRecurringError(T("error_invalid_amount"));
            return false;
        }
        const bodyPayload = {
            description: recurringForm.description.trim(),
            // CRIT-04: send the canonical decimal string (parseAmount above already
            // validated finiteness/sign) so the value never round-trips through Number.
            amount,
            category: recurringForm.category
                ? Number.parseInt(recurringForm.category, 10)
                : null,
            linked_asset: recurringForm.linked_asset
                ? Number.parseInt(recurringForm.linked_asset, 10)
                : null,
            frequency: recurringForm.frequency || "MONTHLY",
            day_of_month: dayNum,
            month_of_year:
                recurringForm.frequency === "YEARLY" &&
                recurringForm.month_of_year
                    ? parseInt(recurringForm.month_of_year, 10)
                    : null,
            is_active: recurringForm.is_active,
            status: recurringForm.is_active ? "ACTIVE" : "DISABLED",
            start_date: recurringForm.start_date,
            end_date: recurringForm.end_date || null,
        };

        setRecurringSaving(true);
        setRecurringError(null);
        try {
            const url = editingRecurringId
                ? `${API}/expenses/recurring/${editingRecurringId}/`
                : `${API}/expenses/recurring/`;
            const res = await apiFetch(url, {
                method: editingRecurringId ? "PATCH" : "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(bodyPayload),
            });
            if (!res.ok) {
                const err = (await res.json().catch(() => ({}))) as unknown;
                setRecurringError(
                    responseErrorMessage(err) || T("error_save_failed"),
                );
                return false;
            }
            closeRecurringModal();
            refreshRecurringMutation();
            return true;
        } catch {
            setRecurringError(T("error_network"));
            return false;
        } finally {
            setRecurringSaving(false);
        }
    }, [
        apiFetch,
        closeRecurringModal,
        decimalSeparator,
        editingRecurringId,
        guardDemo,
        recurringForm,
        refreshRecurringMutation,
        setRecurringError,
        setRecurringSaving,
        T,
    ]);

    const toggleRecurringStatus = useCallback(
        async (recurring: RecurringExpense) => {
            if (guardDemo()) return false;
            if (!recurring?.id) return false;
            const action = recurring.status === "ACTIVE" ? "disable" : "enable";
            setRecurringSaving(true);
            setRecurringError(null);
            try {
                const res = await apiFetch(
                    `${API}/expenses/recurring/${recurring.id}/${action}/`,
                    { method: "POST" },
                );
                if (!res.ok) {
                    const err = asApiMessage(
                        await res.json().catch(() => ({})),
                    );
                    setRecurringError(
                        typeof err.error === "string"
                            ? err.error
                            : T("error_save_failed"),
                    );
                    return false;
                }
                refreshRecurringMutation();
                return true;
            } catch {
                setRecurringError(T("error_network"));
                return false;
            } finally {
                setRecurringSaving(false);
            }
        },
        [
            apiFetch,
            guardDemo,
            refreshRecurringMutation,
            setRecurringError,
            setRecurringSaving,
            T,
        ],
    );

    const deleteRecurring = useCallback(
        async (recurring: RecurringExpense) => {
            if (guardDemo()) return false;
            if (!recurring?.id) return false;
            setRecurringSaving(true);
            setRecurringError(null);
            try {
                const res = await apiFetch(
                    `${API}/expenses/recurring/${recurring.id}/`,
                    { method: "DELETE" },
                );
                if (!res.ok) {
                    const err = asApiMessage(
                        await res.json().catch(() => ({})),
                    );
                    setRecurringError(
                        typeof err.error === "string"
                            ? err.error
                            : T("error_save_failed"),
                    );
                    return false;
                }
                refreshRecurringMutation();
                return true;
            } catch {
                setRecurringError(T("error_network"));
                return false;
            } finally {
                setRecurringSaving(false);
            }
        },
        [
            apiFetch,
            guardDemo,
            refreshRecurringMutation,
            setRecurringError,
            setRecurringSaving,
            T,
        ],
    );

    const generateRecurringForMonth = useCallback(
        async ({
            month = currentMonth,
            year = currentYear,
        }: GenerationPeriod = {}) => {
            if (guardDemo()) return null;
            setRecurringSaving(true);
            setRecurringError(null);
            try {
                const res = await apiFetch(
                    `${API}/expenses/recurring/generate/`,
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
                    setRecurringError(
                        typeof err.error === "string"
                            ? err.error
                            : T("error_save_failed"),
                    );
                    return null;
                }
                const data = asApiMessage(await res.json());
                setGenerateRecurringMsg(data);
                refreshRecurringMutation();
                return data;
            } catch {
                setRecurringError(T("error_network"));
                return null;
            } finally {
                setRecurringSaving(false);
            }
        },
        [
            apiFetch,
            guardDemo,
            refreshRecurringMutation,
            setGenerateRecurringMsg,
            setRecurringError,
            setRecurringSaving,
            T,
        ],
    );

    return {
        openRecurringModal,
        closeRecurringModal,
        submitRecurring,
        toggleRecurringStatus,
        deleteRecurring,
        generateRecurringForMonth,
    };
}
