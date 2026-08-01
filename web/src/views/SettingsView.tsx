"use client";

import { LargeTitleHeader } from "../components/ui";
import { SettingsRoot } from "./settings/SettingsNavigation";
import { useSettings } from "../context/useSettings";

export default function SettingsView() {
    const { T, settingsNavItems, logout } = useSettings();

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <LargeTitleHeader title={T("tab_settings")} />
            <SettingsRoot navItems={settingsNavItems} T={T} logout={logout} />
        </div>
    );
}
