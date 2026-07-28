"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "../context/useApp";

/**
 * Route guard for the admin portal. Nests inside AuthGate (which already
 * guarantees isAuthenticated), so this only needs to check the role.
 */
export function AdminGate({ children }: { children: React.ReactNode }) {
    const { profile } = useApp();
    const router = useRouter();
    const [mounted, setMounted] = useState(false);

    useEffect(() => setMounted(true), []);
    useEffect(() => {
        if (mounted && profile.role !== "admin") router.replace("/dashboard");
    }, [mounted, profile.role, router]);

    if (!mounted || profile.role !== "admin") return null;
    return <>{children}</>;
}
