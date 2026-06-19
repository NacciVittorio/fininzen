import type { Dispatch, ReactNode, SetStateAction } from "react";
import type { FeatureKey } from "../context/appContextHelpers";
import { useApp } from "../context/useApp";
import type { Translator } from "../types";
import { Icon, NavItem } from "./ui";

const NAV_DEFINITIONS = [
    ["dashboard", "dashboard", "dashboard"],
    ["expenses", "cashflow", "cashflow"],
    ["accounts", "accounts", "accounts"],
    ["portfolio", "investments", "investments"],
    ["fire", "fire", "fire"],
    ["settings", null, "settings"],
] as const satisfies readonly (readonly [string, FeatureKey | null, string])[];

export type NavigationItem = {
    id: string;
    feature: FeatureKey | null;
    icon: ReactNode;
    labelKey: string;
    shortKey: string;
};

export const NAV_ITEMS: NavigationItem[] = NAV_DEFINITIONS.map(
    ([id, feature, icon]) => ({
        id,
        feature,
        icon: <Icon name={icon} />,
        labelKey: `tab_${id === "expenses" ? "cashflow" : id === "portfolio" ? "investments" : id}`,
        shortKey: `tab_${id === "expenses" ? "cashflow" : id === "portfolio" ? "investments" : id}_short`,
    }),
);

type NavigationProps = {
    tab: string;
    setTab: Dispatch<SetStateAction<string>>;
    T: Translator;
    navItems: readonly NavigationItem[];
};

type SidebarProps = NavigationProps & {
    isDemo: boolean;
};

export function Sidebar({ tab, setTab, T, navItems, isDemo }: SidebarProps) {
    return (
        <aside
            className="app-sidebar"
            style={{
                width: 220,
                flexShrink: 0,
                background:
                    "color-mix(in oklab, var(--bg-2) 90%, var(--card) 10%)",
                backdropFilter: "saturate(160%) blur(18px)",
                WebkitBackdropFilter: "saturate(160%) blur(18px)",
                borderRight: "1px solid var(--rule)",
                padding: "32px 16px",
                display: "flex",
                flexDirection: "column",
                position: "sticky",
                top: 0,
                height: "100vh",
            }}
        >
            <div
                style={{
                    padding: "0 12px 32px",
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                }}
            >
                <div
                    style={{
                        width: 12,
                        height: 12,
                        borderRadius: 999,
                        background: "var(--accent)",
                        boxShadow: "var(--shadow-soft)",
                    }}
                />
                <div
                    style={{
                        fontWeight: 800,
                        fontSize: 18,
                        letterSpacing: 0,
                        color: "var(--fg)",
                    }}
                >
                    Fininzen
                </div>
            </div>
            {isDemo && (
                <div
                    style={{
                        margin: "0 12px 16px",
                        padding: "4px 10px",
                        background: "var(--accent-soft)",
                        borderRadius: "var(--r-pill)",
                        color: "var(--accent)",
                        fontSize: 11,
                        fontWeight: 700,
                        textAlign: "center",
                        letterSpacing: "0.05em",
                    }}
                >
                    DEMO
                </div>
            )}
            {navItems.map((item) => (
                <NavItem
                    key={item.id}
                    icon={item.icon}
                    label={T(item.labelKey)}
                    active={tab === item.id}
                    onClick={() => setTab(item.id)}
                />
            ))}
        </aside>
    );
}

export function MobileBottomNav({ tab, setTab, T, navItems }: NavigationProps) {
    return (
        <nav
            className="app-bottom-nav"
            style={{
                position: "fixed",
                left: 0,
                right: 0,
                bottom: 0,
                background:
                    "color-mix(in oklab, var(--bg-2) 88%, var(--card) 12%)",
                backdropFilter: "saturate(160%) blur(18px)",
                WebkitBackdropFilter: "saturate(160%) blur(18px)",
                borderTop: "1px solid var(--rule)",
                padding: "6px 8px calc(6px + env(safe-area-inset-bottom))",
                display: "none",
                justifyContent: "space-around",
                zIndex: 10,
                boxShadow: "var(--shadow-soft)",
            }}
        >
            {navItems.map((item) => {
                const active = tab === item.id;
                return (
                    <button
                        key={item.id}
                        type="button"
                        className="pressable"
                        onClick={() => setTab(item.id)}
                        aria-current={active ? "page" : undefined}
                        aria-label={T(item.labelKey)}
                        style={{
                            flex: "1 1 0",
                            minWidth: 0,
                            background: active
                                ? "var(--accent-soft)"
                                : "transparent",
                            border: 0,
                            borderRadius: 12,
                            cursor: "pointer",
                            minHeight: 52,
                            padding: "6px 4px",
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: 4,
                            color: active
                                ? "var(--accent-deep)"
                                : "var(--fg-soft)",
                            fontWeight: active ? 700 : 500,
                            fontSize: 11,
                            transition: "background 0.15s, color 0.15s",
                        }}
                    >
                        <span
                            style={{
                                display: "inline-flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: 20,
                                lineHeight: 1,
                            }}
                        >
                            {item.icon}
                        </span>
                        <span
                            style={{
                                lineHeight: 1.1,
                                textAlign: "center",
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                maxWidth: "100%",
                            }}
                        >
                            {T(item.shortKey)}
                        </span>
                    </button>
                );
            })}
        </nav>
    );
}

