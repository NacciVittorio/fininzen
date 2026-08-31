"use client";

import { LargeTitleHeader } from "../components/ui";
import { SettingsRoot } from "./settings/SettingsNavigation";
import { useSettings } from "../context/useSettings";

export default function SettingsView() {
    const { T, settingsNavItems, logout, profile } = useSettings();

    return (
        <div className="page-narrow settings-page settings-root">
            <LargeTitleHeader title={T("tab_settings")} />
            <SettingsRoot
                navItems={settingsNavItems}
                T={T}
                logout={logout}
                isAdmin={profile.role === "admin"}
            />
        </div>
    );
}
