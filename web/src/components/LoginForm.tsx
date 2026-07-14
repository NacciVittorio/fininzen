"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useApp } from "../context/useApp";
import { getStoredCredentialId, isWebAuthnAvailable } from "../utils/webauthn";

type AuthMode = "login" | "register";

export default function LoginForm() {
    const { T, login, register, demoLogin, biometricLogin } = useApp();
    const [mode, setMode] = useState<AuthMode>("login");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [password2, setPassword2] = useState("");
    const [error, setError] = useState<string | unknown[] | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [biometricAvailable, setBiometricAvailable] = useState(false);

    // Offer passwordless sign-in only when this device has a registered passkey
    // (stored when app-lock was enabled), a remembered email to identify the
    // user, and a working platform authenticator. All checks are client-only,
    // so they run after mount to avoid a hydration mismatch.
    useEffect(() => {
        let cancelled = false;
        void (async () => {
            if (!getStoredCredentialId() || !localStorage.getItem("auth_email"))
                return;
            const ok = await isWebAuthnAvailable();
            if (!cancelled) setBiometricAvailable(ok);
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    function switchMode(next: AuthMode) {
        setMode(next);
        setError(null);
        setSuccess(null);
        setPassword2("");
    }

    async function handleDemoLogin() {
        setLoading(true);
        await demoLogin();
        setLoading(false);
    }

    async function handleBiometricLogin() {
        setError(null);
        setLoading(true);
        try {
            const ok = await biometricLogin();
            if (!ok) setError(T("login_error"));
        } catch (err) {
            // User dismissed the Face ID / Touch ID prompt — stay silent
            if ((err as { name?: string })?.name !== "NotAllowedError")
                setError(T("login_error"));
        }
        setLoading(false);
    }

    async function handleSubmit(e: FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setError(null);
        setSuccess(null);

        if (mode === "register" && password.length > 30) {
            setError(T("password_too_long"));
            return;
        }
        if (mode === "register" && password !== password2) {
            setError(T("password_mismatch"));
            return;
        }

        setLoading(true);

        if (mode === "login") {
            const ok = await login(email, password);
            if (!ok) setError(T("login_error"));
        } else {
            const result = await register(email, password, password2);
            if (result.ok) {
                setSuccess(T("register_success"));
                setMode("login");
                setPassword("");
                setPassword2("");
            } else if (result.errors) {
                setError(result.errors);
            } else if (result.status === 400) {
                setError(T("register_error_duplicate"));
            } else {
                setError(T("register_error"));
            }
        }
        setLoading(false);
    }

    const labelStyle = {
        display: "block",
        fontSize: 12,
        color: "var(--fg-soft)",
        marginBottom: 6,
    };

    return (
        <div
            style={{
                minHeight: "100vh",
                background: "var(--bg-2)",
                color: "var(--fg)",
                fontFamily: "var(--font-sans)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 20,
            }}
        >
            <div
                className="card"
                style={{ width: "100%", maxWidth: 380, padding: "40px 32px" }}
            >
                {/* Logo */}
                <div style={{ textAlign: "center", marginBottom: 32 }}>
                    <div
                        style={{
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            width: 48,
                            height: 48,
                            borderRadius: 12,
                            background: "var(--accent)",
                            boxShadow: "var(--shadow-soft)",
                            marginBottom: 12,
                        }}
                    >
                        <svg
                            width="26"
                            height="26"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="var(--btn-primary-fg)"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        >
                            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                        </svg>
                    </div>
                    <div
                        style={{
                            fontSize: 22,
                            fontWeight: 800,
                            color: "var(--fg)",
                            letterSpacing: 0,
                        }}
                    >
                        Fininzen
                    </div>
                    <div
                        style={{
                            fontSize: 12,
                            color: "var(--fg-soft)",
                            marginTop: 4,
                        }}
                    >
                        {mode === "login"
                            ? T("login_title")
                            : T("register_title")}
                    </div>
                </div>

                <form onSubmit={handleSubmit}>
                    <div style={{ marginBottom: 16 }}>
                        <label style={labelStyle}>{T("email_label")}</label>
                        <input
                            type="email"
                            className="inp"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                            autoComplete="email"
                        />
                    </div>
                    <div
                        style={{ marginBottom: mode === "register" ? 12 : 24 }}
                    >
                        <label style={labelStyle}>{T("password_label")}</label>
                        <input
                            type="password"
                            className="inp"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            autoComplete={
                                mode === "login"
                                    ? "current-password"
                                    : "new-password"
                            }
                        />
                    </div>

                    {mode === "register" && (
                        <>
                            <div style={{ marginBottom: 8 }}>
                                <label style={labelStyle}>
                                    {T("password_confirm")}
                                </label>
                                <input
                                    type="password"
                                    className="inp"
                                    value={password2}
                                    onChange={(e) =>
                                        setPassword2(e.target.value)
                                    }
                                    required
                                    autoComplete="new-password"
                                />
                            </div>
                            <div
                                style={{
                                    fontSize: 11,
                                    color: "var(--fg-soft)",
                                    marginBottom: 20,
                                    lineHeight: 1.5,
                                }}
                            >
                                {T("password_requirements")}
                            </div>
                        </>
                    )}

                    {error && (
                        <div
                            style={{
                                color: "var(--danger)",
                                fontSize: 13,
                                marginBottom: 16,
                                textAlign: "center",
                            }}
                        >
                            {Array.isArray(error) ? error.join(" ") : error}
                        </div>
                    )}
                    {success && (
                        <div
                            style={{
                                color: "var(--success)",
                                fontSize: 13,
                                marginBottom: 16,
                                textAlign: "center",
                            }}
                        >
                            {success}
                        </div>
                    )}

                    <button
                        type="submit"
                        className="btn btn-p"
                        disabled={loading}
                        style={{
                            width: "100%",
                            padding: "12px 0",
                            fontSize: 14,
                            fontWeight: 700,
                        }}
                    >
                        {loading
                            ? "…"
                            : mode === "login"
                              ? T("login_button")
                              : T("register_button")}
                    </button>
                </form>

                <div style={{ marginTop: 20, textAlign: "center" }}>
                    <button
                        onClick={() =>
                            switchMode(mode === "login" ? "register" : "login")
                        }
                        style={{
                            background: "none",
                            border: "none",
                            color: "var(--accent)",
                            fontSize: 13,
                            cursor: "pointer",
                            padding: 0,
                            fontWeight: 600,
                        }}
                    >
                        {mode === "login"
                            ? T("no_account_yet")
                            : T("already_have_account")}
                    </button>
                </div>

                {mode === "login" && (
                    <>
                        <div
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 10,
                                margin: "20px 0 0",
                            }}
                        >
                            <div
                                style={{
                                    flex: 1,
                                    height: 1,
                                    background: "var(--rule)",
                                }}
                            />
                            <span
                                style={{
                                    color: "var(--fg-soft)",
                                    fontSize: 11,
                                }}
                            >
                                {T("or_separator")}
                            </span>
                            <div
                                style={{
                                    flex: 1,
                                    height: 1,
                                    background: "var(--rule)",
                                }}
                            />
                        </div>

                        {biometricAvailable && (
                            <button
                                type="button"
                                onClick={handleBiometricLogin}
                                disabled={loading}
                                style={{
                                    width: "100%",
                                    marginTop: 14,
                                    padding: "10px 0",
                                    background: "transparent",
                                    border: "1px solid var(--accent)",
                                    borderRadius: "var(--r-pill)",
                                    color: "var(--accent)",
                                    fontSize: 13,
                                    cursor: loading ? "not-allowed" : "pointer",
                                    fontWeight: 700,
                                    opacity: loading ? 0.6 : 1,
                                }}
                            >
                                {loading ? "…" : T("login_biometric")}
                            </button>
                        )}

                        <button
                            type="button"
                            onClick={handleDemoLogin}
                            disabled={loading}
                            style={{
                                width: "100%",
                                marginTop: 14,
                                padding: "10px 0",
                                background: "var(--accent-soft)",
                                border: 0,
                                borderRadius: "var(--r-pill)",
                                color: "var(--accent)",
                                fontSize: 13,
                                cursor: loading ? "not-allowed" : "pointer",
                                fontWeight: 700,
                                opacity: loading ? 0.6 : 1,
                            }}
                        >
                            {loading ? "…" : T("try_demo")}
                        </button>
                    </>
                )}
            </div>
            <div
                style={{
                    position: "fixed",
                    bottom: 16,
                    left: 0,
                    right: 0,
                    textAlign: "center",
                    fontSize: 11,
                    color: "var(--fg-soft)",
                }}
            >
                © 2026 Vittorio Nacci. All rights reserved.
            </div>
        </div>
    );
}
