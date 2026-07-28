"use client";

import { useEffect, useMemo, useState } from "react";
import { useApp } from "../../context/useApp";
import { useSplit } from "../../context/split/useSplit";
import { BottomSheet, Card } from "../../components/ui";
import CategorySelect from "../../components/CategorySelect";
import Select from "../../components/Select";
import FieldLabel from "../../components/FieldLabel";
import { useFormatters } from "../../utils/useFormatters";
import {
    filterAmountInput,
    isValidAmount,
    parseAmount,
    parseMoneyToString,
} from "../../utils/formatters";
import {
    computeEqualShares,
    computeExactShares,
    computePercentageShares,
    computeWeightedShares,
} from "../../context/split/splitShareMath";
import {
    resolveMySplitUserId,
    splitIdentityKey,
    splitMemberLabel,
} from "./splitIdentity";
import type {
    SplitExpenseParticipantInput,
    SplitGroup,
    SplitMethod,
    SplitRecurringExpense,
    SplitRecurringFrequency,
} from "../../api/split";

const METHODS: SplitMethod[] = ["equal", "exact", "percentage", "shares"];

type RecurringParticipantRow = {
    key: string;
    user_id: number | null;
    contact_id: number | null;
    rawInputText: string;
    isPayer: boolean;
};

type RecurringFormState = {
    id: number | null;
    description: string;
    amountText: string;
    splitMethod: SplitMethod;
    frequency: SplitRecurringFrequency;
    dayOfMonth: string;
    monthOfYear: string;
    startDate: string;
    endDate: string;
    category: number | null;
    linkedAsset: number | null;
    participants: RecurringParticipantRow[];
};

const todayIso = (): string => new Date().toISOString().slice(0, 10);

const emptyForm = (): RecurringFormState => ({
    id: null,
    description: "",
    amountText: "",
    splitMethod: "equal",
    frequency: "MONTHLY",
    dayOfMonth: "1",
    monthOfYear: String(new Date().getMonth() + 1),
    startDate: todayIso(),
    endDate: "",
    category: null,
    linkedAsset: null,
    participants: [],
});

