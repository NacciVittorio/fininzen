"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Icon } from "../../components/ui";
import type { Translator } from "../../types";
import type { SettingsNavigationItem } from "../../context/useDerivedAppData";

export function SettingsRoot({
    navItems,
    T,
    logout,
    isAdmin,
}: {
    navItems: readonly SettingsNavigationItem[];
    T: Translator;
    logout: () => void;
    isAdmin?: boolean;
}) {
    return (
        <div>
            <div className="grouped-list settings-root__group">
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
                            <span className="settings-nav-icon">
                                <Icon name={item.icon} size={18} />
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

            {isAdmin && (
                <div className="grouped-list settings-root__group">
                    <Link
                        href="/admin"
                        data-testid="settings-root-admin"
                        className="grouped-list__item pressable"
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
                            <span className="settings-nav-icon">
                                <Icon name="shield" />
                            </span>
                            <span
                                style={{
                                    fontSize: 15,
                                    fontWeight: 500,
                                    color: "var(--fg)",
                                }}
                            >
                                {T("tab_admin")}
                            </span>
                        </span>
                        <span
                            aria-hidden="true"
                            style={{ color: "var(--fg-faint)", fontSize: 17 }}
                        >
                            ›
                        </span>
                    </Link>
                </div>
            )}

            <div className="grouped-list settings-root__group">
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
    return (
        <div className="settings-section-header">
            {backHref ? (
                <Link
                    href={backHref}
                    data-testid="settings-back"
                    className="settings-section-header__back pressable"
                    style={{ textDecoration: "none" }}
                >
                    ‹ {backLabel}
                </Link>
            ) : (
                <button
                    type="button"
                    data-testid="settings-back"
                    onClick={onBack}
                    className="settings-section-header__back pressable"
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
