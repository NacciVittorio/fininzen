"use client";

import type { ReactNode } from "react";
import { useApp } from "../../context/useApp";
import {
    ALL_CASHFLOW_TYPES,
    nextTypeSelection,
} from "../../context/feedDefaults";
import CategorySelect from "../CategorySelect";
import { BottomSheet } from "../ui";
import FilterSheetFooter from "../filters/FilterSheetFooter";
import PeriodFilterSection from "../filters/PeriodFilterSection";
import { useFilterDraft } from "../filters/useFilterDraft";

const SORT_OPTIONS = ["-date", "date", "-amount", "amount"];

// Collapses the old 8-pill filter strip into one bottom sheet. Edits go to a
// draft (useFilterDraft) and only reach the feed on "Applica"; closing any other
// way discards. The period lives here as well as in the header pager — both
// write the same date_from/date_to, so they stay in sync.
function Chip({
    active,
    onClick,
    children,
    testId,
}: {
    active?: boolean;
    onClick: () => void;
    children: ReactNode;
    testId?: string;
}) {
    return (
        <button
            type="button"
            data-testid={testId}
            onClick={onClick}
            aria-pressed={active}
            style={{
                padding: "9px 15px",
                borderRadius: 999,
                cursor: "pointer",
                fontSize: 14,
                fontWeight: 600,
                fontFamily: "inherit",
                border: active
                    ? "1.5px solid var(--accent)"
                    : "1.5px solid var(--rule)",
                background: active ? "var(--accent-soft)" : "var(--card-inset)",
                color: active ? "var(--accent-deep)" : "var(--fg)",
            }}
        >
            {children}
        </button>
    );
}

function Section({
    label,
    children,
}: {
    label: ReactNode;
    children: ReactNode;
}) {
    return (
        <div style={{ padding: "14px 2px 0" }}>
            <div
                style={{
                    fontSize: 13,
                    fontWeight: 500,
                    letterSpacing: "var(--ls-label)",
                    color: "var(--fg-soft)",
                    marginBottom: 9,
                }}
            >
                {label}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {children}
            </div>
        </div>
    );
}

