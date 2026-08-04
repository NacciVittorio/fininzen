"use client";

import { useEffect, useMemo, useState } from "react";
import { useApp } from "../../context/useApp";
import { useSplit } from "../../context/split/useSplit";
import { BottomSheet, Card } from "../../components/ui";
import CategorySelect from "../../components/CategorySelect";
import Select from "../../components/Select";
import FieldLabel from "../../components/FieldLabel";
import AmountCalculator from "../../components/AmountCalculator";
import { useFormatters } from "../../utils/useFormatters";
import { filterAmountInput } from "../../utils/formatters";
import {
    resolveMySplitUserId,
    splitIdentityKey,
    splitMemberLabel,
} from "./splitIdentity";
import { SPLIT_COMPUTE_ERROR_KEYS } from "../../context/split/splitShareMath";
import type { SplitExpense, SplitGroup, SplitMethod } from "../../api/split";

type ParticipantCandidate = {
    key: string;
    user_id: number | null;
    contact_id: number | null;
    label: string;
    color?: string | null;
};

const METHODS: SplitMethod[] = ["equal", "exact", "percentage", "shares"];

// Create/edit form for a shared expense (piano sez. 1.5/7.5). `group=null`
// means a standalone "quick expense" (participants come from the contact
// book); a group passed in scopes participants to that group's own active
// members (SplitExpenseSerializer only accepts group members for a group
// expense, splitting/services.py::_resolve_participant). Category/account
// only ever show once the selected payer resolves to *me* — mirrors the
// backend rule that both must belong to the payer
// (SplitExpenseSerializer.validate).
export default function SplitExpenseFormModal({
    open,
    group,
    expense,
    onClose,
    onSaved,
}: {
    open: boolean;
    group: SplitGroup | null;
    expense?: SplitExpense | null;
    onClose: () => void;
    onSaved?: (expense: SplitExpense) => void;
}) {
    const { T, user, categories, bankAccounts, decimalSeparator } = useApp();
    const { formatEur } = useFormatters();
    const {
        contacts,
        groups,
        partnerLinksSent,
        partnerLinksReceived,
        splitExpenseForm,
        setSplitExpenseForm,
        splitExpenseFormError,
        splitExpenseFormSubmitting,
        resetSplitExpenseForm,
        loadSplitExpenseForEdit,
        addSplitExpenseParticipant,
        removeSplitExpenseParticipant,
        setSplitExpenseParticipantRawInput,
        setSplitExpenseParticipantPayer,
        splitExpenseComputedShares,
        splitExpenseComputeError,
        submitSplitExpenseForm,
    } = useSplit();

    const [addValue, setAddValue] = useState("");

    const mySplitUserId = resolveMySplitUserId({
        myEmail: user,
        groups,
        groupMembers: group?.members,
        partnerLinksSent,
        partnerLinksReceived,
    });

    const candidates: ParticipantCandidate[] = useMemo(() => {
        if (group) {
            return group.members
                .filter((member) => member.is_active)
                .map((member) => ({
                    key: splitIdentityKey({
                        user_id: member.user,
                        contact_id: member.contact,
                    }),
                    user_id: member.user,
                    contact_id: member.contact,
                    label: splitMemberLabel(member, {
                        myEmail: user,
                        contacts,
                        T,
                    }),
                    color: member.contact_color,
                }));
        }
        const list: ParticipantCandidate[] = [];
        if (mySplitUserId != null) {
            list.push({
                key: `user:${mySplitUserId}`,
                user_id: mySplitUserId,
                contact_id: null,
                label: T("split_you"),
            });
        }
        for (const contact of contacts) {
            if (contact.is_archived) continue;
            if (contact.linked_user != null) {
                list.push({
                    key: `user:${contact.linked_user}`,
                    user_id: contact.linked_user,
                    contact_id: null,
                    label: contact.display_name,
                    color: contact.color,
                });
            } else {
                list.push({
                    key: `contact:${contact.id}`,
                    user_id: null,
                    contact_id: contact.id,
                    label: contact.display_name,
                    color: contact.color,
                });
            }
        }
        return list;
    }, [group, contacts, mySplitUserId, user, T]);

    const candidatesByKey = useMemo(
        () =>
            new Map(candidates.map((candidate) => [candidate.key, candidate])),
        [candidates],
    );
    const availableCandidates = candidates.filter(
        (candidate) =>
            !splitExpenseForm.participants.some((p) => p.key === candidate.key),
    );

    const openKey = !open
        ? null
        : expense
          ? `edit:${expense.id}`
          : `new:${group?.id ?? "adhoc"}`;

    useEffect(() => {
        if (!openKey) return;
        if (expense) {
            loadSplitExpenseForEdit(expense);
            return;
        }
        resetSplitExpenseForm(group?.id ?? null);
        if (group) {
            group.members
                .filter((member) => member.is_active)
                .forEach((member) =>
                    addSplitExpenseParticipant({
                        user_id: member.user,
                        contact_id: member.contact,
                    }),
                );
        } else if (mySplitUserId != null) {
            addSplitExpenseParticipant({ user_id: mySplitUserId });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [openKey]);

    const payer = splitExpenseForm.participants.find((p) => p.isPayer) ?? null;
    const payerIsSelf =
        payer != null &&
        payer.user_id != null &&
        mySplitUserId != null &&
        payer.user_id === mySplitUserId;

    // Category/linked_asset only ever apply to the payer's own resources
    // (splitting/serializers.py::SplitExpenseSerializer.validate) — clear
    // them the moment the selected payer stops being "me" so a stale value
    // from an earlier payer never reaches submit.
    useEffect(() => {
        if (
            !payerIsSelf &&
            (splitExpenseForm.category != null ||
                splitExpenseForm.linkedAsset != null)
        ) {
            setSplitExpenseForm((prev) => ({
                ...prev,
                category: null,
                linkedAsset: null,
            }));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [payerIsSelf]);

    if (!open) return null;

    const title = expense ? T("split_expense_edit") : T("split_expense_new");
    const rawInputSuffix =
        splitExpenseForm.splitMethod === "percentage"
            ? "%"
            : splitExpenseForm.splitMethod === "shares"
              ? T("split_method_shares_unit")
              : "EUR";

    const hasComputeError =
        splitExpenseForm.participants.length > 0 &&
        splitExpenseComputeError != null;
    const computeErrorText = splitExpenseComputeError
        ? T(
              SPLIT_COMPUTE_ERROR_KEYS[splitExpenseComputeError] ??
                  "error_network",
          )
        : null;
    const displayError =
        splitExpenseFormError ?? (hasComputeError ? computeErrorText : null);

    const handleSubmit = async () => {
        const result = await submitSplitExpenseForm();
        if (result) {
            onSaved?.(result);
            onClose();
        }
    };

    return (
        <BottomSheet open onClose={onClose} ariaLabel={title}>
            <div style={{ padding: "0 18px" }}>
                <div
                    style={{
                        fontSize: 18,
                        fontWeight: 600,
                        color: "var(--fg)",
                        padding: "2px 2px 14px",
                    }}
                >
                    {title}
                </div>
                <div
                    style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 12,
                    }}
                >
                    {group && (
                        <div style={{ fontSize: 12, color: "var(--fg-soft)" }}>
                            {group.icon} {group.name}
                        </div>
                    )}
                    <div>
                        <FieldLabel
                            text={T("label_description")}
                            htmlFor="split-exp-description"
                        />
                        <input
                            id="split-exp-description"
                            className="inp"
                            data-testid="split-expense-description"
                            placeholder={T("placeholder_description")}
                            value={splitExpenseForm.description}
                            onChange={(event) =>
                                setSplitExpenseForm((prev) => ({
                                    ...prev,
                                    description: event.target.value,
                                }))
                            }
                        />
                    </div>
                    <div>
                        <FieldLabel
                            text={T("label_amount")}
                            htmlFor="split-exp-amount"
                        />
                        <AmountCalculator
                            id="split-exp-amount"
                            data-testid="split-expense-amount"
                            value={splitExpenseForm.amountText}
                            onChange={(amount) =>
                                setSplitExpenseForm((prev) => ({
                                    ...prev,
                                    amountText: amount,
                                }))
                            }
                            decimalSeparator={decimalSeparator}
                            placeholder={
                                decimalSeparator === "," ? "0,00" : "0.00"
                            }
                            suffix="EUR"
                            T={T}
                        />
                    </div>
                    <div>
                        <FieldLabel
                            text={T("label_date")}
                            htmlFor="split-exp-date"
                        />
                        <input
                            id="split-exp-date"
                            className="inp"
                            type="date"
                            value={splitExpenseForm.date}
                            onChange={(event) =>
                                setSplitExpenseForm((prev) => ({
                                    ...prev,
                                    date: event.target.value,
                                }))
                            }
                        />
                    </div>
                    <div>
                        <FieldLabel
                            text={T("split_method_label")}
                            htmlFor="split-exp-method"
                        />
                        <Select
                            id="split-exp-method"
                            data-testid="split-expense-method"
                            value={splitExpenseForm.splitMethod}
                            onChange={(value) =>
                                setSplitExpenseForm((prev) => ({
                                    ...prev,
                                    splitMethod: METHODS.includes(
                                        value as SplitMethod,
                                    )
                                        ? (value as SplitMethod)
                                        : prev.splitMethod,
                                }))
                            }
                            options={METHODS.map((method) => ({
                                value: method,
                                label: T(`split_method_${method}`),
                            }))}
                            placeholder=""
                        />
                    </div>

                    <div>
                        <FieldLabel text={T("split_participants_label")} />
                        {splitExpenseForm.participants.length === 0 && (
                            <div
                                style={{
                                    fontSize: 13,
                                    color: "var(--fg-soft)",
                                    marginBottom: 8,
                                }}
                            >
                                {T("split_participants_empty")}
                            </div>
                        )}
                        <div
                            style={{
                                display: "flex",
                                flexDirection: "column",
                            }}
                        >
                            {splitExpenseForm.participants.map((p) => {
                                const meta = candidatesByKey.get(p.key);
                                const computed =
                                    splitExpenseComputedShares?.find(
                                        (share) => share.key === p.key,
                                    ) ?? null;
                                return (
                                    <div
                                        key={p.key}
                                        data-testid={`split-expense-participant-${p.key}`}
                                        style={{
                                            display: "flex",
                                            alignItems: "center",
                                            gap: 8,
                                            padding: "8px 0",
                                            borderBottom:
                                                "1px solid var(--card-inset)",
                                        }}
                                    >
                                        <span
                                            aria-hidden="true"
                                            style={{
                                                width: 10,
                                                height: 10,
                                                borderRadius: "50%",
                                                background:
                                                    meta?.color ||
                                                    "var(--fg-soft)",
                                                flexShrink: 0,
                                            }}
                                        />
                                        <span
                                            style={{
                                                flex: 1,
                                                fontSize: 13,
                                                overflow: "hidden",
                                                textOverflow: "ellipsis",
                                                whiteSpace: "nowrap",
                                            }}
                                        >
                                            {meta?.label ?? p.key}
                                        </span>
                                        <label
                                            style={{
                                                display: "flex",
                                                alignItems: "center",
                                                gap: 4,
                                                fontSize: 11,
                                                color: "var(--fg-soft)",
                                                cursor: "pointer",
                                                whiteSpace: "nowrap",
                                            }}
                                        >
                                            <input
                                                type="radio"
                                                name="split-expense-payer"
                                                checked={p.isPayer}
                                                data-testid={`split-expense-payer-${p.key}`}
                                                onChange={() =>
                                                    setSplitExpenseParticipantPayer(
                                                        p.key,
                                                    )
                                                }
                                            />
                                            {T("split_payer_label")}
                                        </label>
                                        {splitExpenseForm.splitMethod !==
                                            "equal" && (
                                            <input
                                                className="inp"
                                                style={{
                                                    width: 64,
                                                    fontSize: 13,
                                                    padding: "6px 8px",
                                                }}
                                                value={p.rawInputText}
                                                data-testid={`split-expense-raw-input-${p.key}`}
                                                placeholder={rawInputSuffix}
                                                onChange={(event) =>
                                                    setSplitExpenseParticipantRawInput(
                                                        p.key,
                                                        filterAmountInput(
                                                            event.target.value,
                                                        ),
                                                    )
                                                }
                                            />
                                        )}
                                        <span
                                            style={{
                                                fontSize: 12,
                                                fontFamily: "var(--font-mono)",
                                                minWidth: 58,
                                                textAlign: "right",
                                                color: "var(--fg-soft)",
                                            }}
                                        >
                                            {computed?.amount != null
                                                ? formatEur(computed.amount)
                                                : "—"}
                                        </span>
                                        <button
                                            type="button"
                                            className="btn btn-g btn-sm"
                                            aria-label={T("btn_delete")}
                                            data-testid={`split-expense-remove-participant-${p.key}`}
                                            onClick={() =>
                                                removeSplitExpenseParticipant(
                                                    p.key,
                                                )
                                            }
                                        >
                                            ×
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                        {availableCandidates.length > 0 && (
                            <div style={{ marginTop: 8 }}>
                                <Select
                                    value={addValue}
                                    data-testid="split-expense-add-participant"
                                    onChange={(value) => {
                                        const candidate =
                                            candidatesByKey.get(value);
                                        if (candidate) {
                                            addSplitExpenseParticipant({
                                                user_id: candidate.user_id,
                                                contact_id:
                                                    candidate.contact_id,
                                            });
                                        }
                                        setAddValue("");
                                    }}
                                    options={availableCandidates.map(
                                        (candidate) => ({
                                            value: candidate.key,
                                            label: candidate.label,
                                            icon: (
                                                <span
                                                    aria-hidden="true"
                                                    style={{
                                                        width: 10,
                                                        height: 10,
                                                        borderRadius: "50%",
                                                        display: "inline-block",
                                                        background:
                                                            candidate.color ||
                                                            "var(--fg-soft)",
                                                    }}
                                                />
                                            ),
                                        }),
                                    )}
                                    placeholder={T(
                                        "split_participant_add_placeholder",
                                    )}
                                />
                            </div>
                        )}
                    </div>

                    {payerIsSelf && (
                        <>
                            <div>
                                <FieldLabel
                                    text={T("label_category")}
                                    htmlFor="split-exp-category"
                                />
                                <CategorySelect
                                    id="split-exp-category"
                                    value={splitExpenseForm.category ?? ""}
                                    onChange={(value) =>
                                        setSplitExpenseForm((prev) => ({
                                            ...prev,
                                            category: value
                                                ? Number(value)
                                                : null,
                                        }))
                                    }
                                    categoryType="expense"
                                    categories={categories}
                                    placeholder={T("no_category")}
                                    usePortal
                                />
                            </div>
                            <div>
                                <FieldLabel
                                    text={T("label_linked_asset")}
                                    htmlFor="split-exp-account"
                                />
                                <Select
                                    id="split-exp-account"
                                    usePortal
                                    data-testid="split-expense-account"
                                    value={
                                        splitExpenseForm.linkedAsset != null
                                            ? String(
                                                  splitExpenseForm.linkedAsset,
                                              )
                                            : ""
                                    }
                                    onChange={(value) =>
                                        setSplitExpenseForm((prev) => ({
                                            ...prev,
                                            linkedAsset: value
                                                ? Number(value)
                                                : null,
                                        }))
                                    }
                                    placeholder={T("no_linked_asset")}
                                    options={bankAccounts.map((account) => ({
                                        value: String(account.id),
                                        label: `${account.investment_type_detail?.icon || ""} ${account.name}`.trim(),
                                    }))}
                                />
                            </div>
                        </>
                    )}

                    <div>
                        <FieldLabel
                            text={T("label_notes")}
                            htmlFor="split-exp-notes"
                        />
                        <textarea
                            id="split-exp-notes"
                            className="inp"
                            rows={2}
                            data-testid="split-expense-notes"
                            value={splitExpenseForm.notes}
                            onChange={(event) =>
                                setSplitExpenseForm((prev) => ({
                                    ...prev,
                                    notes: event.target.value,
                                }))
                            }
                        />
                    </div>

                    {displayError && (
                        <Card
                            tone="danger"
                            data-testid="split-expense-error"
                            style={{
                                padding: "8px 10px",
                                fontSize: 12,
                                color: "var(--danger)",
                            }}
                        >
                            {displayError}
                        </Card>
                    )}

                    <div
                        className="row"
                        style={{
                            justifyContent: "flex-end",
                            gap: 8,
                            marginTop: 8,
                        }}
                    >
                        <button className="btn btn-g" onClick={onClose}>
                            {T("btn_cancel")}
                        </button>
                        <button
                            className="btn btn-p"
                            data-testid="split-expense-submit"
                            disabled={
                                splitExpenseFormSubmitting || hasComputeError
                            }
                            onClick={handleSubmit}
                        >
                            {splitExpenseFormSubmitting
                                ? "…"
                                : expense
                                  ? T("btn_update")
                                  : T("btn_add")}
                        </button>
                    </div>
                </div>
            </div>
        </BottomSheet>
    );
}
