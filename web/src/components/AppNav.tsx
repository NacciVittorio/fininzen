"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useApp } from "../context/useApp";

// Real routes replace the old setTab + localStorage tab model. Order mirrors the
// Vite app's NAV_ITEMS.
export const NAV_ITEMS = [
    { href: "/dashboard", labelKey: "tab_dashboard" },
    { href: "/cashflow", labelKey: "tab_cashflow" },
    { href: "/accounts", labelKey: "tab_accounts" },
    { href: "/portfolio", labelKey: "tab_investments" },
    { href: "/fire", labelKey: "tab_fire" },
    { href: "/settings", labelKey: "tab_settings" },
] as const;

export function AppNav() {
    const { T, logout, user } = useApp();
    const pathname = usePathname();

    return (
        <nav
            style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                padding: "10px 16px",
                borderBottom: "1px solid var(--rule)",
                background: "var(--bg-1)",
            }}
        >
            <strong style={{ marginRight: 16 }}>Fininzen</strong>
            {NAV_ITEMS.map((item) => {
                const active = pathname.startsWith(item.href);
                return (
                    <Link
                        key={item.href}
                        href={item.href}
                        style={{
                            padding: "6px 12px",
                            borderRadius: "var(--r-pill)",
                            fontSize: 13,
                            fontWeight: active ? 700 : 500,
                            color: active ? "var(--accent)" : "var(--fg-soft)",
                            background: active
                                ? "var(--accent-soft)"
                                : "transparent",
                            textDecoration: "none",
                        }}
                    >
                        {T(item.labelKey)}
                    </Link>
                );
            })}
            <span style={{ flex: 1 }} />
            {user && (
                <span style={{ fontSize: 12, color: "var(--fg-soft)" }}>
                    {user}
                </span>
            )}
            <button
                onClick={logout}
                className="btn"
                style={{
                    marginLeft: 12,
                    fontSize: 13,
                    padding: "6px 14px",
                }}
            >
                {T("logout_button")}
            </button>
        </nav>
    );
}
