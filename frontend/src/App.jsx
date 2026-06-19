import {
  lazy,
  Suspense,
  Fragment,
  useState,
  useEffect,
  useRef,
  useCallback,
} from "react";
import { AppProvider } from "./context/AppContext";
import { useApp } from "./context/useApp";
import LoginView from "./views/LoginView";
import AppLockScreen from "./components/AppLockScreen";
import DemoModal from "./components/DemoModal";
import TaxPropagationModal from "./components/TaxPropagationModal";
import { Icon, NavItem } from "./components/ui";

const DashboardView = lazy(() => import("./views/DashboardView"));
const ExpensesView = lazy(() => import("./views/ExpensesView"));
const BankAccountsView = lazy(() => import("./views/BankAccountsView"));
const PortfolioView = lazy(() => import("./views/PortfolioView"));
const SettingsView = lazy(() => import("./views/SettingsView"));
const FireView = lazy(() => import("./views/FireView"));

const NAV_ITEMS = [
  {
    id: "dashboard",
    feature: "dashboard",
    icon: <Icon name="dashboard" />,
    labelKey: "tab_dashboard",
    shortKey: "tab_dashboard_short",
  },
  {
    id: "expenses",
    feature: "cashflow",
    icon: <Icon name="cashflow" />,
    labelKey: "tab_cashflow",
    shortKey: "tab_cashflow_short",
  },
  {
    id: "accounts",
    feature: "accounts",
    icon: <Icon name="accounts" />,
    labelKey: "tab_accounts",
    shortKey: "tab_accounts_short",
  },
  {
    id: "portfolio",
    feature: "investments",
    icon: <Icon name="investments" />,
    labelKey: "tab_investments",
    shortKey: "tab_investments_short",
  },
  {
    id: "fire",
    feature: "fire",
    icon: <Icon name="fire" />,
    labelKey: "tab_fire",
    shortKey: "tab_fire_short",
  },
  {
    id: "settings",
    icon: <Icon name="settings" />,
    labelKey: "tab_settings",
    shortKey: "tab_settings_short",
  },
];

