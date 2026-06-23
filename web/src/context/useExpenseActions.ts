import { API } from "../utils/api";
import { parseAmount, parseMoneyToString, today } from "../utils/formatters";
import { REFRESH_REASONS } from "../utils/refreshReasons";
import { buildExpenseForm, buildTransferForm } from "./formBuilders";
import type { ApiFetcher } from "../api/client";
import type { EntityId } from "./feedTypes";
import type { Translator } from "../types";
import type { DecimalSeparator } from "../utils/formatters";
import type { RefreshReason } from "../utils/refreshReasons";
import type { AppProviderState } from "./useAppProviderState";
import type { TransactionPreferences } from "./appContextHelpers";

type ExpenseActionState = Pick<
    AppProviderState,
    | "cashflowDir"
    | "categories"
    | "editingExpenseId"
    | "expForm"
    | "setDeleteExpenseTarget"
    | "setEditingExpenseId"
    | "setExpError"
    | "setExpForm"
    | "setModalDir"
    | "setShowExpModal"
    | "setTransferError"
    | "setTransferForm"
    | "setTransferWarning"
>;

// Prefill payload for opening the expense modal in edit mode. The cashflow feed
// supplies EntityId-typed ids (number | string) sourced from a CashflowFeedItem,
// so this is deliberately looser than the generated Expense DTO.
export type ExpensePrefill = {
    id?: EntityId | null;
    description?: string | null;
    amount?: string | number | null;
    category?: EntityId | null;
    date?: string | null;
    linked_asset?: EntityId | null;
    is_verified?: boolean | null;
};

export type ExpenseActionsOptions = ExpenseActionState & {
    T: Translator;
    apiFetch: ApiFetcher;
    decimalSeparator: DecimalSeparator;
    guardDemo: () => boolean;
    refreshAfter: (reason: RefreshReason) => unknown;
    transactionPrefs: TransactionPreferences;
};

const responseErrorMessage = (payload: unknown): string => {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        return "";
    }
    return Object.values(payload).flat().filter(Boolean).join(" ");
};

export function useExpenseActions({
    apiFetch,
    cashflowDir,
    categories,
    decimalSeparator,
    editingExpenseId,
    expForm,
    guardDemo,
    refreshAfter,
    setDeleteExpenseTarget,
    setEditingExpenseId,
    setExpError,
    setExpForm,
    setModalDir,
    setShowExpModal,
    setTransferError,
    setTransferForm,
    setTransferWarning,
    T,
    transactionPrefs,
}: ExpenseActionsOptions) {
    // ── Expense actions ──

    const openExpenseModal = (expense: ExpensePrefill | null = null): void => {
        setExpError(null);
        if (expense) {
            const prefillAmount = (() => {
                if (expense.amount == null || expense.amount === "") return "";
                const raw = String(expense.amount);
                return decimalSeparator === ","
                    ? raw.replace(".", ",")
                    : raw.replace(",", ".");
            })();
            setEditingExpenseId(expense.id ?? null);
            const cat = categories.find((c) => c.id === expense.category);
            setModalDir(cat?.category_type === "income" ? "income" : "expense");
            setExpForm(
                buildExpenseForm({
                    description: expense.description || "",
                    amount: prefillAmount,
                    category: expense.category ? String(expense.category) : "",
                    date: expense.date || today(),
                    linked_asset: expense.linked_asset
                        ? String(expense.linked_asset)
                        : "",
                    is_verified: expense.is_verified ?? false,
                }),
            );
        } else {
            setEditingExpenseId(null);
            setModalDir(cashflowDir);
            setExpForm(
                buildExpenseForm({
                    is_verified: transactionPrefs.cashflow_default_verified,
                }),
            );
        }
        setShowExpModal(true);
    };

    const closeExpenseModal = () => {
        setShowExpModal(false);
        setEditingExpenseId(null);
        setExpError(null);
        setExpForm(buildExpenseForm());
        setTransferForm(buildTransferForm());
        setTransferWarning(null);
        setTransferError(null);
    };

    const submitExpense = async () => {
        if (guardDemo()) return;
        const missing: string[] = [];
        if (!expForm.description) missing.push(T("required_description"));
        if (!expForm.amount) missing.push(T("required_amount"));
        if (!expForm.category) missing.push(T("required_category"));
        if (missing.length) {
            setExpError(`${T("error_required_fields")} ${missing.join(", ")}`);
            return;
        }
        const parsedExpAmount = parseAmount(expForm.amount, decimalSeparator);
        if (isNaN(parsedExpAmount) || parsedExpAmount <= 0) {
            setExpError(null);
            return;
        }
        setExpError(null);
        const url = editingExpenseId
            ? `${API}/expenses/${editingExpenseId}/`
            : `${API}/expenses/`;
        const canonicalAmount = parseMoneyToString(
            expForm.amount,
            decimalSeparator,
        );
        if (canonicalAmount == null) {
            setExpError(T("error_invalid_amount"));
            return;
        }
        const body = {
            ...expForm,
            // CRIT-04: canonical decimal string (validated above via parseAmount).
            amount: canonicalAmount,
            category: expForm.category || null,
            linked_asset: expForm.linked_asset
                ? Number.parseInt(expForm.linked_asset, 10)
                : null,
            is_verified: expForm.is_verified,
        };
        const res = await apiFetch(url, {
            method: editingExpenseId ? "PATCH" : "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
        if (!res.ok) {
            const err = (await res.json().catch(() => ({}))) as unknown;
            setExpError(responseErrorMessage(err) || T("error_save_failed"));
            return;
        }
        closeExpenseModal();
        refreshAfter(
            editingExpenseId
                ? REFRESH_REASONS.EXPENSE_UPDATED
                : REFRESH_REASONS.EXPENSE_CREATED,
        );
    };

    const deleteExpense = async (id: number | string): Promise<void> => {
        if (guardDemo()) return;
        await apiFetch(`${API}/expenses/${id}/`, { method: "DELETE" });
        setDeleteExpenseTarget(null);
        refreshAfter(REFRESH_REASONS.EXPENSE_DELETED);
    };

    return {
        openExpenseModal,
        closeExpenseModal,
        submitExpense,
        deleteExpense,
    };
}
