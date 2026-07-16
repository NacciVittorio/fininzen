"use client";

import Link from "next/link";

import { useAuth } from "../../context/useAuth";
import { useAppVersion } from "../../hooks/useAppVersion";
import { formatDate } from "../../utils/formatters";

export function AboutSettingsSection() {
    const { T } = useAuth();
    // Live from the backend (read from VERSION at runtime) so it stays correct
    // even if the frontend build inlined an older version; falls back to the
    // build-time constant while it loads or offline.
    const appVersion = useAppVersion();
    // Empty on a checkout with no matching CHANGELOG section — omit the row then.
    const releaseDate = process.env.NEXT_PUBLIC_RELEASE_DATE ?? "";

    return (
        <div>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
                {T("about_title")}
            </div>
            <div
                className="card"
                style={{
                    padding: 16,
                    display: "flex",
                    flexDirection: "column",
                    gap: 12,
                }}
            >
                <div
                    style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: 12,
                    }}
                >
                    <span style={{ color: "var(--fg-soft)", fontSize: 13 }}>
                        {T("about_version")}
                    </span>
                    <span
                        className="mono"
                        style={{ fontSize: 14, fontWeight: 700 }}
                    >
                        {appVersion}
                    </span>
                </div>
                {releaseDate && (
                    <div
                        style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            gap: 12,
                        }}
                    >
                        <span style={{ color: "var(--fg-soft)", fontSize: 13 }}>
                            {T("about_released_on")}
                        </span>
                        <span style={{ fontSize: 14, fontWeight: 600 }}>
                            {formatDate(releaseDate)}
                        </span>
                    </div>
                )}
                <Link
                    href="/changelog"
                    style={{
                        fontSize: 13,
                        color: "var(--accent)",
                        textDecoration: "none",
                        fontWeight: 600,
                    }}
                >
                    {T("about_whats_new")}
                </Link>
            </div>
        </div>
    );
}
