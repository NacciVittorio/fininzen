import { useMemo, useState } from "react";
import { SegmentedControl, ToggleSwitch } from "../../components/ui";
import { useAuth } from "../../context/useAuth";

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

  const featureItems = useMemo(
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
      <div className="grouped-list__title">{T("features_title")}</div>
      <div className="grouped-list" style={{ marginBottom: 8 }}>
        {featureItems.map((feature) => (
          <div key={feature.key} className="grouped-list__item">
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 500,
                  color: "var(--fg)",
                }}
              >
                {feature.label}
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: "var(--fg-soft)",
                  marginTop: 2,
                  lineHeight: 1.35,
                }}
              >
                {feature.description}
              </div>
            </div>
            <ToggleSwitch
              id={`feature-${feature.key}`}
              checked={!!enabledFeatures[feature.key]}
              onChange={(checked) => updateEnabledFeature(feature.key, checked)}
            />
          </div>
        ))}
      </div>
      <div
        style={{
          fontSize: 12,
          color: "var(--fg-soft)",
          lineHeight: 1.45,
          padding: "0 4px",
          marginBottom: 24,
        }}
      >
        {T("features_desc")}
      </div>

      <div className="grouped-list__title">{T("general_preferences")}</div>
      <div className="grouped-list" style={{ marginBottom: 8 }}>
        <SegmentedPreferenceRow label={T("theme_label", "Theme")}>
          <SegmentedControl
            options={[
              { value: "light", label: T("theme_light") },
              { value: "dark", label: T("theme_dark") },
              { value: "auto", label: "Auto" },
            ]}
            value={themePreference}
            onChange={setTheme}
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
              setLang(code);
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
            value={decimalSeparator}
            onChange={updateDecimalSeparator}
          />
        </SegmentedPreferenceRow>
        <div className="grouped-list__item">
          <span style={{ fontSize: 14, fontWeight: 500, color: "var(--fg)" }}>
            {T("currency_title")}
          </span>
          <span style={{ fontSize: 13, color: "var(--fg-soft)" }}>
            {T("currency_eur_label")}
          </span>
        </div>
        <div className="grouped-list__item">
          <span
            style={{
              fontSize: 14,
              fontWeight: 500,
              color: "var(--fg)",
              flex: 1,
              minWidth: 0,
            }}
          >
            {T("accounting_month_start_label", "Accounting month start")}
          </span>
          {accountingSaved && (
            <span style={{ fontSize: 12, color: "var(--success)" }}>
              {T("decimal_separator_saved")}
            </span>
          )}
          <select
            className="inp"
            value={accountingMonthStartDay}
            onChange={async (event) => {
              const ok = await updateAccountingMonthStartDay(
                event.target.value,
              );
              if (ok) {
                setAccountingSaved(true);
                setTimeout(() => setAccountingSaved(false), 2000);
              }
            }}
            style={{ maxWidth: 90 }}
          >
            {Array.from({ length: 31 }, (_, index) => index + 1).map((day) => (
              <option key={day} value={day}>
                {day}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div
        style={{
          fontSize: 12,
          color: "var(--fg-soft)",
          lineHeight: 1.45,
          padding: "0 4px",
        }}
      >
        {T(
          "accounting_month_start_desc",
          "Monthly cash flow totals use this day as the start of the month.",
        ) + ` ${range.from} - ${range.to}`}
      </div>
    </div>
  );
}

function SegmentedPreferenceRow({ label, children }) {
  return (
    <div className="grouped-list__item" style={{ flexWrap: "wrap", rowGap: 8 }}>
      <span style={{ fontSize: 14, fontWeight: 500, color: "var(--fg)" }}>
        {label}
      </span>
      {children}
    </div>
  );
}