export function AppHeader() {
    const { T, viewAs, switchAccount, grants } = useApp();
    const receivedGrants = grants?.received ?? [];
    return (
        <div
            className="app-header-top"
            style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 16,
                flexWrap: "wrap",
                marginBottom: 20,
            }}
        >
            <div
                className="app-header-brand-mobile"
                style={{ display: "none", alignItems: "center", gap: 10 }}
            >
                <div
                    style={{
                        width: 12,
                        height: 12,
                        borderRadius: 999,
                        background: "var(--accent)",
                        boxShadow: "var(--shadow-soft)",
                    }}
                />
                <div
                    style={{
                        fontWeight: 800,
                        fontSize: 18,
                        letterSpacing: 0,
                        color: "var(--fg)",
                    }}
                >
                    Fininzen
                </div>
            </div>
            <div
                className="app-header-actions"
                style={{
                    display: "flex",
                    gap: 10,
                    alignItems: "center",
                    flexWrap: "wrap",
                    justifyContent: "flex-end",
                    marginLeft: "auto",
                }}
            >
                {receivedGrants.length > 0 && (
                    <select
                        value={viewAs ? viewAs.userId : ""}
                        onChange={(event) => {
                            if (!event.target.value) return switchAccount(null);
                            const grant = receivedGrants.find(
                                (item) =>
                                    String(item.owner_id) ===
                                    event.target.value,
                            );
                            if (grant) switchAccount(grant);
                        }}
                        style={{
                            background: "var(--card)",
                            boxShadow: "var(--shadow-soft)",
                            border: 0,
                            borderRadius: 999,
                            color: "var(--fg)",
                            cursor: "pointer",
                            fontSize: 12,
                            minHeight: 36,
                            padding: "8px 12px",
                        }}
                    >
                        <option value="">{T("my_data")}</option>
                        {receivedGrants.map((grant) => (
                            <option key={grant.owner_id} value={grant.owner_id}>
                                {grant.owner_email}
                            </option>
                        ))}
                    </select>
                )}
            </div>
        </div>
    );
}

type BannerTone = "info" | "warning" | "danger";

type BannerProps = {
    tone?: BannerTone;
    children: ReactNode;
    onClose?: () => void;
};

const BANNER_STYLES: Record<
    BannerTone,
    { bg: string; fg: string; border: string }
> = {
    info: {
        bg: "var(--accent-soft)",
        fg: "var(--accent)",
        border: "var(--accent-ring)",
    },
    warning: {
        bg: "var(--warning-soft)",
        fg: "var(--warning)",
        border: "var(--warning-ring)",
    },
    danger: {
        bg: "var(--danger-soft)",
        fg: "var(--danger)",
        border: "var(--danger-ring)",
    },
};

export function Banner({ tone = "info", children, onClose }: BannerProps) {
    const styles = BANNER_STYLES[tone];
    return (
        <div
            style={{
                background: styles.bg,
                borderBottom: `1px solid ${styles.border}`,
                padding: "8px 20px",
                minHeight: 44,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12,
                color: styles.fg,
                fontSize: 12,
            }}
        >
            <span style={{ flex: 1 }}>{children}</span>
            {onClose && (
                <button
                    type="button"
                    onClick={onClose}
                    aria-label="Close"
                    style={{
                        background: "none",
                        border: 0,
                        color: styles.fg,
                        cursor: "pointer",
                        fontSize: 16,
                        lineHeight: 1,
                        minWidth: 44,
                        minHeight: 44,
                        padding: 0,
                    }}
                >
                    ×
                </button>
            )}
        </div>
    );
}
