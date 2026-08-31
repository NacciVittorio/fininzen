"use client";

import { GroupedList, ToggleSwitch } from "../../components/ui";
import { useSettings } from "../../context/useSettings";

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
        <GroupedList title={T("settings_transaction_defaults")}>
            {isFeatureEnabled("cashflow") && (
                <>
                    <GroupedList.Item
                        label={T("settings_cf_default_verified")}
                        subtitle={T("settings_cf_default_verified_desc")}
                        action={
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
                    <GroupedList.Item
                        label={T("settings_cf_autofill_account")}
                        subtitle={T("settings_cf_autofill_account_desc")}
                        action={
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
                <GroupedList.Item
                    label={T("settings_inv_default_verified")}
                    subtitle={T("settings_inv_default_verified_desc")}
                    action={
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
        </GroupedList>
    );
}
