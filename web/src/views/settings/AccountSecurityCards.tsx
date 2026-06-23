"use client";

import { useEffect, useState } from "react";
import { ToggleSwitch } from "../../components/ui";
import { useAuth } from "../../context/useAuth";
import { isWebAuthnAvailable } from "../../utils/webauthn";

export function BiometricLockCard() {
    const { T, appLockEnabled, enableAppLock, disableAppLock } = useAuth();
    const [available, setAvailable] = useState<boolean | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        isWebAuthnAvailable().then(setAvailable);
    }, []);

    const onToggle = async (checked: boolean) => {
        setError(null);
        setBusy(true);
        try {
            if (checked) await enableAppLock();
            else await disableAppLock();
        } catch (err) {
            if ((err as { name?: string })?.name === "NotAllowedError") {
                // no-op
            } else if ((err as { name?: string })?.name === "SecurityError") {
                setError(T("applock_error_domain"));
            } else {
                setError(T("applock_error"));
            }
        }
        setBusy(false);
    };

    if (available === false) {
        return (
            <div className="card" style={{ padding: 16 }}>
                <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>
                    {T("applock_toggle")}
                </div>
                <div style={{ fontSize: 13, color: "var(--fg-soft)" }}>
                    {T("faceid_unavailable")}
                </div>
            </div>
        );
    }

    return (
        <div className="card" style={{ padding: 16 }}>
            <ToggleSwitch
                id="applock-toggle"
                checked={appLockEnabled}
                disabled={busy || available === null}
                onChange={onToggle}
                label={T("applock_toggle")}
            />
            <div
                style={{
                    fontSize: 12,
                    color: "var(--fg-soft)",
                    marginTop: 8,
                    lineHeight: 1.35,
                }}
            >
                {T("applock_desc")}
            </div>
            {error && (
                <div
                    style={{
                        fontSize: 13,
                        color: "var(--danger)",
                        marginTop: 8,
                    }}
                >
                    {error}
                </div>
            )}
        </div>
    );
}

export function TabSwipeCard() {
    const { T, tabSwipeEnabled, setTabSwipeEnabled } = useAuth();

    return (
        <div className="card" style={{ padding: 16 }}>
            <ToggleSwitch
                id="tab-swipe-toggle"
                checked={tabSwipeEnabled}
                onChange={setTabSwipeEnabled}
                label={T("tab_swipe_toggle")}
            />
            <div
                style={{
                    fontSize: 12,
                    color: "var(--fg-soft)",
                    marginTop: 8,
                    lineHeight: 1.35,
                }}
            >
                {T("tab_swipe_desc")}
            </div>
        </div>
    );
}
