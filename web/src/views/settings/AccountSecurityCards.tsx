"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { ToggleSwitch } from "../../components/ui";
import { useAuth } from "../../context/useAuth";
import { isWebAuthnAvailable } from "../../utils/webauthn";
import type { Translator } from "../../types";

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

type MfaSetupResult =
    | { ok: true; secret: string; qrSvgBase64: string }
    | { ok: false; errorKey: string };
type MfaEnableResult =
    { ok: true; backupCodes: string[] } | { ok: false; errorKey: string };
type MfaActionResult = { ok: true } | { ok: false; errorKey?: string };

type MfaStep = "idle" | "setup" | "backup-codes";

export function MfaCard({
    T,
    mfaEnabled,
    mfaSetup,
    mfaEnable,
    mfaDisable,
}: {
    T: Translator;
    mfaEnabled: boolean;
    mfaSetup: () => Promise<MfaSetupResult>;
    mfaEnable: (code: string) => Promise<MfaEnableResult>;
    mfaDisable: (password: string) => Promise<MfaActionResult>;
}) {
    const [step, setStep] = useState<MfaStep>("idle");
    const [secret, setSecret] = useState("");
    const [qrSvgBase64, setQrSvgBase64] = useState("");
    const [code, setCode] = useState("");
    const [backupCodes, setBackupCodes] = useState<string[]>([]);
    const [disablePassword, setDisablePassword] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const startSetup = async () => {
        setError(null);
        setBusy(true);
        const result = await mfaSetup();
        setBusy(false);
        if (result.ok) {
            setSecret(result.secret);
            setQrSvgBase64(result.qrSvgBase64);
            setStep("setup");
        } else {
            setError(T(result.errorKey));
        }
    };

    const confirmSetup = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setError(null);
        setBusy(true);
        const result = await mfaEnable(code);
        setBusy(false);
        if (result.ok) {
            setBackupCodes(result.backupCodes);
            setCode("");
            setStep("backup-codes");
        } else {
            setError(T(result.errorKey));
        }
    };

    const finishBackupCodes = () => {
        setBackupCodes([]);
        setStep("idle");
    };

    const handleDisable = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setError(null);
        setBusy(true);
        const result = await mfaDisable(disablePassword);
        setBusy(false);
        if (result.ok) {
            setDisablePassword("");
        } else {
            setError(T(result.errorKey ?? "error_save_failed"));
        }
    };

    if (step === "setup") {
        return (
            <div className="card" style={{ padding: 16 }}>
                <div
                    style={{ fontSize: 15, fontWeight: 600, marginBottom: 10 }}
                >
                    {T("mfa_setup_title")}
                </div>
                <div
                    style={{
                        fontSize: 13,
                        color: "var(--fg-soft)",
                        marginBottom: 10,
                    }}
                >
                    {T("mfa_scan_qr")}
                </div>
                {qrSvgBase64 && (
                    // next/image doesn't optimize inline data: URIs — this is a
                    // locally generated SVG, not a remote image to optimize.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                        src={`data:image/svg+xml;base64,${qrSvgBase64}`}
                        alt={T("mfa_setup_title")}
                        width={180}
                        height={180}
                        style={{
                            background: "#fff",
                            borderRadius: 8,
                            marginBottom: 10,
                        }}
                    />
                )}
                <div
                    style={{
                        fontSize: 12,
                        color: "var(--fg-soft)",
                        marginBottom: 10,
                        wordBreak: "break-all",
                    }}
                >
                    {T("mfa_manual_secret")}: {secret}
                </div>
                <form
                    onSubmit={confirmSetup}
                    style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 10,
                    }}
                >
                    <input
                        className="inp"
                        placeholder={T("mfa_enter_code")}
                        value={code}
                        onChange={(event) => setCode(event.target.value)}
                        inputMode="numeric"
                        autoComplete="one-time-code"
                    />
                    {error && (
                        <div style={{ fontSize: 13, color: "var(--danger)" }}>
                            {error}
                        </div>
                    )}
                    <div style={{ display: "flex", gap: 8 }}>
                        <button
                            type="submit"
                            className="btn btn-p"
                            disabled={busy || !code}
                        >
                            {busy ? "…" : T("mfa_enable_confirm")}
                        </button>
                        <button
                            type="button"
                            className="btn"
                            onClick={() => {
                                setStep("idle");
                                setError(null);
                                setCode("");
                            }}
                        >
                            {T("btn_cancel")}
                        </button>
                    </div>
                </form>
            </div>
        );
    }

    if (step === "backup-codes") {
        return (
            <div className="card" style={{ padding: 16 }}>
                <div
                    style={{ fontSize: 15, fontWeight: 600, marginBottom: 10 }}
                >
                    {T("mfa_backup_codes_title")}
                </div>
                <div
                    style={{
                        fontSize: 13,
                        color: "var(--fg-soft)",
                        marginBottom: 10,
                    }}
                >
                    {T("mfa_backup_codes_desc")}
                </div>
                <div
                    style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: 6,
                        fontFamily: "monospace",
                        fontSize: 13,
                        background: "var(--bg-soft)",
                        padding: 10,
                        borderRadius: 8,
                        marginBottom: 12,
                    }}
                >
                    {backupCodes.map((backupCode) => (
                        <span key={backupCode}>{backupCode}</span>
                    ))}
                </div>
                <button className="btn btn-p" onClick={finishBackupCodes}>
                    {T("mfa_backup_codes_saved")}
                </button>
            </div>
        );
    }

    if (mfaEnabled) {
        return (
            <div className="card" style={{ padding: 16 }}>
                <div
                    style={{ fontSize: 15, fontWeight: 600, marginBottom: 10 }}
                >
                    {T("mfa_enable_toggle")}
                </div>
                <div
                    style={{
                        fontSize: 13,
                        color: "var(--success)",
                        marginBottom: 10,
                    }}
                >
                    {T("mfa_status_enabled")}
                </div>
                <form
                    onSubmit={handleDisable}
                    style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 10,
                    }}
                >
                    <input
                        className="inp"
                        type="password"
                        placeholder={T("current_password")}
                        value={disablePassword}
                        onChange={(event) =>
                            setDisablePassword(event.target.value)
                        }
                        autoComplete="current-password"
                    />
                    {error && (
                        <div style={{ fontSize: 13, color: "var(--danger)" }}>
                            {error}
                        </div>
                    )}
                    <button
                        type="submit"
                        className="btn"
                        disabled={busy || !disablePassword}
                        style={{ alignSelf: "flex-start" }}
                    >
                        {busy ? "…" : T("mfa_disable_button")}
                    </button>
                </form>
            </div>
        );
    }

    return (
        <div className="card" style={{ padding: 16 }}>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 10 }}>
                {T("mfa_enable_toggle")}
            </div>
            <div
                style={{
                    fontSize: 13,
                    color: "var(--fg-soft)",
                    marginBottom: 10,
                }}
            >
                {T("mfa_setup_desc")}
            </div>
            {error && (
                <div
                    style={{
                        fontSize: 13,
                        color: "var(--danger)",
                        marginBottom: 10,
                    }}
                >
                    {error}
                </div>
            )}
            <button className="btn btn-p" onClick={startSetup} disabled={busy}>
                {busy ? "…" : T("mfa_setup_start")}
            </button>
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