export default function CfFiltersSheet({
    open,
    onClose,
}: {
    open: boolean;
    onClose: () => void;
}) {
    const {
        T,
        categories,
        bankAccounts,
        archivedBankAccounts,
        cfFilters,
        setCfFilters,
        accountingMonthDateRange,
    } = useApp();

    const { draft, setDraft, apply } = useFilterDraft(
        open,
        cfFilters,
        setCfFilters,
    );

    const typesAll = draft.types.length === ALL_CASHFLOW_TYPES.length;
    const accountIds = Array.isArray(draft.account_ids)
        ? draft.account_ids
        : [];

    const toggleAccount = (val: string) =>
        setDraft((p) => {
            const prev = Array.isArray(p.account_ids) ? p.account_ids : [];
            return {
                ...p,
                account_ids: prev.includes(val)
                    ? prev.filter((v) => v !== val)
                    : [...prev, val],
            };
        });

    const reset = () =>
        setDraft((p) => ({
            ...p,
            types: [...ALL_CASHFLOW_TYPES],
            verified: null,
            category_ids: [],
            account_ids: [],
            ordering: "-date",
        }));

    const sortLabels: Record<string, string> = {
        "-date": T("sort_date_desc"),
        date: T("sort_date_asc"),
        "-amount": T("sort_amount_desc"),
        amount: T("sort_amount_asc"),
    };

    const statusOptions: { v: boolean | null; l: string }[] = [
        { v: null, l: T("verified_filter_all") },
        { v: true, l: T("verified_filter_yes") },
        { v: false, l: T("verified_filter_no") },
    ];

    return (
        <BottomSheet open={open} onClose={onClose} ariaLabel={T("cf_filters")}>
            <div style={{ padding: "2px 16px 4px" }}>
                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "2px 2px 0",
                    }}
                >
                    <span
                        style={{
                            fontSize: 18,
                            fontWeight: 600,
                            color: "var(--fg)",
                        }}
                    >
                        {T("cf_filters")}
                    </span>
                    <button
                        type="button"
                        data-testid="cf-filters-reset"
                        onClick={reset}
                        style={{
                            border: 0,
                            background: "none",
                            color: "var(--accent)",
                            fontSize: 14,
                            fontWeight: 600,
                            cursor: "pointer",
                            fontFamily: "inherit",
                        }}
                    >
                        {T("cf_filters_reset")}
                    </button>
                </div>

                <Section label={T("period_label")}>
                    <div style={{ width: "100%" }}>
                        <PeriodFilterSection
                            T={T}
                            dateFrom={draft.date_from}
                            dateTo={draft.date_to}
                            monthRange={accountingMonthDateRange}
                            allChipTestId="cf-period-all"
                            onRangeChange={({ from, to }) =>
                                setDraft((p) => ({
                                    ...p,
                                    date_from: from,
                                    date_to: to,
                                }))
                            }
                        />
                    </div>
                </Section>

                <Section label={T("type_filter_label")}>
                    <Chip
                        active={typesAll}
                        onClick={() =>
                            setDraft((p) => ({
                                ...p,
                                types: [...ALL_CASHFLOW_TYPES],
                                category_ids: [],
                            }))
                        }
                    >
                        {T("cf_all_types")}
                    </Chip>
                    {ALL_CASHFLOW_TYPES.map((type) => (
                        <Chip
                            key={type}
                            active={draft.types.includes(type) && !typesAll}
                            onClick={() =>
                                setDraft((p) => ({
                                    ...p,
                                    types: nextTypeSelection(
                                        p.types,
                                        type,
                                        ALL_CASHFLOW_TYPES,
                                    ),
                                }))
                            }
                        >
                            {T("cf_" + type)}
                        </Chip>
                    ))}
                </Section>

                <Section label={T("verified_filter_label")}>
                    {statusOptions.map(({ v, l }) => (
                        <Chip
                            key={String(v)}
                            active={draft.verified === v}
                            onClick={() =>
                                setDraft((p) => ({ ...p, verified: v }))
                            }
                        >
                            {l}
                        </Chip>
                    ))}
                </Section>

                <Section label={T("account_label")}>
                    <Chip
                        active={!accountIds.length}
                        onClick={() =>
                            setDraft((p) => ({ ...p, account_ids: [] }))
                        }
                    >
                        {T("cf_all_accounts")}
                    </Chip>
                    <Chip
                        active={accountIds.includes("none")}
                        onClick={() => toggleAccount("none")}
                    >
                        {T("cf_no_account")}
                    </Chip>
                    {bankAccounts.map((a) => (
                        <Chip
                            key={a.id}
                            active={accountIds.includes(String(a.id))}
                            onClick={() => toggleAccount(String(a.id))}
                        >
                            {a.name}
                        </Chip>
                    ))}
                    {archivedBankAccounts.map((a) => (
                        <Chip
                            key={a.id}
                            active={accountIds.includes(String(a.id))}
                            onClick={() => toggleAccount(String(a.id))}
                        >
                            {`${a.name} (${T("label_archived")})`}
                        </Chip>
                    ))}
                </Section>

                <Section label={T("category_label")}>
                    <div style={{ width: "100%" }}>
                        <CategorySelect
                            multiple
                            usePortal
                            values={draft.category_ids || []}
                            onMultiChange={(ids) =>
                                setDraft((p) => ({
                                    ...p,
                                    category_ids: ids,
                                }))
                            }
                            categories={categories}
                            categoryType="all"
                            placeholder={T("all")}
                            selectedLabel={T("selected")}
                        />
                    </div>
                </Section>

                <Section label={T("sort_label")}>
                    {SORT_OPTIONS.map((val) => (
                        <Chip
                            key={val}
                            testId={`cf-sort-option-${val}`}
                            active={(draft.ordering || "-date") === val}
                            onClick={() =>
                                setDraft((p) => ({ ...p, ordering: val }))
                            }
                        >
                            {sortLabels[val]}
                        </Chip>
                    ))}
                </Section>

                <FilterSheetFooter
                    T={T}
                    onCancel={onClose}
                    onApply={() => {
                        apply();
                        onClose();
                    }}
                    applyTestId="cf-filters-apply"
                    cancelTestId="cf-filters-cancel"
                />
            </div>
        </BottomSheet>
    );
}
