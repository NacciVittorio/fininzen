import { useCallback } from "react";
import { API } from "../utils/api";
import { parseMoneyToString, resolveAmountField } from "../utils/formatters";
import { REFRESH_REASONS } from "../utils/refreshReasons";
import { buildTransferForm } from "./formBuilders";
import type { ApiFetcher } from "../api/client";
import type { Translator } from "../types";
import type { DecimalSeparator } from "../utils/formatters";
import type { RefreshReason } from "../utils/refreshReasons";
import type { TransactionPreferences } from "./appContextHelpers";
import type { AppProviderState } from "./useAppProviderState";

type TransferActionState = Pick<
    AppProviderState,
    | "setShowTransferModal"
    | "setTransferError"
    | "setTransferForm"
    | "setTransferLoading"
    | "setTransferWarning"
    | "transferForm"
>;

export type TransferActionsOptions = TransferActionState & {
    T: Translator;
    apiFetch: ApiFetcher;
    closeExpenseModal: () => void;
    decimalSeparator: DecimalSeparator;
    guardDemo: () => boolean;
    refreshAfter: (reason: RefreshReason) => unknown;
    transactionPrefs: TransactionPreferences;
};

type TransferResponse = { error?: string; warning?: unknown };

export function useTransferActions({
    apiFetch,
    closeExpenseModal,
    decimalSeparator,
    guardDemo,
    refreshAfter,
    setShowTransferModal,
    setTransferError,
    setTransferForm,
    setTransferLoading,
    setTransferWarning,
    T,
    transactionPrefs,
    transferForm,
}: TransferActionsOptions) {
    // ── Transfer ──

    const openTransferModal = useCallback(() => {
        setTransferForm(
            buildTransferForm({
                is_verified: transactionPrefs.cashflow_default_verified,
            }),
        );
        setTransferWarning(null);
        setTransferError(null);
        setShowTransferModal(true);
    }, [
        setShowTransferModal,
        setTransferError,
        setTransferForm,
        setTransferWarning,
        transactionPrefs.cashflow_default_verified,
    ]);

    const closeTransferModal = useCallback(() => {
        setShowTransferModal(false);
        setTransferWarning(null);
        setTransferError(null);
    }, [setShowTransferModal, setTransferError, setTransferWarning]);

    const submitTransfer = useCallback(async () => {
        if (guardDemo()) return;
        if (
            !transferForm.from_account_id ||
            !transferForm.to_account_id ||
            !transferForm.amount
        ) {
            setTransferError(T("tx_error_fields"));
            return;
        }
        // resolveAmountField also settles an uncommitted calculator expression
        // ("12,50+8,30"), which the field normally resolves on blur.
        const resolvedStandalone = resolveAmountField(
            transferForm.amount,
            decimalSeparator,
        );
        if (!resolvedStandalone.ok || resolvedStandalone.value <= 0) {
            // Used to clear the error and bail, leaving the button looking
            // dead — same fix as submitExpense.
            setTransferError(T("error_invalid_amount"));
            return;
        }
        setTransferLoading(true);
        setTransferError(null);
        setTransferWarning(null);
        try {
            const amount = parseMoneyToString(
                resolvedStandalone.text,
                decimalSeparator,
            );
            if (amount == null) {
                setTransferError(T("error_invalid_amount"));
                return;
            }
            const res = await apiFetch(`${API}/portfolio/transfer/`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    ...transferForm,
                    // CRIT-04: canonical decimal string (validated above via resolveAmountField).
                    amount,
                }),
            });
            if (!res.ok) {
                const err = (await res
                    .json()
                    .catch(() => ({}))) as TransferResponse;
                setTransferError(err.error || T("error_save_failed"));
                return;
            }
            const data = (await res.json()) as TransferResponse;
            if (data.warning) {
                setTransferWarning(T("balance_warning"));
            }
            closeTransferModal();
            refreshAfter(REFRESH_REASONS.TRANSFER_COMPLETED);
        } catch {
            setTransferError(T("error_network"));
        } finally {
            setTransferLoading(false);
        }
    }, [
        apiFetch,
        transferForm,
        refreshAfter,
        closeTransferModal,
        decimalSeparator,
        guardDemo,
        setTransferError,
        setTransferLoading,
        setTransferWarning,
        T,
    ]);

    const submitTransferInCfModal = useCallback(async () => {
        if (guardDemo()) return;
        if (
            !transferForm.from_account_id ||
            !transferForm.to_account_id ||
            !transferForm.amount
        ) {
            setTransferError(T("tx_error_fields"));
            return;
        }
        const resolvedTransferAmount = resolveAmountField(
            transferForm.amount,
            decimalSeparator,
        );
        if (!resolvedTransferAmount.ok || resolvedTransferAmount.value <= 0) {
            setTransferError(T("error_invalid_amount"));
            return;
        }
        setTransferLoading(true);
        setTransferError(null);
        setTransferWarning(null);
        try {
            const amount = parseMoneyToString(
                resolvedTransferAmount.text,
                decimalSeparator,
            );
            if (amount == null) {
                setTransferError(T("error_invalid_amount"));
                return;
            }
            const res = await apiFetch(`${API}/portfolio/transfer/`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    // CRIT-04: canonical decimal string (validated above via resolveAmountField).
                    ...transferForm,
                    amount,
                }),
            });
            if (!res.ok) {
                const err = (await res
                    .json()
                    .catch(() => ({}))) as TransferResponse;
                setTransferError(err.error || T("error_save_failed"));
                return;
            }
            const data = (await res.json()) as TransferResponse;
            if (data.warning) setTransferWarning(T("balance_warning"));
            closeExpenseModal();
            refreshAfter(REFRESH_REASONS.TRANSFER_COMPLETED);
        } catch {
            setTransferError(T("error_network"));
        } finally {
            setTransferLoading(false);
        }
    }, [
        apiFetch,
        transferForm,
        refreshAfter,
        closeExpenseModal,
        decimalSeparator,
        guardDemo,
        setTransferError,
        setTransferLoading,
        setTransferWarning,
        T,
    ]);

    return {
        openTransferModal,
        closeTransferModal,
        submitTransfer,
        submitTransferInCfModal,
    };
}
