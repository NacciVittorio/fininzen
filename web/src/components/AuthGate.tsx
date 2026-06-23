"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "../context/useApp";

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
 * Client-side route guard. The access token lives in memory only and
 * isAuthenticated is seeded from localStorage, so auth state is known only on
 * the client: we render nothing until mounted (avoiding a hydration mismatch),
 * then either send unauthenticated visitors to /login or render the tree.
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
    const { isAuthenticated } = useApp();
    const router = useRouter();
    const [mounted, setMounted] = useState(false);

    useEffect(() => setMounted(true), []);
    useEffect(() => {
        if (mounted && !isAuthenticated) router.replace("/login");
    }, [mounted, isAuthenticated, router]);

    if (!mounted || !isAuthenticated) {
        return <div style={fullScreenCentered}>Loading…</div>;
    }
    return <>{children}</>;
}
