"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { useApp } from "../context/useApp";

export default function TermsGateScreen() {
    const { updateProfile, logout, T } = useApp();
    const [loading, setLoading] = useState<"accept" | "reject" | null>(null);

    const handleAccept = useCallback(async () => {
        setLoading("accept");
        // On failure the gate simply stays up — the user can retry. There's
        // no error state worth surfacing: the only failure mode is a network
        // error (terms_accepted is never rejected server-side the way
        // validate_terms_accepted rejects `false` at registration).
        await updateProfile({ terms_accepted: true });
        setLoading(null);
    }, [updateProfile]);

    const handleReject = useCallback(async () => {
        setLoading("reject");
        try {
            await updateProfile({ terms_accepted: false });
        } finally {
            logout();
        }
    }, [updateProfile, logout]);

    return (
        <div
            style={{
                minHeight: "100dvh",
                background: "var(--bg-2)",
                color: "var(--fg)",
                fontFamily: "var(--font-sans)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 20,
                paddingTop: "env(safe-area-inset-top)",
            }}
        >
            <div
                className="card"
                style={{
                    width: "100%",
                    maxWidth: 400,
                    padding: "40px 32px",
                    textAlign: "center",
                }}
            >
                <div
                    style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: 56,
                        height: 56,
                        borderRadius: 16,
                        background: "var(--accent-soft)",
                        marginBottom: 16,
                    }}
                >
                    <svg
                        width="28"
                        height="28"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="var(--accent)"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    >
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <path d="M14 2v6h6" />
                        <path d="M9 13h6" />
                        <path d="M9 17h6" />
                    </svg>
                </div>

                <div style={{ fontSize: 20, fontWeight: 600, marginBottom: 6 }}>
                    {T("terms_gate_title")}
                </div>
                <div
                    style={{
                        fontSize: 13,
                        color: "var(--fg-soft)",
                        marginBottom: 16,
                    }}
                >
                    {T("terms_gate_body")}
                </div>

                <div
                    style={{
                        fontSize: 13,
                        color: "var(--fg-soft)",
                        marginBottom: 24,
                    }}
                >
                    {T("legal_consent_prefix")}{" "}
                    <Link
                        href="/privacy"
                        target="_blank"
                        style={{ color: "var(--accent)", fontWeight: 600 }}
                    >
                        {T("legal_link_privacy")}
                    </Link>{" "}
                    {T("legal_consent_and")}{" "}
                    <Link
                        href="/terms"
                        target="_blank"
                        style={{ color: "var(--accent)", fontWeight: 600 }}
                    >
                        {T("legal_link_terms")}
                    </Link>
                </div>

                <button
                    type="button"
                    data-testid="terms-gate-accept"
                    onClick={handleAccept}
                    disabled={loading !== null}
                    className="btn btn-p"
                    style={{
                        width: "100%",
                        padding: "12px 0",
                        fontSize: 14,
                        fontWeight: 600,
                    }}
                >
                    {loading === "accept" ? "…" : T("terms_gate_accept")}
                </button>

                <button
                    type="button"
                    data-testid="terms-gate-reject"
                    onClick={handleReject}
                    disabled={loading !== null}
                    style={{
                        width: "100%",
                        marginTop: 12,
                        padding: "10px 0",
                        background: "none",
                        border: 0,
                        color: "var(--fg-soft)",
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: "pointer",
                    }}
                >
                    {loading === "reject" ? "…" : T("terms_gate_reject")}
                </button>

                <div
                    style={{
                        fontSize: 12,
                        color: "var(--fg-soft)",
                        marginTop: 16,
                    }}
                >
                    {T("terms_gate_reject_notice")}
                </div>
            </div>
        </div>
    );
}
