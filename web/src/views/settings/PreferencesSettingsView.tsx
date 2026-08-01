"use client";

import { useSettings } from "../../context/useSettings";
import {
    GeneralSettingsSection,
    PrivacySettingsSection,
    DashboardSettingsSection,
    TransactionDefaultsSection,
} from "./PreferenceSections";
import { SettingsSectionHeader } from "./SettingsNavigation";

export default function PreferencesSettingsView() {
    const { T, isFeatureEnabled } = useSettings();

    return (
        <div className="page-narrow">
            <SettingsSectionHeader
                label={T("settings_preferences")}
                backLabel={T("tab_settings")}
                backHref="/settings"
            />

            <GeneralSettingsSection />
            <TransactionDefaultsSection />
            <div style={{ marginTop: 20 }}>
                <PrivacySettingsSection />
            </div>
            {isFeatureEnabled("dashboard") && (
                <div style={{ marginTop: 20 }}>
                    <DashboardSettingsSection />
                </div>
            )}
        </div>
    );
}
