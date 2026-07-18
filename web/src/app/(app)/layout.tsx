import { AuthGate } from "../../components/AuthGate";
import {
    Sidebar,
    MobileBottomNav,
    AppHeader,
    OfflineBanner,
} from "../../components/AppChrome";
import ToastHost from "../../components/ui/ToastHost";
import { AppLockGate } from "../../components/AppLockGate";
import DemoModal from "../../components/DemoModal";
import TaxPropagationModal from "../../components/TaxPropagationModal";
import ReleaseNotesBar from "../../components/ReleaseNotesBar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
    return (
        <AuthGate>
            <AppLockGate>
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
                            <div className="page-container">
                                <OfflineBanner />
                                <AppHeader />
                                {children}
                            </div>
                        </main>
                    </div>
                    <MobileBottomNav />
                    <ToastHost />
                    <DemoModal />
                    <TaxPropagationModal />
                    <ReleaseNotesBar />
                </div>
            </AppLockGate>
        </AuthGate>
    );
}
