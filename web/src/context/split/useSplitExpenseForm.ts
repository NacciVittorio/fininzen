import { useCallback, useMemo, useState } from "react";
import { createSplitExpense, updateSplitExpense } from "../../api/split";
import type {
    SplitExpense,
    SplitExpenseParticipantInput,
    SplitMethod,
} from "../../api/split";
import type { ApiFetcher } from "../../api/client";
import type { Translator } from "../../types";
import {
    isValidAmount,
    parseAmount,
    parseMoneyToString,
} from "../../utils/formatters";
import type { DecimalSeparator } from "../../utils/formatters";
import { splitApiErrorMessage } from "./splitApiError";
import {
    computeEqualShares,
    computeExactShares,
    computePercentageShares,
    computeWeightedShares,
} from "./splitShareMath";
import type { SplitShareComputeError } from "./splitShareMath";

export type SplitExpenseFormParticipant = {
    // Stable identity/react key: "user:<id>" | "contact:<id>".
    key: string;
    user_id: number | null;
    contact_id: number | null;
    // Free-typed field, meaning depends on splitMethod: unused for "equal",
    // an exact amount for "exact", a percentage (0-100) for "percentage", a
    // relative weight for "shares". Decimal-separator aware like every other
    // amount field in the app.
    rawInputText: string;
    isPayer: boolean;
};

export type SplitExpenseFormState = {
    id: number | null; // editing id; null while creating
    group: number | null;
    description: string;
    amountText: string;
    date: string;
    splitMethod: SplitMethod;
    category: number | null;
    linkedAsset: number | null;
    notes: string;
    participants: SplitExpenseFormParticipant[];
};

export type SplitExpenseComputeError =
    SplitShareComputeError | "invalid_amount" | "invalid_input";

export type SplitExpenseComputedShare = {
    key: string;
    amount: number | null;
};

const todayIso = (): string => new Date().toISOString().slice(0, 10);

const participantKey = (identity: {
    user_id?: number | null;
    contact_id?: number | null;
}): string =>
    identity.user_id
        ? `user:${identity.user_id}`
        : `contact:${identity.contact_id}`;

export const emptySplitExpenseForm = (
    group: number | null = null,
): SplitExpenseFormState => ({
    id: null,
    group,
    description: "",
    amountText: "",
    date: todayIso(),
    splitMethod: "equal",
    category: null,
    linkedAsset: null,
    notes: "",
    participants: [],
});

type UseSplitExpenseFormArgs = {
    T: Translator;
    apiFetch: ApiFetcher;
    guardDemo: () => boolean;
    decimalSeparator: DecimalSeparator;
};

