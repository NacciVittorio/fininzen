import { lazy, Suspense, Fragment, useState } from "react";
import { AppProvider } from "./context/AppProvider";
import { useApp } from "./context/useApp";
import LoginView from "./views/LoginView";
import AppLockScreen from "./components/AppLockScreen";
import DemoModal from "./components/DemoModal";
import TaxPropagationModal from "./components/TaxPropagationModal";
import {
    AppHeader,
    Banner,
    MobileBottomNav,
    NAV_ITEMS,
    Sidebar,
} from "./components/AppChrome";
import { useTabSwipe } from "./components/useTabSwipe";

const DashboardView = lazy(() => import("./views/DashboardView"));
const ExpensesView = lazy(() => import("./views/ExpensesView"));
const BankAccountsView = lazy(() => import("./views/BankAccountsView"));
const PortfolioView = lazy(() => import("./views/PortfolioView"));
const SettingsView = lazy(() => import("./views/SettingsView"));
const FireView = lazy(() => import("./views/FireView"));

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
        <Fragment
            key={`${isAuthenticated ? "auth" : "guest"}:${authSessionNonce}`}
        >
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
                            <Banner
                                tone="danger"
                                onClose={() => setFetchError(null)}
                            >
                                {fetchError}
                            </Banner>
                        )}

                        {viewAs && (
                            <Banner
                                tone="warning"
                                onClose={() => switchAccount(null)}
                            >
                                {T("viewing_as")}:{" "}
                                <strong>{viewAs.email}</strong>
                                {viewAs.permission === "read" && (
                                    <span
                                        style={{ marginLeft: 6, opacity: 0.7 }}
                                    >
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
