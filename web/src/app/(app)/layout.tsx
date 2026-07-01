import { AuthGate } from "../../components/AuthGate";
import {
    Sidebar,
    MobileBottomNav,
    AppHeader,
} from "../../components/AppChrome";

export default function AppLayout({ children }: { children: React.ReactNode }) {
    return (
        <AuthGate>
            <div
                className="app-root"
                style={{
                    minHeight: "100vh",
                    background: "var(--bg-2)",
                    color: "var(--fg)",
                    fontFamily: "var(--font-sans)",
                    display: "flex",
                }}
            >
                <Sidebar />
                <div
                    style={{
                        flex: 1,
                        minWidth: 0,
                        display: "flex",
                        flexDirection: "column",
                    }}
                >
                    <main className="app-content">
                        <AppHeader />
                        {children}
                    </main>
                </div>
                <MobileBottomNav />
            </div>
        </AuthGate>
    );
}
