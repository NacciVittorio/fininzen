"use client";

import { useAuth } from "../../context/useAuth";

export function AboutSettingsSection() {
    const { T } = useAuth();
    // Vite injected __APP_VERSION__ via `define`; Next inlines NEXT_PUBLIC_* env.
    const appVersion = process.env.NEXT_PUBLIC_APP_VERSION ?? "dev";

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
        </div>
    );
}
