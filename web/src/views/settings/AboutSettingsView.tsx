"use client";

import { useSettings } from "../../context/useSettings";
import { AboutSettingsSection } from "./PreferenceSections";
import { SettingsSectionHeader } from "./SettingsNavigation";

export default function AboutSettingsView() {
    const { T } = useSettings();

    return (
        <div className="page-narrow settings-page">
            <SettingsSectionHeader
                label={T("settings_about")}
                backLabel={T("tab_settings")}
                backHref="/settings"
            />
            <AboutSettingsSection />
        </div>
    );
}
