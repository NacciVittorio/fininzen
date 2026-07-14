"use client";

import { useApp } from "../context/useApp";
import AppLockScreen from "./AppLockScreen";

/**
 * Gates the authenticated app behind the biometric app-lock. When the session
 * is locked (cold start with app-lock enabled, or a return to the foreground
 * after being backgrounded past the threshold — see useSessionController), the
 * whole authenticated shell is replaced by the lock screen until the user
 * re-authenticates with Face ID / Touch ID. Sits inside AuthGate so it only
 * runs for authenticated sessions and can read the app context.
 */
export function AppLockGate({ children }: { children: React.ReactNode }) {
    const { isLocked } = useApp();
    if (isLocked) return <AppLockScreen />;
    return <>{children}</>;
}
