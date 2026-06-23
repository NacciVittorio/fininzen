"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../context/AuthProvider";

const fullScreenCentered: React.CSSProperties = {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "var(--bg-2)",
    color: "var(--fg-soft)",
    fontFamily: "var(--font-sans)",
    fontSize: 14,
};

/**
 * Client-side route guard. The access token lives in memory only, so auth state
 * is known only on the client: while bootstrap resolves we render nothing, then
 * either send unauthenticated visitors to /login or render the protected tree.
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
    const { status } = useAuth();
    const router = useRouter();

    useEffect(() => {
        if (status === "unauthenticated") router.replace("/login");
    }, [status, router]);

    if (status !== "authenticated") {
        return <div style={fullScreenCentered}>Loading…</div>;
    }
    return <>{children}</>;
}
