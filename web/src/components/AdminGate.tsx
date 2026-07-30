"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "../context/useApp";

/**
 * Route guard for the admin portal. Nests inside AuthGate (which already
 * guarantees isAuthenticated), so this only needs to check the role.
 *
 * profile.role defaults to "user" until the profile fetch resolves (see
 * useSessionController), which on a hard navigation happens after an async
 * silent-refresh round trip — so this must wait for bootstrapReady rather
 * than just mount, or a real admin gets bounced to /dashboard on every
 * page refresh/direct link into /admin/*.
 */
export function AdminGate({ children }: { children: React.ReactNode }) {
    const { profile, bootstrapReady } = useApp();
    const router = useRouter();
    const [mounted, setMounted] = useState(false);

    useEffect(() => setMounted(true), []);
    useEffect(() => {
        if (mounted && bootstrapReady && profile.role !== "admin") {
            router.replace("/dashboard");
        }
    }, [mounted, bootstrapReady, profile.role, router]);

    if (!mounted || !bootstrapReady || profile.role !== "admin") return null;
    return <>{children}</>;
}
