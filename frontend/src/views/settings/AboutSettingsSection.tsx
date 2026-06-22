import { useAuth } from "../../context/useAuth";

export function AboutSettingsSection() {
    const { T } = useAuth();
    const appVersion =
        typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "dev";

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