// Group recurring expenses (piano sez. 1.7/3.4/7.5) — CRUD scoped to one
// group (a recurrence always needs a stable roster, piano sez. 1.7). Mirrors
// RecurringExpensesSection.tsx's list+generate shape, with a participant
// editor that mirrors SplitExpenseFormModal's (duplicated rather than
// shared: this form's rows are plain local state, not the
// useSplitExpenseForm hook, since that hook is wired to SplitExpense
// create/update, not SplitRecurringExpense).
export default function SplitRecurringSection({
    group,
}: {
    group: SplitGroup;
}) {
    const {
        T,
        user,
        categories,
        assets,
        bankAccounts,
        decimalSeparator,
        guardDemo,
    } = useApp();
    const { formatEur } = useFormatters();
    const {
        contacts,
        groups,
        partnerLinksSent,
        partnerLinksReceived,
        recurrings,
        recurringLoading,
        recurringError,
        loadSplitRecurring,
        addSplitRecurring,
        editSplitRecurring,
        removeSplitRecurring,
        toggleSplitRecurring,
        runSplitRecurringGenerate,
    } = useSplit();

    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState<RecurringFormState>(emptyForm);
    const [submitting, setSubmitting] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);
    const [generating, setGenerating] = useState(false);
    const [generateMsg, setGenerateMsg] = useState<{
        created: number;
        skipped: number;
    } | null>(null);

    useEffect(() => {
        loadSplitRecurring();
    }, [loadSplitRecurring]);

    const groupRecurrings = recurrings.filter(
        (r) => String(r.group) === String(group.id),
    );

    const mySplitUserId = resolveMySplitUserId({
        myEmail: user,
        groups,
        groupMembers: group.members,
        partnerLinksSent,
        partnerLinksReceived,
    });

    const candidates = useMemo(
        () =>
            group.members
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
                })),
        [group.members, contacts, user, T],
    );
    const candidatesByKey = useMemo(
        () =>
            new Map(candidates.map((candidate) => [candidate.key, candidate])),
        [candidates],
    );
    const availableCandidates = candidates.filter(
        (candidate) => !form.participants.some((p) => p.key === candidate.key),
    );

    const computed = useMemo((): {
        shares: number[] | null;
        error: string | null;
    } => {
        if (!form.participants.length) return { shares: null, error: null };
        if (!isValidAmount(form.amountText, decimalSeparator)) {
            return { shares: null, error: "invalid_amount" };
        }
        const total = parseAmount(form.amountText, decimalSeparator);
        if (form.splitMethod === "equal") {
            const result = computeEqualShares(total, form.participants.length);
            return result.ok
                ? { shares: result.shares, error: null }
                : { shares: null, error: result.error };
        }
        const raw = form.participants.map((p) =>
            parseAmount(p.rawInputText, decimalSeparator),
        );
        if (raw.some((v) => !Number.isFinite(v))) {
            return { shares: null, error: "invalid_input" };
        }
        const result =
            form.splitMethod === "exact"
                ? computeExactShares(total, raw)
                : form.splitMethod === "percentage"
                  ? computePercentageShares(total, raw)
                  : computeWeightedShares(total, raw);
        return result.ok
            ? { shares: result.shares, error: null }
            : { shares: null, error: result.error };
    }, [form, decimalSeparator]);

    const payer = form.participants.find((p) => p.isPayer) ?? null;
    const payerIsSelf =
        payer != null &&
        payer.user_id != null &&
        mySplitUserId != null &&
        payer.user_id === mySplitUserId;

    useEffect(() => {
        if (
            !payerIsSelf &&
            (form.category != null || form.linkedAsset != null)
        ) {
            setForm((prev) => ({ ...prev, category: null, linkedAsset: null }));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [payerIsSelf]);

    const openCreateForm = () => {
        const seededParticipants: RecurringParticipantRow[] = group.members
            .filter((member) => member.is_active)
            .map((member, index) => ({
                key: splitIdentityKey({
                    user_id: member.user,
                    contact_id: member.contact,
                }),
                user_id: member.user,
                contact_id: member.contact,
                rawInputText: "",
                isPayer: index === 0,
            }));
        setForm({ ...emptyForm(), participants: seededParticipants });
        setFormError(null);
        setShowForm(true);
    };

    const openEditForm = (recurring: SplitRecurringExpense) => {
        setForm({
            id: recurring.id,
            description: recurring.description,
            amountText: String(recurring.amount).replace(
                ".",
                decimalSeparator === "," ? "," : ".",
            ),
            splitMethod: recurring.split_method ?? "equal",
            frequency: recurring.frequency ?? "MONTHLY",
            dayOfMonth: String(recurring.day_of_month ?? 1),
            monthOfYear: String(
                recurring.month_of_year ?? new Date().getMonth() + 1,
            ),
            startDate: recurring.start_date,
            endDate: recurring.end_date ?? "",
            category: recurring.category ?? null,
            linkedAsset: recurring.linked_asset ?? null,
            participants: recurring.participant_templates.map((tpl) => ({
                key: splitIdentityKey({
                    user_id: tpl.participant_user_id,
                    contact_id: tpl.participant_contact_id,
                }),
                user_id: tpl.participant_user_id,
                contact_id: tpl.participant_contact_id,
                rawInputText:
                    tpl.raw_input != null
                        ? String(tpl.raw_input).replace(
                              ".",
                              decimalSeparator === "," ? "," : ".",
                          )
                        : "",
                isPayer: tpl.is_payer,
            })),
        });
        setFormError(null);
        setShowForm(true);
    };

    const handleSubmit = async () => {
        if (guardDemo()) return;
        const amount = parseMoneyToString(form.amountText, decimalSeparator);
        if (!amount || !form.description.trim() || !form.participants.length) {
            setFormError(T("error_invalid_amount"));
            return;
        }
        if (!form.participants.some((p) => p.isPayer)) {
            setFormError(T("error_invalid_amount"));
            return;
        }
        const participants: SplitExpenseParticipantInput[] = [];
        for (const p of form.participants) {
            let raw_input: string | null = null;
            if (form.splitMethod !== "equal") {
                raw_input = parseMoneyToString(
                    p.rawInputText,
                    decimalSeparator,
                );
                if (raw_input == null) {
                    setFormError(T("error_invalid_amount"));
                    return;
                }
            }
            participants.push({
                user_id: p.user_id,
                contact_id: p.contact_id,
                raw_input,
                is_payer: p.isPayer,
            });
        }
        setSubmitting(true);
        setFormError(null);
        const payload = {
            group: group.id,
            description: form.description.trim(),
            amount,
            split_method: form.splitMethod,
            category: form.category,
            linked_asset: form.linkedAsset,
            frequency: form.frequency,
            day_of_month: Number(form.dayOfMonth) || 1,
            month_of_year:
                form.frequency === "YEARLY"
                    ? Number(form.monthOfYear) || 1
                    : null,
            start_date: form.startDate,
            end_date: form.endDate || null,
            participants,
        };
        const result = form.id
            ? await editSplitRecurring(form.id, payload)
            : await addSplitRecurring(payload);
        setSubmitting(false);
        if (result) {
            setShowForm(false);
        } else {
            setFormError(recurringError ?? T("error_network"));
        }
    };

    const handleGenerate = async () => {
        setGenerating(true);
        const now = new Date();
        const result = await runSplitRecurringGenerate(
            now.getMonth() + 1,
            now.getFullYear(),
        );
        setGenerating(false);
        if (result) setGenerateMsg(result);
    };

    return (
        <div data-testid="split-recurring-section">
            <div
                className="between"
                style={{ alignItems: "center", marginBottom: 10 }}
            >
                <div className="grouped-list__title" style={{ margin: 0 }}>
                    {T("split_recurring_title")}
                </div>
                <div className="row" style={{ gap: 8 }}>
                    <button
                        type="button"
                        className="btn btn-p btn-sm"
                        data-testid="split-recurring-new"
                        onClick={openCreateForm}
                    >
                        + {T("add_recurring")}
                    </button>
                    <button
                        type="button"
                        className="btn btn-g btn-sm"
                        data-testid="split-recurring-generate"
                        disabled={generating}
                        onClick={handleGenerate}
                    >
                        {generating ? "…" : T("generate_recurring")}
                    </button>
                </div>
            </div>

            {generateMsg && (
                <div
                    style={{
                        marginBottom: 14,
                        padding: "10px 14px",
                        borderRadius: 10,
                        fontSize: 13,
                        background: "var(--success-soft)",
                        border: "1px solid var(--success-soft)",
                        color: "var(--success)",
                    }}
                >
                    ✓ {generateMsg.created} {T("generate_done")},{" "}
                    {generateMsg.skipped} {T("generate_skipped")}
                </div>
            )}

            {recurringError && !showForm && (
                <div
                    style={{
                        color: "var(--danger)",
                        fontSize: 13,
                        marginBottom: 10,
                    }}
                >
                    {recurringError}
                </div>
            )}

            {recurringLoading && groupRecurrings.length === 0 ? (
                <div style={{ color: "var(--fg-soft)", fontSize: 13 }}>
                    {T("loading")}
                </div>
            ) : groupRecurrings.length === 0 ? (
                <div style={{ color: "var(--fg-soft)", fontSize: 13 }}>
                    {T("no_recurring")}
                </div>
            ) : (
                <div
                    style={{ display: "flex", flexDirection: "column", gap: 8 }}
                >
                    {groupRecurrings.map((recurring) => {
                        const category = categories.find(
                            (c) => c.id === recurring.category,
                        );
                        const account = assets.find(
                            (a) => a.id === recurring.linked_asset,
                        );
                        return (
                            <Card
                                key={recurring.id}
                                style={{ padding: "12px 16px" }}
                                data-testid={`split-recurring-row-${recurring.id}`}
                            >
                                <div className="between">
                                    <div>
                                        <div
                                            style={{
                                                fontSize: 14,
                                                fontWeight: 500,
                                            }}
                                        >
                                            {category?.icon}{" "}
                                            {recurring.description}
                                        </div>
                                        <div
                                            style={{
                                                fontSize: 11,
                                                color: "var(--fg-soft)",
                                                marginTop: 3,
                                            }}
                                        >
                                            {T(
                                                `frequency_${recurring.frequency ?? "MONTHLY"}`,
                                            )}{" "}
                                            · {T("recurring_day")}{" "}
                                            {recurring.day_of_month}
                                            {account && ` · ${account.name}`}
                                            {recurring.status !== "ACTIVE" && (
                                                <span
                                                    style={{
                                                        color: "var(--danger)",
                                                        marginLeft: 6,
                                                    }}
                                                >
                                                    ● {recurring.status}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <div
                                        className="row"
                                        style={{ alignItems: "center", gap: 8 }}
                                    >
                                        <span
                                            style={{
                                                fontSize: 15,
                                                fontWeight: 600,
                                                fontFamily: "var(--font-mono)",
                                                color: "var(--danger)",
                                            }}
                                        >
                                            -{formatEur(recurring.amount)}
                                        </span>
                                        <button
                                            className="btn btn-g btn-sm"
                                            onClick={() =>
                                                openEditForm(recurring)
                                            }
                                        >
                                            {T("btn_edit")}
                                        </button>
                                        <button
                                            className="btn btn-g btn-sm"
                                            onClick={() =>
                                                toggleSplitRecurring(
                                                    recurring.id,
                                                    recurring.status !==
                                                        "ACTIVE",
                                                )
                                            }
                                        >
                                            {recurring.status === "ACTIVE"
                                                ? T("btn_disable")
                                                : T("btn_enable")}
                                        </button>
                                        <button
                                            className="btn btn-r btn-sm"
                                            data-testid={`split-recurring-delete-${recurring.id}`}
                                            onClick={() =>
                                                removeSplitRecurring(
                                                    recurring.id,
                                                )
                                            }
                                        >
                                            {T("btn_delete")}
                                        </button>
                                    </div>
                                </div>
                            </Card>
                        );
                    })}
                </div>
            )}

            {showForm && (
                <BottomSheet
                    open
                    onClose={() => setShowForm(false)}
                    ariaLabel={T("split_recurring_title")}
                >
                    <div style={{ padding: "0 18px" }}>
                        <div
                            style={{
                                fontSize: 18,
                                fontWeight: 600,
                                color: "var(--fg)",
                                padding: "2px 2px 14px",
                            }}
                        >
                            {form.id
                                ? T("modal_edit_recurring")
                                : T("modal_add_recurring")}
                        </div>
                        <div
                            style={{
                                display: "flex",
                                flexDirection: "column",
                                gap: 12,
                            }}
                        >
                            <div>
                                <FieldLabel text={T("label_description")} />
                                <input
                                    className="inp"
                                    data-testid="split-recurring-description"
                                    placeholder={T("placeholder_description")}
                                    value={form.description}
                                    onChange={(event) =>
                                        setForm((prev) => ({
                                            ...prev,
                                            description: event.target.value,
                                        }))
                                    }
                                />
                            </div>
                            <div>
                                <FieldLabel text={T("label_amount")} />
                                <input
                                    className="inp"
                                    type="text"
                                    inputMode="decimal"
                                    data-testid="split-recurring-amount"
                                    placeholder={
                                        decimalSeparator === ","
                                            ? "0,00"
                                            : "0.00"
                                    }
                                    value={form.amountText}
                                    onChange={(event) =>
                                        setForm((prev) => ({
                                            ...prev,
                                            amountText: filterAmountInput(
                                                event.target.value,
                                            ),
                                        }))
                                    }
                                />
                            </div>
                            <div>
                                <FieldLabel text={T("split_method_label")} />
                                <Select
                                    data-testid="split-recurring-method"
                                    value={form.splitMethod}
                                    onChange={(value) =>
                                        setForm((prev) => ({
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
                                <FieldLabel text={T("recurring_frequency")} />
                                <Select
                                    value={form.frequency}
                                    onChange={(value) =>
                                        setForm((prev) => ({
                                            ...prev,
                                            frequency:
                                                value === "YEARLY"
                                                    ? "YEARLY"
                                                    : "MONTHLY",
                                        }))
                                    }
                                    options={[
                                        {
                                            value: "MONTHLY",
                                            label: T("frequency_MONTHLY"),
                                        },
                                        {
                                            value: "YEARLY",
                                            label: T("frequency_YEARLY"),
                                        },
                                    ]}
                                    placeholder=""
                                />
                            </div>
                            {form.frequency === "YEARLY" && (
                                <div>
                                    <FieldLabel text={T("recurring_month")} />
                                    <input
                                        className="inp"
                                        type="number"
                                        min="1"
                                        max="12"
                                        value={form.monthOfYear}
                                        onChange={(event) =>
                                            setForm((prev) => ({
                                                ...prev,
                                                monthOfYear: event.target.value,
                                            }))
                                        }
                                    />
                                </div>
                            )}
                            <div>
                                <FieldLabel text={T("recurring_day")} />
                                <input
                                    className="inp"
                                    type="number"
                                    min="1"
                                    max="31"
                                    value={form.dayOfMonth}
                                    onChange={(event) =>
                                        setForm((prev) => ({
                                            ...prev,
                                            dayOfMonth: event.target.value,
                                        }))
                                    }
                                />
                            </div>
                            <div>
                                <FieldLabel text={T("recurring_start_date")} />
                                <input
                                    className="inp"
                                    type="date"
                                    value={form.startDate}
                                    onChange={(event) =>
                                        setForm((prev) => ({
                                            ...prev,
                                            startDate: event.target.value,
                                        }))
                                    }
                                />
                            </div>
                            <div>
                                <FieldLabel text={T("recurring_end_date")} />
                                <input
                                    className="inp"
                                    type="date"
                                    value={form.endDate}
                                    onChange={(event) =>
                                        setForm((prev) => ({
                                            ...prev,
                                            endDate: event.target.value,
                                        }))
                                    }
                                />
                            </div>

                            <div>
                                <FieldLabel
                                    text={T("split_participants_label")}
                                />
                                <div
                                    style={{
                                        display: "flex",
                                        flexDirection: "column",
                                    }}
                                >
                                    {form.participants.map((p) => {
                                        const meta = candidatesByKey.get(p.key);
                                        const index =
                                            form.participants.findIndex(
                                                (row) => row.key === p.key,
                                            );
                                        const amount =
                                            computed.shares != null &&
                                            index >= 0
                                                ? (computed.shares[index] ??
                                                  null)
                                                : null;
                                        return (
                                            <div
                                                key={p.key}
                                                data-testid={`split-recurring-participant-${p.key}`}
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
                                                        textOverflow:
                                                            "ellipsis",
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
                                                        name="split-recurring-payer"
                                                        checked={p.isPayer}
                                                        onChange={() =>
                                                            setForm((prev) => ({
                                                                ...prev,
                                                                participants:
                                                                    prev.participants.map(
                                                                        (
                                                                            row,
                                                                        ) => ({
                                                                            ...row,
                                                                            isPayer:
                                                                                row.key ===
                                                                                p.key,
                                                                        }),
                                                                    ),
                                                            }))
                                                        }
                                                    />
                                                    {T("split_payer_label")}
                                                </label>
                                                {form.splitMethod !==
                                                    "equal" && (
                                                    <input
                                                        className="inp"
                                                        style={{
                                                            width: 64,
                                                            fontSize: 13,
                                                            padding: "6px 8px",
                                                        }}
                                                        value={p.rawInputText}
                                                        onChange={(event) =>
                                                            setForm((prev) => ({
                                                                ...prev,
                                                                participants:
                                                                    prev.participants.map(
                                                                        (
                                                                            row,
                                                                        ) =>
                                                                            row.key ===
                                                                            p.key
                                                                                ? {
                                                                                      ...row,
                                                                                      rawInputText:
                                                                                          filterAmountInput(
                                                                                              event
                                                                                                  .target
                                                                                                  .value,
                                                                                          ),
                                                                                  }
                                                                                : row,
                                                                    ),
                                                            }))
                                                        }
                                                    />
                                                )}
                                                <span
                                                    style={{
                                                        fontSize: 12,
                                                        fontFamily:
                                                            "var(--font-mono)",
                                                        minWidth: 58,
                                                        textAlign: "right",
                                                        color: "var(--fg-soft)",
                                                    }}
                                                >
                                                    {amount != null
                                                        ? formatEur(amount)
                                                        : "—"}
                                                </span>
                                                <button
                                                    type="button"
                                                    className="btn btn-g btn-sm"
                                                    aria-label={T("btn_delete")}
                                                    onClick={() =>
                                                        setForm((prev) => ({
                                                            ...prev,
                                                            participants:
                                                                prev.participants.filter(
                                                                    (row) =>
                                                                        row.key !==
                                                                        p.key,
                                                                ),
                                                        }))
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
                                            value=""
                                            onChange={(value) => {
                                                const candidate =
                                                    candidatesByKey.get(value);
                                                if (candidate) {
                                                    setForm((prev) => ({
                                                        ...prev,
                                                        participants: [
                                                            ...prev.participants,
                                                            {
                                                                key: candidate.key,
                                                                user_id:
                                                                    candidate.user_id,
                                                                contact_id:
                                                                    candidate.contact_id,
                                                                rawInputText:
                                                                    "",
                                                                isPayer:
                                                                    prev
                                                                        .participants
                                                                        .length ===
                                                                    0,
                                                            },
                                                        ],
                                                    }));
                                                }
                                            }}
                                            options={availableCandidates.map(
                                                (candidate) => ({
                                                    value: candidate.key,
                                                    label: candidate.label,
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
                                        />
                                        <CategorySelect
                                            value={form.category ?? ""}
                                            onChange={(value) =>
                                                setForm((prev) => ({
                                                    ...prev,
                                                    category: value
                                                        ? Number(value)
                                                        : null,
                                                }))
                                            }
                                            categoryType="expense"
                                            categories={categories}
                                            placeholder={T("no_category")}
                                        />
                                    </div>
                                    <div>
                                        <FieldLabel
                                            text={T("label_linked_asset")}
                                        />
                                        <Select
                                            value={
                                                form.linkedAsset != null
                                                    ? String(form.linkedAsset)
                                                    : ""
                                            }
                                            onChange={(value) =>
                                                setForm((prev) => ({
                                                    ...prev,
                                                    linkedAsset: value
                                                        ? Number(value)
                                                        : null,
                                                }))
                                            }
                                            placeholder={T("no_linked_asset")}
                                            options={bankAccounts.map(
                                                (account) => ({
                                                    value: String(account.id),
                                                    label: `${account.investment_type_detail?.icon || ""} ${account.name}`.trim(),
                                                }),
                                            )}
                                        />
                                    </div>
                                </>
                            )}

                            {(formError || computed.error) && (
                                <div
                                    style={{
                                        fontSize: 12,
                                        color: "var(--danger)",
                                        background: "#ff6b6b11",
                                        border: "1px solid #ff6b6b33",
                                        borderRadius: 8,
                                        padding: "8px 10px",
                                    }}
                                >
                                    {formError ?? T("error_invalid_amount")}
                                </div>
                            )}

                            <div
                                className="row"
                                style={{
                                    justifyContent: "flex-end",
                                    gap: 8,
                                    marginTop: 8,
                                }}
                            >
                                <button
                                    className="btn btn-g"
                                    onClick={() => setShowForm(false)}
                                >
                                    {T("btn_cancel")}
                                </button>
                                <button
                                    className="btn btn-p"
                                    data-testid="split-recurring-submit"
                                    disabled={submitting}
                                    onClick={handleSubmit}
                                >
                                    {submitting
                                        ? "…"
                                        : form.id
                                          ? T("btn_update")
                                          : T("btn_add")}
                                </button>
                            </div>
                        </div>
                    </div>
                </BottomSheet>
            )}
        </div>
    );
}
