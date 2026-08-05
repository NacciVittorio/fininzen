"use client";

import { useApp } from "../context/useApp";
import TermsGateScreen from "./TermsGateScreen";

/**
 * Gates the authenticated app behind acceptance of the Privacy Policy/Terms
 * of Service, for accounts created before consent tracking existed (legacy
 * accounts have terms_accepted_at = null — see migrations 0019/0020). Mirrors
 * AppLockGate: replaces the whole authenticated shell with a non-dismissable
 * screen until the user accepts. Sits inside AppLockGate so a device-locked
 * session re-authenticates first, then (if still unaccepted) sees this.
 */
export function TermsGate({ children }: { children: React.ReactNode }) {
    const { profile, isDemo, bootstrapReady } = useApp();
    const mustAcceptTerms =
        bootstrapReady &&
        !isDemo &&
        !!profile.email &&
        !profile.terms_accepted_at;
    if (mustAcceptTerms) return <TermsGateScreen />;
    return <>{children}</>;
}
