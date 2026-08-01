"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import type { Translator } from "../../types";
import type { SettingsNavigationItem } from "../../context/useDerivedAppData";

export function SettingsRoot({
    navItems,
    T,
    logout,
}: {
    navItems: readonly SettingsNavigationItem[];
    T: Translator;
    logout: () => void;
}) {
    return (
        <div>
            <div className="grouped-list" style={{ marginBottom: 20 }}>
                {navItems.map((item) => (
                    <Link
                        key={item.key}
                        href={item.href}
                        data-testid={`settings-root-${item.key}`}
                        className="grouped-list__item pressable"
                        style={{
                            width: "100%",
                            textAlign: "left",
                            textDecoration: "none",
                        }}
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
                    </Link>
                ))}
            </div>

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
        </div>
    );
}

export function SettingsSectionHeader({
    label,
    backLabel,
    backHref,
    onBack,
}: {
    label: ReactNode;
    backLabel: ReactNode;
    backHref?: string;
    onBack?: () => void;
}) {
    const backStyle = {
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
    } as const;

    return (
        <div style={{ marginBottom: 16 }}>
            {backHref ? (
                <Link
                    href={backHref}
                    data-testid="settings-back"
                    className="pressable"
                    style={{ ...backStyle, textDecoration: "none" }}
                >
                    ‹ {backLabel}
                </Link>
            ) : (
                <button
                    type="button"
                    data-testid="settings-back"
                    onClick={onBack}
                    className="pressable"
                    style={backStyle}
                >
                    ‹ {backLabel}
                </button>
            )}
            <h1 className="page-title" style={{ margin: 0 }}>
                {label}
            </h1>
        </div>
    );
}
