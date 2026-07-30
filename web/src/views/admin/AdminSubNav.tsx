"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useApp } from "../../context/useApp";

const LINKS = [
    { href: "/admin", labelKey: "admin_nav_overview" },
    { href: "/admin/users", labelKey: "admin_nav_users" },
    { href: "/admin/records", labelKey: "admin_nav_records" },
    { href: "/admin/audit-log", labelKey: "admin_nav_audit_log" },
    { href: "/admin/health", labelKey: "admin_nav_health" },
] as const;

export default function AdminSubNav() {
    const { T } = useApp();
    const pathname = usePathname();

    return (
        <div
            style={{
                display: "flex",
                gap: 4,
                flexWrap: "wrap",
                marginBottom: 20,
                borderBottom: "1px solid var(--rule)",
                paddingBottom: 4,
            }}
        >
            {LINKS.map((link) => {
                const active =
                    link.href === "/admin"
                        ? pathname === "/admin"
                        : pathname.startsWith(link.href);
                return (
                    <Link
                        key={link.href}
                        href={link.href}
                        aria-current={active ? "page" : undefined}
                        style={{
                            padding: "6px 12px",
                            borderRadius: 10,
                            fontSize: 13,
                            fontWeight: active ? 600 : 400,
                            color: active
                                ? "var(--accent-deep)"
                                : "var(--fg-soft)",
                            background: active
                                ? "var(--accent-soft)"
                                : "transparent",
                            textDecoration: "none",
                        }}
                    >
                        {T(link.labelKey)}
                    </Link>
                );
            })}
        </div>
    );
}
