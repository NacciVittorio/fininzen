"use client";

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
    GroupedList,
    SegmentedControl,
    ToggleSwitch,
} from "../../components/ui";
import { useAuth } from "../../context/useAuth";
import type { FeatureKey } from "../../context/appContextHelpers";
import type { ThemePreference } from "../../context/useThemeLang";
import type { Language } from "../../i18n";
import type { DecimalSeparator } from "../../utils/formatters";

type FeatureItem = {
    key: FeatureKey;
    label: string;
    description: string;
};

export function GeneralSettingsSection() {
    const {
        T,
        lang,
        setLang,
        themePreference,
        setTheme,
        decimalSeparator,
        updateDecimalSeparator,
        accountingMonthStartDay,
        updateAccountingMonthStartDay,
        accountingMonthDateRange,
        currentAccountingMonth,
        enabledFeatures,
        updateEnabledFeature,
    } = useAuth();
    const [accountingSaved, setAccountingSaved] = useState(false);

    const featureItems = useMemo<FeatureItem[]>(
        () => [
            {
                key: "dashboard",
                label: T("tab_dashboard"),
                description: T("feature_dashboard_desc"),
            },
            {
                key: "cashflow",
                label: T("tab_cashflow"),
                description: T("feature_cashflow_desc"),
            },
            {
                key: "split",
                label: T("tab_split"),
                description: T("feature_split_desc"),
            },
            {
                key: "accounts",
                label: T("tab_accounts"),
                description: T("feature_accounts_desc"),
            },
            {
                key: "investments",
                label: T("tab_investments"),
                description: T("feature_investments_desc"),
            },
            {
                key: "fire",
                label: T("tab_fire"),
                description: T("feature_fire_desc"),
            },
        ],
        [T],
    );

    const current = currentAccountingMonth();
    const range = accountingMonthDateRange(current.year, current.month);

    return (
        <div>
            <GroupedList
                title={T("features_title")}
                footer={T("features_desc")}
            >
                {featureItems.map((feature) => (
                    <GroupedList.Item
                        key={feature.key}
                        label={feature.label}
                        subtitle={feature.description}
                        action={
                            <ToggleSwitch
                                id={`feature-${feature.key}`}
                                checked={!!enabledFeatures[feature.key]}
                                onChange={(checked) =>
                                    updateEnabledFeature(feature.key, checked)
                                }
                            />
                        }
                    />
                ))}
            </GroupedList>

            <GroupedList
                title={T("general_preferences")}
                footer={
                    T(
                        "accounting_month_start_desc",
                        "Monthly cash flow totals use this day as the start of the month.",
                    ) + ` ${range.from} - ${range.to}`
                }
            >
                <SegmentedPreferenceRow label={T("theme_label", "Theme")}>
                    <SegmentedControl
                        options={[
                            { value: "light", label: T("theme_light") },
                            { value: "dark", label: T("theme_dark") },
                            { value: "auto", label: "Auto" },
                        ]}
                        value={themePreference}
                        onChange={(v) => setTheme(v as ThemePreference)}
                    />
                </SegmentedPreferenceRow>
                <SegmentedPreferenceRow label={T("choose_language")}>
                    <SegmentedControl
                        options={[
                            { value: "en", label: "English" },
                            { value: "it", label: "Italiano" },
                        ]}
                        value={lang}
                        onChange={(code) => {
                            setLang(code as Language);
                            localStorage.setItem("lang", code);
                        }}
                    />
                </SegmentedPreferenceRow>
                <SegmentedPreferenceRow label={T("decimal_separator_label")}>
                    <SegmentedControl
                        options={[
                            { value: ",", label: "1.234,56" },
                            { value: ".", label: "1,234.56" },
                        ]}
                        value={decimalSeparator ?? undefined}
                        onChange={(v) =>
                            updateDecimalSeparator(v as DecimalSeparator)
                        }
                    />
                </SegmentedPreferenceRow>
                <GroupedList.Item
                    label={T("currency_title")}
                    value={T("currency_eur_label")}
                />
                <GroupedList.Item
                    label={T(
                        "accounting_month_start_label",
                        "Accounting month start",
                    )}
                    action={
                        <div
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                            }}
                        >
                            {accountingSaved && (
                                <span
                                    style={{
                                        fontSize: 12,
                                        color: "var(--success)",
                                    }}
                                >
                                    {T("decimal_separator_saved")}
                                </span>
                            )}
                            <select
                                className="inp"
                                value={accountingMonthStartDay}
                                onChange={async (event) => {
                                    const ok =
                                        await updateAccountingMonthStartDay(
                                            Number(event.target.value),
                                        );
                                    if (ok) {
                                        setAccountingSaved(true);
                                        setTimeout(
                                            () => setAccountingSaved(false),
                                            2000,
                                        );
                                    }
                                }}
                                style={{ maxWidth: 90 }}
                            >
                                {Array.from(
                                    { length: 31 },
                                    (_, index) => index + 1,
                                ).map((day) => (
                                    <option key={day} value={day}>
                                        {day}
                                    </option>
                                ))}
                            </select>
                        </div>
                    }
                />
            </GroupedList>
        </div>
    );
}

function SegmentedPreferenceRow({
    label,
    children,
}: {
    label: ReactNode;
    children?: ReactNode;
}) {
    return (
        <GroupedList.Item
            label={label}
            action={children}
            style={{ flexWrap: "wrap", rowGap: 8 }}
        />
    );
}