function Sidebar({ tab, setTab, T, navItems, isDemo }) {
  return (
    <aside
      className="app-sidebar"
      style={{
        width: 220,
        flexShrink: 0,
        background: "color-mix(in oklab, var(--bg-2) 90%, var(--card) 10%)",
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
          Finnet
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
      {navItems.map((it) => (
        <NavItem
          key={it.id}
          icon={it.icon}
          label={T(it.labelKey)}
          active={tab === it.id}
          onClick={() => setTab(it.id)}
        />
      ))}
    </aside>
  );
}

function MobileBottomNav({ tab, setTab, T, navItems }) {
  return (
    <nav
      className="app-bottom-nav"
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        background: "color-mix(in oklab, var(--bg-2) 88%, var(--card) 12%)",
        backdropFilter: "saturate(160%) blur(18px)",
        WebkitBackdropFilter: "saturate(160%) blur(18px)",
        borderTop: "1px solid var(--rule)",
        padding: `6px 8px calc(6px + env(safe-area-inset-bottom))`,
        display: "none",
        justifyContent: "space-around",
        zIndex: 10,
        boxShadow: "var(--shadow-soft)",
      }}
    >
      {navItems.map((it) => {
        const active = tab === it.id;
        return (
          <button
            key={it.id}
            type="button"
            className="pressable"
            onClick={() => setTab(it.id)}
            aria-current={active ? "page" : undefined}
            aria-label={T(it.labelKey)}
            style={{
              flex: "1 1 0",
              minWidth: 0,
              background: active ? "var(--accent-soft)" : "transparent",
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
              color: active ? "var(--accent-deep)" : "var(--fg-soft)",
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
              {it.icon}
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
              {T(it.shortKey)}
            </span>
          </button>
        );
      })}
    </nav>
  );
}

function AppHeader() {
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
      {/* Mobile brand mark — hidden on desktop (sidebar already shows it) */}
      <div
        className="app-header-brand-mobile"
        style={{
          display: "none",
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
          Finnet
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
            onChange={(e) => {
              if (!e.target.value) {
                switchAccount(null);
                return;
              }
              const g = receivedGrants.find(
                (g) => String(g.owner_id) === e.target.value,
              );
              if (g) switchAccount(g);
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
            {receivedGrants.map((g) => (
              <option key={g.owner_id} value={g.owner_id}>
                {g.owner_email}
              </option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
}

function Banner({ tone, children, onClose }) {
  const styles = {
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
  }[tone || "info"];
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

// ── Swipe-to-navigate-tabs hook (mobile only) ─────────────────────────────────

function useTabSwipe(visibleNavItems, tab, setTab, enabled) {
  const startRef = useRef(null);

  const onTouchStart = useCallback(
    (e) => {
      if (!enabled || window.innerWidth >= 760) return;
      // Don't interfere with swipeable list rows
      if (e.target.closest("[data-swipe-row]")) return;
      const t = e.touches[0];
      startRef.current = { x: t.clientX, y: t.clientY };
    },
    [enabled],
  );

  const onTouchEnd = useCallback(
    (e) => {
      if (!startRef.current) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - startRef.current.x;
      const dy = t.clientY - startRef.current.y;
      startRef.current = null;

      // Only horizontal gestures with meaningful distance, not scrolls
      if (Math.abs(dx) < 60 || Math.abs(dy) > Math.abs(dx) * 0.7) return;

      const ids = visibleNavItems.map((it) => it.id);
      const idx = ids.indexOf(tab);
      if (idx === -1) return;

      if (dx < 0 && idx < ids.length - 1) setTab(ids[idx + 1]);
      else if (dx > 0 && idx > 0) setTab(ids[idx - 1]);
    },
    [visibleNavItems, tab, setTab],
  );

  return { onTouchStart, onTouchEnd };
}

// ── AppShell ──────────────────────────────────────────────────────────────────

function AppShell() {
  const {
    tab,
    setTab,
    T,
    fetchError,
    setFetchError,
    isAuthenticated,
    isLocked,
    logout,
    isDemo,
    authSessionNonce,
    viewAs,
    switchAccount,
    isFeatureEnabled,
    tabSwipeEnabled,
  } = useApp();
  const [demoBannerDismissed, setDemoBannerDismissed] = useState(
    () => localStorage.getItem("demoBannerDismissed") === "1",
  );
  const dismissDemoBanner = () => {
    localStorage.setItem("demoBannerDismissed", "1");
    setDemoBannerDismissed(true);
  };

  const viewLoadingFallback = (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        padding: "60px 0",
        color: "var(--fg-soft)",
        fontSize: 14,
      }}
    >
      Loading…
    </div>
  );
  const visibleNavItems = NAV_ITEMS.filter(
    (item) => !item.feature || isFeatureEnabled(item.feature),
  );
  const { onTouchStart, onTouchEnd } = useTabSwipe(
    visibleNavItems,
    tab,
    setTab,
    tabSwipeEnabled,
  );

  return (
    <Fragment key={`${isAuthenticated ? "auth" : "guest"}:${authSessionNonce}`}>
      {!isAuthenticated ? (
        <LoginView />
      ) : isLocked ? (
        <AppLockScreen />
      ) : (
        <div
          className="app-canvas app-root"
          style={{
            minHeight: "100vh",
            display: "flex",
            background: "var(--bg-2)",
            color: "var(--fg)",
            fontFamily: "var(--font-sans)",
            paddingTop: "env(safe-area-inset-top)",
          }}
        >
          <DemoModal />
          <TaxPropagationModal />

          <Sidebar
            tab={tab}
            setTab={setTab}
            T={T}
            navItems={visibleNavItems}
            isDemo={isDemo}
          />

          <main
            onTouchStart={onTouchStart}
            onTouchEnd={onTouchEnd}
            style={{
              flex: 1,
              minWidth: 0,
              display: "flex",
              flexDirection: "column",
            }}
          >
            {isDemo && !demoBannerDismissed && (
              <Banner tone="info" onClose={dismissDemoBanner}>
                {T("demo_banner_text")}{" "}
                <button
                  data-testid="demo-logout-cta"
                  onClick={logout}
                  style={{
                    marginLeft: 8,
                    background: "var(--accent)",
                    border: 0,
                    borderRadius: 999,
                    color: "var(--btn-primary-fg)",
                    cursor: "pointer",
                    fontSize: 12,
                    minHeight: 44,
                    padding: "8px 14px",
                    fontWeight: 700,
                  }}
                >
                  {T("demo_banner_cta")}
                </button>
              </Banner>
            )}

            {fetchError && (
              <Banner tone="danger" onClose={() => setFetchError(null)}>
                {fetchError}
              </Banner>
            )}

            {viewAs && (
              <Banner tone="warning" onClose={() => switchAccount(null)}>
                {T("viewing_as")}: <strong>{viewAs.email}</strong>
                {viewAs.permission === "read" && (
                  <span style={{ marginLeft: 6, opacity: 0.7 }}>
                    ({T("permission_read")})
                  </span>
                )}
              </Banner>
            )}

            <div className="app-content" style={{ flex: 1 }}>
              <AppHeader />

              <Suspense fallback={viewLoadingFallback}>
                {tab === "dashboard" && <DashboardView />}
                {tab === "expenses" && <ExpensesView />}
                {tab === "accounts" && <BankAccountsView />}
                {tab === "portfolio" && <PortfolioView />}
                {tab === "fire" && <FireView />}
                {tab === "settings" && <SettingsView />}
              </Suspense>
            </div>
          </main>

          <MobileBottomNav
            tab={tab}
            setTab={setTab}
            T={T}
            navItems={visibleNavItems}
          />
        </div>
      )}
    </Fragment>
  );
}

export default function App() {
  return (
    <AppProvider>
      <AppShell />
    </AppProvider>
  );
}