// Expense create/edit form state + live share preview for all 4 split
// methods (piano sez. 3.1/7.4). The live preview mirrors
// splitting/services.py's compute_*_shares purely client-side (see
// splitShareMath.ts) for instant feedback; the backend recomputes and is the
// only authoritative validator on submit.
export function useSplitExpenseForm({
    T,
    apiFetch,
    guardDemo,
    decimalSeparator,
}: UseSplitExpenseFormArgs) {
    const [splitExpenseForm, setSplitExpenseForm] =
        useState<SplitExpenseFormState>(() => emptySplitExpenseForm());
    const [splitExpenseFormError, setSplitExpenseFormError] = useState<
        string | null
    >(null);
    const [splitExpenseFormSubmitting, setSplitExpenseFormSubmitting] =
        useState(false);

    const resetSplitExpenseForm = useCallback((group: number | null = null) => {
        setSplitExpenseForm(emptySplitExpenseForm(group));
        setSplitExpenseFormError(null);
    }, []);

    // Rebuild the form from an existing expense's persisted shares, for edit.
    const loadSplitExpenseForEdit = useCallback(
        (expense: SplitExpense) => {
            setSplitExpenseForm({
                id: expense.id,
                group: expense.group ?? null,
                description: expense.description,
                amountText: String(expense.amount).replace(
                    ".",
                    decimalSeparator === "." ? "." : ",",
                ),
                date: expense.date,
                splitMethod: expense.split_method ?? "equal",
                category: expense.category ?? null,
                linkedAsset: expense.linked_asset ?? null,
                notes: expense.notes ?? "",
                participants: expense.shares.map((share) => ({
                    key: participantKey({
                        user_id: share.participant_user_id,
                        contact_id: share.participant_contact_id,
                    }),
                    user_id: share.participant_user_id,
                    contact_id: share.participant_contact_id,
                    rawInputText:
                        share.raw_input != null
                            ? String(share.raw_input).replace(
                                  ".",
                                  decimalSeparator === "." ? "." : ",",
                              )
                            : "",
                    isPayer: share.is_payer,
                })),
            });
            setSplitExpenseFormError(null);
        },
        [decimalSeparator],
    );

    const addSplitExpenseParticipant = useCallback(
        (identity: { user_id?: number | null; contact_id?: number | null }) => {
            const key = participantKey(identity);
            setSplitExpenseForm((prev) => {
                if (prev.participants.some((p) => p.key === key)) return prev;
                return {
                    ...prev,
                    participants: [
                        ...prev.participants,
                        {
                            key,
                            user_id: identity.user_id ?? null,
                            contact_id: identity.contact_id ?? null,
                            rawInputText: "",
                            isPayer: prev.participants.length === 0,
                        },
                    ],
                };
            });
        },
        [],
    );

    const removeSplitExpenseParticipant = useCallback((key: string) => {
        setSplitExpenseForm((prev) => ({
            ...prev,
            participants: prev.participants.filter((p) => p.key !== key),
        }));
    }, []);

    const setSplitExpenseParticipantRawInput = useCallback(
        (key: string, rawInputText: string) => {
            setSplitExpenseForm((prev) => ({
                ...prev,
                participants: prev.participants.map((p) =>
                    p.key === key ? { ...p, rawInputText } : p,
                ),
            }));
        },
        [],
    );

    // Exactly one payer at a time (single-payer constraint, piano sez. 1.5) —
    // selecting a new one always clears the previous.
    const setSplitExpenseParticipantPayer = useCallback((key: string) => {
        setSplitExpenseForm((prev) => ({
            ...prev,
            participants: prev.participants.map((p) => ({
                ...p,
                isPayer: p.key === key,
            })),
        }));
    }, []);

    const computed = useMemo((): {
        shares: SplitExpenseComputedShare[] | null;
        error: SplitExpenseComputeError | null;
    } => {
        const { amountText, splitMethod, participants } = splitExpenseForm;
        if (!participants.length) return { shares: null, error: null };
        if (!isValidAmount(amountText, decimalSeparator)) {
            return { shares: null, error: "invalid_amount" };
        }
        const total = parseAmount(amountText, decimalSeparator);

        if (splitMethod === "equal") {
            const result = computeEqualShares(total, participants.length);
            if (!result.ok) return { shares: null, error: result.error };
            return {
                shares: participants.map((p, i) => ({
                    key: p.key,
                    amount: result.shares[i] ?? null,
                })),
                error: null,
            };
        }

        const rawValues = participants.map((p) =>
            parseAmount(p.rawInputText, decimalSeparator),
        );
        if (rawValues.some((v) => !Number.isFinite(v))) {
            return { shares: null, error: "invalid_input" };
        }

        const result =
            splitMethod === "exact"
                ? computeExactShares(total, rawValues)
                : splitMethod === "percentage"
                  ? computePercentageShares(total, rawValues)
                  : computeWeightedShares(total, rawValues);
        if (!result.ok) return { shares: null, error: result.error };
        return {
            shares: participants.map((p, i) => ({
                key: p.key,
                amount: result.shares[i] ?? null,
            })),
            error: null,
        };
    }, [splitExpenseForm, decimalSeparator]);

    const buildParticipantsPayload = useCallback(():
        SplitExpenseParticipantInput[] | null => {
        const { splitMethod, participants } = splitExpenseForm;
        const payload: SplitExpenseParticipantInput[] = [];
        for (const p of participants) {
            let raw_input: string | null = null;
            if (splitMethod !== "equal") {
                raw_input = parseMoneyToString(
                    p.rawInputText,
                    decimalSeparator,
                );
                if (raw_input == null) return null;
            }
            payload.push({
                user_id: p.user_id,
                contact_id: p.contact_id,
                raw_input,
                is_payer: p.isPayer,
            });
        }
        return payload;
    }, [splitExpenseForm, decimalSeparator]);

    const submitSplitExpenseForm =
        useCallback(async (): Promise<SplitExpense | null> => {
            if (guardDemo()) return null;
            const {
                id,
                group,
                description,
                amountText,
                date,
                splitMethod,
                category,
                linkedAsset,
                notes,
            } = splitExpenseForm;
            const amount = parseMoneyToString(amountText, decimalSeparator);
            if (!amount || !description.trim()) {
                setSplitExpenseFormError(T("error_invalid_amount"));
                return null;
            }
            const participants = buildParticipantsPayload();
            if (!participants || !participants.length) {
                setSplitExpenseFormError(
                    T("split_error_participants_required"),
                );
                return null;
            }
            if (!participants.some((p) => p.is_payer)) {
                setSplitExpenseFormError(
                    T("split_error_single_payer_required"),
                );
                return null;
            }
            setSplitExpenseFormSubmitting(true);
            setSplitExpenseFormError(null);
            try {
                const payload = {
                    group,
                    description: description.trim(),
                    amount,
                    date,
                    split_method: splitMethod,
                    category,
                    linked_asset: linkedAsset,
                    notes,
                    participants,
                };
                const result = id
                    ? await updateSplitExpense(apiFetch, id, payload)
                    : await createSplitExpense(apiFetch, payload);
                return result;
            } catch (error) {
                setSplitExpenseFormError(splitApiErrorMessage(error, T));
                return null;
            } finally {
                setSplitExpenseFormSubmitting(false);
            }
        }, [
            apiFetch,
            guardDemo,
            T,
            decimalSeparator,
            splitExpenseForm,
            buildParticipantsPayload,
        ]);

    return {
        splitExpenseForm,
        setSplitExpenseForm,
        splitExpenseFormError,
        setSplitExpenseFormError,
        splitExpenseFormSubmitting,
        resetSplitExpenseForm,
        loadSplitExpenseForEdit,
        addSplitExpenseParticipant,
        removeSplitExpenseParticipant,
        setSplitExpenseParticipantRawInput,
        setSplitExpenseParticipantPayer,
        splitExpenseComputedShares: computed.shares,
        splitExpenseComputeError: computed.error,
        submitSplitExpenseForm,
    };
}
