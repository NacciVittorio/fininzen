import { useEffect, useRef } from "react";
import type { Translator } from "../types";
import type { AppProviderState } from "./useAppProviderState";
import type { SessionController } from "./useSessionController";

type BootstrapProviderState = Pick<
    AppProviderState,
    "bootstrapReady" | "setAppLoading" | "setBootstrapReady" | "setFetchError"
>;

type BootstrapSessionState = Pick<
    SessionController,
    "authReady" | "fetchGrants" | "isAuthenticated" | "pathname"
>;

type BootstrapTask = () => unknown;

type UseAppBootstrapArgs = BootstrapProviderState &
    BootstrapSessionState & {
        T: Translator;
        fetchProfile: BootstrapTask;
    };

// Restore authentication before loading the viewer's profile. Route-scoped
// server-state queries wait for bootstrapReady, so they start with the final
// per-account cache scope instead of issuing an anonymous wave first.
export function useAppBootstrap({
    bootstrapReady,
    fetchGrants,
    fetchProfile,
    authReady,
    isAuthenticated,
    pathname,
    setAppLoading,
    setBootstrapReady,
    setFetchError,
    T,
}: UseAppBootstrapArgs): void {
    const bootstrapRunRef = useRef<Promise<
        PromiseSettledResult<unknown>[]
    > | null>(null);
    const grantsRunRef = useRef<Promise<void> | null>(null);
    const bootstrapRef = useRef({
        T,
        fetchProfile,
        setAppLoading,
        setBootstrapReady,
        setFetchError,
    });
    bootstrapRef.current = {
        T,
        fetchProfile,
        setAppLoading,
        setBootstrapReady,
        setFetchError,
    };

    useEffect(() => {
        const bootstrap = bootstrapRef.current;
        if (!isAuthenticated || !authReady) {
            bootstrap.setAppLoading(false);
            bootstrap.setBootstrapReady(false);
            return;
        }
        let cancelled = false;
        bootstrap.setAppLoading(true);
        bootstrap.setBootstrapReady(false);
        bootstrap.setFetchError(null);
        if (!bootstrapRunRef.current) {
            const run = Promise.allSettled([bootstrap.fetchProfile()]);
            bootstrapRunRef.current = run;
            void run.finally(() => {
                if (bootstrapRunRef.current === run) {
                    bootstrapRunRef.current = null;
                }
            });
        }
        void bootstrapRunRef.current
            .then((results) => {
                if (cancelled) return;
                const failed = results.filter((r) => r.status === "rejected");
                if (failed.length === results.length) {
                    bootstrap.setFetchError(bootstrap.T("error_network"));
                }
            })
            .finally(() => {
                if (cancelled) return;
                bootstrap.setAppLoading(false);
                bootstrap.setBootstrapReady(true);
            });
        return () => {
            cancelled = true;
        };
    }, [authReady, isAuthenticated]);

    useEffect(() => {
        if (
            isAuthenticated &&
            authReady &&
            bootstrapReady &&
            pathname === "/settings/account" &&
            !grantsRunRef.current
        ) {
            const run = fetchGrants();
            grantsRunRef.current = run;
            void run.finally(() => {
                if (grantsRunRef.current === run) grantsRunRef.current = null;
            });
        }
    }, [authReady, bootstrapReady, fetchGrants, isAuthenticated, pathname]);
}
