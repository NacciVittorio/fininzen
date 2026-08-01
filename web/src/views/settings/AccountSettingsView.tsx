"use client";

import { useSettings } from "../../context/useSettings";
import {
    ApiTokensCard,
    BiometricLockCard,
    DeleteAccountCard,
    MfaCard,
    SharingSection,
    TabSwipeCard,
    UserSection,
} from "./SettingsSections";
import { SettingsSectionHeader } from "./SettingsNavigation";

export default function AccountSettingsView() {
    const {
        T,
        profile,
        updateProfile,
        changePassword,
        changeEmail,
        mfaSetup,
        mfaEnable,
        mfaDisable,
        deleteAccount,
        isDemo,
        viewAs,
    } = useSettings();

    return (
        <div className="page-narrow">
            <SettingsSectionHeader
                label={T("settings_user")}
                backLabel={T("tab_settings")}
                backHref="/settings"
            />

            <UserSection
                T={T}
                profile={profile}
                updateProfile={updateProfile}
                changePassword={changePassword}
                changeEmail={changeEmail}
            />

            {!isDemo && !viewAs && (
                <>
                    <div
                        className="grouped-list__title"
                        style={{ marginTop: 20 }}
                    >
                        {T("account_security_title", "Security")}
                    </div>
                    <div
                        style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 20,
                        }}
                    >
                        <BiometricLockCard />
                        <MfaCard
                            T={T}
                            mfaEnabled={!!profile.mfa_enabled}
                            mfaSetup={mfaSetup}
                            mfaEnable={mfaEnable}
                            mfaDisable={mfaDisable}
                        />
                        <TabSwipeCard />
                        <ApiTokensCard T={T} />
                    </div>
                </>
            )}
            {(isDemo || viewAs) && (
                <div style={{ marginTop: 20 }}>
                    <TabSwipeCard />
                </div>
            )}

            <div className="grouped-list__title" style={{ marginTop: 20 }}>
                {T("sharing_title")}
            </div>
            <div
                style={{
                    fontSize: 13,
                    color: "var(--fg-soft)",
                    marginBottom: 14,
                }}
            >
                {T("sharing_desc")}
            </div>
            <SharingSection T={T} />

            {!isDemo && !viewAs && (
                <>
                    <div
                        className="grouped-list__title"
                        style={{ marginTop: 20, color: "var(--danger)" }}
                    >
                        {T("settings_danger_zone", "Danger zone")}
                    </div>
                    <DeleteAccountCard T={T} deleteAccount={deleteAccount} />
                </>
            )}
        </div>
    );
}
