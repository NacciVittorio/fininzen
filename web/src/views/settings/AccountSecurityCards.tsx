"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Card, ToggleSwitch } from "../../components/ui";
import { useAuth } from "../../context/useAuth";
import { isWebAuthnAvailable } from "../../utils/webauthn";
import {
    createApiToken,
    listApiTokens,
    revokeApiToken,
} from "../../api/apiTokens";
import type { ApiToken } from "../../api/apiTokens";
import { formatDateTime } from "../../utils/formatters";
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
            <Card
                variant="settings"
                title={T("applock_toggle")}
                description={T("faceid_unavailable")}
            />
        );
    }

    return (
        <Card variant="settings">
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
        </Card>
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
            <Card
                variant="settings"
                title={T("mfa_setup_title")}
                description={T("mfa_scan_qr")}
            >
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
            </Card>
        );
    }

    if (step === "backup-codes") {
        return (
            <Card
                variant="settings"
                title={T("mfa_backup_codes_title")}
                description={T("mfa_backup_codes_desc")}
            >
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
            </Card>
        );
    }

    if (mfaEnabled) {
        return (
            <Card variant="settings" title={T("mfa_enable_toggle")}>
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
            </Card>
        );
    }

    return (
        <Card
            variant="settings"
            title={T("mfa_enable_toggle")}
            description={T("mfa_setup_desc")}
        >
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
        </Card>
    );
}

export function ApiTokensCard({ T }: { T: Translator }) {
    const { apiFetch } = useAuth();
    const [tokens, setTokens] = useState<ApiToken[]>([]);
    const [loading, setLoading] = useState(true);
    const [label, setLabel] = useState("");
    const [creating, setCreating] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [revealedToken, setRevealedToken] = useState<string | null>(null);
    const [revokingId, setRevokingId] = useState<number | null>(null);

    const load = async () => {
        setLoading(true);
        try {
            setTokens(await listApiTokens(apiFetch));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setError(null);
        setCreating(true);
        try {
            const created = await createApiToken(apiFetch, label.trim());
            setRevealedToken(created.token);
            setLabel("");
            await load();
        } catch {
            setError(T("api_tokens_create_error"));
        } finally {
            setCreating(false);
        }
    };

    const handleRevoke = async (id: number) => {
        setRevokingId(id);
        try {
            await revokeApiToken(apiFetch, id);
            await load();
        } finally {
            setRevokingId(null);
        }
    };

    if (revealedToken) {
        return (
            <Card
                variant="settings"
                title={T("api_tokens_reveal_title")}
                description={T("api_tokens_reveal_desc")}
            >
                <div
                    style={{
                        fontFamily: "monospace",
                        fontSize: 13,
                        background: "var(--bg-soft)",
                        padding: 10,
                        borderRadius: 8,
                        marginBottom: 12,
                        wordBreak: "break-all",
                    }}
                >
                    {revealedToken}
                </div>
                <button
                    className="btn btn-p"
                    onClick={() => setRevealedToken(null)}
                >
                    {T("api_tokens_reveal_saved")}
                </button>
            </Card>
        );
    }

    return (
        <Card
            variant="settings"
            title={T("api_tokens_title")}
            description={T("api_tokens_desc")}
        >
            <form
                onSubmit={handleCreate}
                style={{ display: "flex", gap: 8, marginBottom: 12 }}
            >
                <input
                    className="inp"
                    placeholder={T("api_tokens_label_placeholder")}
                    value={label}
                    onChange={(event) => setLabel(event.target.value)}
                    maxLength={64}
                    required
                    style={{ flex: 1 }}
                />
                <button
                    type="submit"
                    className="btn btn-p"
                    disabled={creating || !label.trim()}
                >
                    {creating ? "…" : T("api_tokens_create_button")}
                </button>
            </form>
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
            {!loading && tokens.length === 0 && (
                <div
                    style={{
                        fontSize: 12,
                        color: "var(--fg-soft)",
                        marginBottom: 4,
                    }}
                >
                    {T("api_tokens_empty")}
                </div>
            )}
            {tokens.length > 0 && (
                <div className="grouped-list">
                    {tokens.map((token) => (
                        <div
                            key={token.id}
                            className="grouped-list__item"
                            style={{ alignItems: "center", gap: 12 }}
                        >
                            <div style={{ flex: 1 }}>
                                <div style={{ fontSize: 13 }}>
                                    {token.label}
                                </div>
                                <div
                                    style={{
                                        fontSize: 11,
                                        color: "var(--fg-soft)",
                                        fontFamily: "monospace",
                                    }}
                                >
                                    {token.prefix}…{" · "}
                                    {token.last_used_at ? (
                                        <>
                                            {T("api_tokens_last_used")}:{" "}
                                            {formatDateTime(token.last_used_at)}
                                        </>
                                    ) : (
                                        T("api_tokens_never_used")
                                    )}
                                </div>
                            </div>
                            {token.revoked_at ? (
                                <span
                                    style={{
                                        fontSize: 11,
                                        color: "var(--fg-soft)",
                                    }}
                                >
                                    {T("api_tokens_revoked")}
                                </span>
                            ) : (
                                <button
                                    onClick={() => handleRevoke(token.id)}
                                    className="btn btn-r"
                                    disabled={revokingId === token.id}
                                    style={{
                                        fontSize: 11,
                                        padding: "2px 10px",
                                    }}
                                >
                                    {T("revoke_access")}
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </Card>
    );
}

export function TabSwipeCard() {
    const { T, tabSwipeEnabled, setTabSwipeEnabled } = useAuth();

    return (
        <Card variant="settings">
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
        </Card>
    );
}
