"use client";

import type { ReactNode } from "react";
import type { Translator } from "../../types";
import type { SettingsNavigationItem } from "../../context/useDerivedAppData";
import type { ViewAsAccount } from "../../context/useAuthenticatedFetch";

type SettingsGroupMeta = { key: string; first: string; order: number };

const SETTINGS_GROUP_META: Record<string, SettingsGroupMeta> = {
    import: { key: "data", first: "import", order: 60 },
    export: { key: "data", first: "import", order: 60 },
    extra: { key: "data", first: "import", order: 60 },
    user: { key: "account", first: "user", order: 70 },
    sharing: { key: "account", first: "user", order: 70 },
    general: { key: "preferences", first: "general", order: 80 },
    privacy: { key: "preferences", first: "general", order: 80 },
    dashboard: { key: "preferences", first: "general", order: 80 },
    about: { key: "preferences", first: "general", order: 80 },
};

// Shared shape forwarded to every AccordionSection (the `accordionProps` bag the
// settings sections spread). onToggle is part of the bag but unused here.
export type AccordionProps = {
    settingsNavItems: readonly SettingsNavigationItem[];
    settingsMenu: string | null;
    onToggle: (key: string) => void;
};

export function AccordionSection({
    sectionKey,
    settingsNavItems,
    settingsMenu,
    children,
}: {
    sectionKey: string;
    settingsNavItems: readonly SettingsNavigationItem[];
    settingsMenu: string | null;
    children?: ReactNode;
}) {
    const group = SETTINGS_GROUP_META[sectionKey];
    const navKey = group?.key || sectionKey;
    const item = settingsNavItems.find((navItem) => navItem.key === navKey);
    if (!item || settingsMenu !== navKey) return null;
    return <div className="settings-section-body">{children}</div>;
}

export function SettingsRoot({
    navItems,
    onOpen,
    T,
    isDemo,
    viewAs,
    logout,
}: {
    navItems: readonly SettingsNavigationItem[];
    onOpen: (key: string) => void;
    T: Translator;
    isDemo: boolean;
    viewAs?: ViewAsAccount | null;
    logout: () => void;
}) {
    const manageKeys = [
        "categories",
        "budget",
        "recurring",
        "allocation",
        "fire",
        "data",
    ];
    const groups = [
        navItems.filter((item) => manageKeys.includes(item.key)),
        navItems.filter((item) => !manageKeys.includes(item.key)),
    ].filter((group) => group.length > 0);

    return (
        <div>
            {groups.map((items, groupIndex) => (
                <div
                    key={groupIndex}
                    className="grouped-list"
                    style={{ marginBottom: 20 }}
                >
                    {items.map((item) => (
                        <button
                            key={item.key}
                            type="button"
                            data-testid={`settings-root-${item.key}`}
                            className="grouped-list__item pressable"
                            onClick={() => onOpen(item.key)}
                            style={{ width: "100%", textAlign: "left" }}
                        >
                            <span
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 12,
                                    flex: 1,
                                    minWidth: 0,
                                }}
                            >
                                <span
                                    style={{
                                        fontSize: 17,
                                        width: 24,
                                        textAlign: "center",
                                    }}
                                >
                                    {item.icon}
                                </span>
                                <span
                                    style={{
                                        fontSize: 15,
                                        fontWeight: 500,
                                        color: "var(--fg)",
                                    }}
                                >
                                    {item.label}
                                </span>
                            </span>
                            <span
                                aria-hidden="true"
                                style={{
                                    color: "var(--fg-faint)",
                                    fontSize: 17,
                                }}
                            >
                                ›
                            </span>
                        </button>
                    ))}
                </div>
            ))}

            {!isDemo && (
                <div className="grouped-list" style={{ marginBottom: 20 }}>
                    <button
                        type="button"
                        data-testid="settings-root-logout"
                        className="grouped-list__item pressable"
                        onClick={logout}
                        style={{ width: "100%", justifyContent: "center" }}
                    >
                        <span
                            style={{
                                fontSize: 15,
                                fontWeight: 600,
                                color: "var(--danger)",
                            }}
                        >
                            {T("logout_button")}
                        </span>
                    </button>
                </div>
            )}

            {!isDemo && !viewAs && (
                <div style={{ marginBottom: 20 }}>
                    <div
                        className="grouped-list__title"
                        style={{ color: "var(--danger)" }}
                    >
                        {T("settings_danger_zone", "Danger zone")}
                    </div>
                    <div
                        className="grouped-list"
                        style={{
                            boxShadow: "inset 0 0 0 1px var(--danger-ring)",
                        }}
                    >
                        <button
                            type="button"
                            data-testid="settings-root-delete-account"
                            className="grouped-list__item pressable"
                            onClick={() => onOpen("account")}
                            style={{ width: "100%", textAlign: "left" }}
                        >
                            <span
                                style={{
                                    fontSize: 15,
                                    fontWeight: 600,
                                    color: "var(--danger)",
                                    flex: 1,
                                }}
                            >
                                {T("account_delete_title", "Delete account")}
                            </span>
                            <span
                                aria-hidden="true"
                                style={{
                                    color: "var(--fg-faint)",
                                    fontSize: 17,
                                }}
                            >
                                ›
                            </span>
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

export function SettingsSectionHeader({
    label,
    backLabel,
    onBack,
}: {
    label: ReactNode;
    backLabel: ReactNode;
    onBack: () => void;
}) {
    return (
        <div style={{ marginBottom: 16 }}>
            <button
                type="button"
                data-testid="settings-back"
                onClick={onBack}
                className="pressable"
                style={{
                    background: "none",
                    border: 0,
                    color: "var(--accent)",
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    padding: "8px 8px 8px 0",
                    fontSize: 15,
                    fontWeight: 600,
                    fontFamily: "inherit",
                    minHeight: 44,
                }}
            >
                ‹ {backLabel}
            </button>
            <h1 className="page-title" style={{ margin: 0 }}>
                {label}
            </h1>
        </div>
    );
}
