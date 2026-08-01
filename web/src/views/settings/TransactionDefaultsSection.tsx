"use client";

import { ToggleSwitch } from "../../components/ui";
import { useSettings } from "../../context/useSettings";
import { SettingsGroup, SettingsRow } from "./SettingsRow";

export function TransactionDefaultsSection() {
    const {
        T,
        isFeatureEnabled,
        transactionPrefs,
        updateTransactionPreference,
    } = useSettings();

    if (!isFeatureEnabled("cashflow") && !isFeatureEnabled("investments")) {
        return null;
    }

    return (
        <SettingsGroup title={T("settings_transaction_defaults")}>
            {isFeatureEnabled("cashflow") && (
                <>
                    <SettingsRow
                        label={T("settings_cf_default_verified")}
                        description={T("settings_cf_default_verified_desc")}
                        trailing={
                            <ToggleSwitch
                                id="cf-default-verified-toggle"
                                checked={
                                    !!transactionPrefs?.cashflow_default_verified
                                }
                                onChange={(v) =>
                                    updateTransactionPreference(
                                        "cashflow_default_verified",
                                        v,
                                    )
                                }
                            />
                        }
                    />
                    <SettingsRow
                        label={T("settings_cf_autofill_account")}
                        description={T("settings_cf_autofill_account_desc")}
                        trailing={
                            <ToggleSwitch
                                id="cf-autofill-account-toggle"
                                checked={
                                    !!transactionPrefs?.cashflow_autofill_last_account
                                }
                                onChange={(v) =>
                                    updateTransactionPreference(
                                        "cashflow_autofill_last_account",
                                        v,
                                    )
                                }
                            />
                        }
                    />
                </>
            )}
            {isFeatureEnabled("investments") && (
                <SettingsRow
                    label={T("settings_inv_default_verified")}
                    description={T("settings_inv_default_verified_desc")}
                    trailing={
                        <ToggleSwitch
                            id="inv-default-verified-toggle"
                            checked={
                                !!transactionPrefs?.investments_default_verified
                            }
                            onChange={(v) =>
                                updateTransactionPreference(
                                    "investments_default_verified",
                                    v,
                                )
                            }
                        />
                    }
                />
            )}
        </SettingsGroup>
    );
}
