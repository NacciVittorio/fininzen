import { AuthGate } from "../../components/AuthGate";
import { AppNav } from "../../components/AppNav";

export default function AppLayout({ children }: { children: React.ReactNode }) {
    return (
        <AuthGate>
            <div
                style={{
                    minHeight: "100vh",
                    background: "var(--bg-2)",
                    color: "var(--fg)",
                    fontFamily: "var(--font-sans)",
                    display: "flex",
                    flexDirection: "column",
                }}
            >
                <AppNav />
                <main style={{ flex: 1, minWidth: 0 }}>{children}</main>
            </div>
        </AuthGate>
    );
}
