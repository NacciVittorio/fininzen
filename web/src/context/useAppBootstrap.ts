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
    "fetchGrants" | "isAuthenticated"
>;

type BootstrapTask = () => unknown;

type UseAppBootstrapArgs = BootstrapProviderState &
    BootstrapSessionState & {
        T: Translator;
        fetchProfile: BootstrapTask;
    };

// Server-state (categories, assets, expenses, …) is fetched by useAppQueries as
// soon as `enabled: isAuthenticated` flips true, and re-keyed per account on a
// "view as" switch — so bootstrap only has to load the viewer's own profile
// (which drives enabledFeatures/prefs that the rest of the UI gates on) and the
// sharing grants, plus flip the app-loading lifecycle flags.
export function useAppBootstrap({
    bootstrapReady,
    fetchGrants,
    fetchProfile,
    isAuthenticated,
    setAppLoading,
    setBootstrapReady,
    setFetchError,
    T,
}: UseAppBootstrapArgs): void {
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
        if (!isAuthenticated) {
            bootstrap.setAppLoading(false);
            bootstrap.setBootstrapReady(false);
            return;
        }
        let cancelled = false;
        bootstrap.setAppLoading(true);
        bootstrap.setBootstrapReady(false);
        bootstrap.setFetchError(null);
        Promise.allSettled([bootstrap.fetchProfile()])
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
    }, [isAuthenticated]);

    useEffect(() => {
        if (isAuthenticated && bootstrapReady) fetchGrants();
    }, [isAuthenticated, bootstrapReady, fetchGrants]);
}
