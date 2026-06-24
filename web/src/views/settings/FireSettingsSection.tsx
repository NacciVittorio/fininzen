"use client";

import { useEffect, useState } from "react";
import { fetchFire, getPayloadError, saveFireSettings } from "../../api/fire";
import type { FireSettings } from "../../api/fire";
import { usePortfolio } from "../../context/usePortfolio";
import type { Translator } from "../../types";

type FireForm = Record<string, string | number | null>;
// [labelKey, formField, inputType]
type FireField = [string, string, string];

const DEFAULT_FIRE_FORM: FireForm = {
    user_age: "",
    retirement_age: "",
    withdrawal_rate: "",
    annual_expenses_override: "",
    growth_rate_bear: "",
    growth_rate_base: "",
    growth_rate_bull: "",
    inflation_rate: "",
    net_worth_goal: "",
    model_mode: "dual",
    swr_base: "",
    swr_min: "",
    swr_max: "",
    annual_expenses_retirement: "",
    annual_passive_income_retirement: "",
    expected_real_return: "",
    expected_nominal_return: "",
    annual_contribution: "",
    tax_drag_rate: "",
    target_retirement_age: "",
    life_expectancy: "",
    portfolio_equity_pct: "",
};

const CORE_FIRE_FIELDS: FireField[] = [
    ["fire_user_age", "user_age", "number"],
    ["fire_retirement_age", "retirement_age", "number"],
    ["fire_withdrawal_rate", "withdrawal_rate", "text"],
    ["fire_annual_expenses_override", "annual_expenses_override", "text"],
    ["fire_net_worth_goal", "net_worth_goal", "number"],
];

const ADVANCED_FIRE_FIELDS: FireField[] = [
    ["fire_growth_bear", "growth_rate_bear", "text"],
    ["fire_growth_base", "growth_rate_base", "text"],
    ["fire_growth_bull", "growth_rate_bull", "text"],
    ["fire_inflation", "inflation_rate", "text"],
    ["Model mode (classic|real|dual)", "model_mode", "text"],
    ["SWR base", "swr_base", "text"],
    ["SWR min", "swr_min", "text"],
    ["SWR max", "swr_max", "text"],
    ["Annual expenses retirement (€)", "annual_expenses_retirement", "number"],
    [
        "Passive income retirement (€)",
        "annual_passive_income_retirement",
        "number",
    ],
    ["Expected real return", "expected_real_return", "text"],
    ["Expected nominal return", "expected_nominal_return", "text"],
    ["Annual contribution (€)", "annual_contribution", "number"],
    ["Tax drag rate", "tax_drag_rate", "text"],
    ["Target retirement age", "target_retirement_age", "number"],
    ["Life expectancy", "life_expectancy", "number"],
    ["Portfolio equity %", "portfolio_equity_pct", "number"],
];

export function FireSettingsSection({
    T,
    fetchFireGoal,
}: {
    T: Translator;
    fetchFireGoal?: () => void;
}) {
    const { apiFetch } = usePortfolio();
    const [form, setForm] = useState<FireForm>(DEFAULT_FIRE_FORM);
    const [saved, setSaved] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [showAdvanced, setShowAdvanced] = useState(false);

    useEffect(() => {
        fetchFire(apiFetch)
            .then((data) => {
                if (data?.settings)
                    setForm((state) => ({ ...state, ...data.settings }));
            })
            .catch(() => {});
    }, [apiFetch]);

    const set = (field: string, value: string) =>
        setForm((state) => ({ ...state, [field]: value }));

    const save = async () => {
        setSaveError(null);
        try {
            await saveFireSettings(apiFetch, form as unknown as FireSettings);
        } catch (error) {
            setSaveError(getPayloadError(error) || T("error_save_failed"));
            return;
        }
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
        fetchFireGoal?.();
    };

    return (
        <div>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>
                {T("fire_settings_title")}
            </div>
            <div
                style={{
                    fontSize: 12,
                    color: "var(--fg-soft)",
                    marginBottom: 10,
                }}
            >
                {T("fire_settings_scope_hint")}
            </div>
            <FireFieldGrid
                T={T}
                fields={CORE_FIRE_FIELDS}
                form={form}
                set={set}
            />
            <button
                className="btn"
                onClick={() => setShowAdvanced((value) => !value)}
                style={{ marginBottom: 12 }}
            >
                {showAdvanced
                    ? T("fire_settings_advanced_hide")
                    : T("fire_settings_advanced_show")}
            </button>
            {showAdvanced && (
                <FireFieldGrid
                    T={T}
                    fields={ADVANCED_FIRE_FIELDS}
                    form={form}
                    set={set}
                />
            )}
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <button className="btn btn-p" onClick={save}>
                    {T("fire_btn_save")}
                </button>
                {saved && (
                    <span style={{ fontSize: 13, color: "var(--success)" }}>
                        ✓ {T("user_name_saved")}
                    </span>
                )}
                {saveError && (
                    <span style={{ fontSize: 13, color: "var(--danger)" }}>
                        {saveError}
                    </span>
                )}
            </div>
        </div>
    );
}

function FireFieldGrid({
    T,
    fields,
    form,
    set,
}: {
    T: Translator;
    fields: FireField[];
    form: FireForm;
    set: (field: string, value: string) => void;
}) {
    return (
        <div
            className="mob-grid-1"
            style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
                gap: 12,
                marginBottom: 16,
            }}
        >
            {fields.map(([labelKey, field, type]) => (
                <label
                    key={field}
                    style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 4,
                        fontSize: 13,
                        color: "var(--fg-soft)",
                    }}
                >
                    {labelKey.startsWith("fire_") ? T(labelKey) : labelKey}
                    <input
                        className="inp"
                        type={type}
                        value={form[field] ?? ""}
                        onChange={(event) => set(field, event.target.value)}
                    />
                </label>
            ))}
        </div>
    );
}
