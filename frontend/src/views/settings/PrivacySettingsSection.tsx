import { ToggleSwitch } from "../../components/ui";
import { useAuth } from "../../context/useAuth";
import type { FeatureKey } from "../../context/appContextHelpers";

type PrivacyGroup = {
    title: string;
    scope: string;
    feature: FeatureKey;
    items: [string, string][];
};

export function PrivacySettingsSection() {
    const {
        T,
        isFeatureEnabled,
        isPrivacyPreferenceEnabled,
        updatePrivacyPreference,
    } = useAuth();
    const allPrivacyGroups: PrivacyGroup[] = [
        {
            title: T("privacy_dashboard"),
            scope: "dashboard",
            feature: "dashboard",
            items: [["net_worth", T("privacy_net_worth")]],
        },
        {
            title: T("privacy_cashflow"),
            scope: "cashflow",
            feature: "cashflow",
            items: [
                ["income", T("privacy_income")],
                ["outcome", T("privacy_outcome")],
                ["deficit", T("privacy_deficit")],
            ],
        },
        {
            title: T("privacy_accounts"),
            scope: "accounts",
            feature: "accounts",
            items: [
                ["balance", T("privacy_balance")],
                ["investments", T("privacy_investments")],
                ["income", T("privacy_income")],
                ["outcome", T("privacy_outcome")],
                ["account_values", T("privacy_account_values")],
            ],
        },
        {
            title: T("privacy_investments"),
            scope: "investments",
            feature: "investments",
            items: [
                ["total_value", T("privacy_total_value")],
                ["total_gain", T("privacy_total_gain")],
                ["asset_values", T("privacy_asset_values")],
                ["transactions", T("privacy_transactions")],
            ],
        },
    ];
    const privacyGroups = allPrivacyGroups.filter((group) =>
        isFeatureEnabled(group.feature),
    );

    if (privacyGroups.length === 0) return null;

    return (
        <div>
            <div
                style={{
                    fontSize: 13,
                    color: "var(--fg-soft)",
                    marginBottom: 16,
                    lineHeight: 1.45,
                }}
            >
                {T("privacy_desc")}
            </div>
            {privacyGroups.map((group) => (
                <div key={group.scope} style={{ marginBottom: 20 }}>
                    <div className="grouped-list__title">{group.title}</div>
                    <div className="grouped-list">
                        {group.items.map(([key, label]) => (
                            <div
                                key={`${group.scope}.${key}`}
                                className="grouped-list__item"
                            >
                                <span
                                    style={{
                                        fontSize: 14,
                                        fontWeight: 500,
                                        color: "var(--fg)",
                                        flex: 1,
                                        minWidth: 0,
                                    }}
                                >
                                    {label}
                                </span>
                                <ToggleSwitch
                                    id={`privacy-${group.scope}-${key}`}
                                    checked={isPrivacyPreferenceEnabled(
                                        group.scope,
                                        key,
                                    )}
                                    onChange={(checked) =>
                                        updatePrivacyPreference(
                                            group.scope,
                                            key,
                                            checked,
                                        )
                                    }
                                />
                            </div>
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
}
