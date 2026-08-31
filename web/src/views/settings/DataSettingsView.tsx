"use client";

import { useSettings } from "../../context/useSettings";
import { DataSections } from "./DataSections";
import { ExtraSettingsSection } from "./ExtraSettingsSection";
import { DangerModals } from "./DangerModals";
import { SettingsSectionHeader } from "./SettingsNavigation";

export default function DataSettingsView() {
    const {
        T,
        resetMsg,
        resetConfirm,
        setResetConfirm,
        resetUnderstood,
        setResetUnderstood,
        resetTransactions,
        resetPortfolio,
        demoConfirm,
        setDemoConfirm,
        demoUnderstood,
        setDemoUnderstood,
        demoError,
        setDemoError,
        demoLoading,
        setDemoLoading,
        loadDemoData,
    } = useSettings();

    return (
        <div className="page-narrow settings-page">
            <SettingsSectionHeader
                label={T("settings_data")}
                backLabel={T("tab_settings")}
                backHref="/settings"
            />

            <DataSections />

            <div
                className="grouped-list__title"
                style={{ marginTop: 20, color: "var(--danger)" }}
            >
                {T("settings_danger_zone", "Danger zone")}
            </div>
            <ExtraSettingsSection
                resetMsg={resetMsg}
                setResetConfirm={setResetConfirm}
                setResetUnderstood={setResetUnderstood}
                setDemoConfirm={setDemoConfirm}
                setDemoUnderstood={setDemoUnderstood}
            />

            <DangerModals
                T={T}
                resetConfirm={resetConfirm}
                setResetConfirm={setResetConfirm}
                resetUnderstood={resetUnderstood}
                setResetUnderstood={setResetUnderstood}
                resetTransactions={resetTransactions}
                resetPortfolio={resetPortfolio}
                demoConfirm={demoConfirm}
                setDemoConfirm={setDemoConfirm}
                demoUnderstood={demoUnderstood}
                setDemoUnderstood={setDemoUnderstood}
                demoError={demoError}
                setDemoError={setDemoError}
                demoLoading={demoLoading}
                setDemoLoading={setDemoLoading}
                loadDemoData={loadDemoData}
            />
        </div>
    );
}
