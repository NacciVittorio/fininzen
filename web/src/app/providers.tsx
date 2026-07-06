"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { useState } from "react";
import { AppProvider } from "../context/AppProvider";
import { registerServiceWorker } from "../utils/registerServiceWorker";

registerServiceWorker();

// Offline read: persist the query cache to localStorage only when the app is
// running as an installed PWA (Added to Home Screen) — a personal device
// context, not a shared browser tab — to avoid writing financial data to a
// shared browser's disk. iOS Safari doesn't reliably report `display-mode:
// standalone` via matchMedia, so the legacy `navigator.standalone` flag is
// checked too.
function isStandalonePwa(): boolean {
    if (typeof window === "undefined") return false;
    const nav = window.navigator as Navigator & { standalone?: boolean };
    return (
        window.matchMedia("(display-mode: standalone)").matches ||
        nav.standalone === true
    );
}

const PERSIST_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24h
// Bump with the app version so a deploy can't resurrect an incompatible cache.
const CACHE_BUSTER = process.env.NEXT_PUBLIC_APP_VERSION ?? "dev";

function makeQueryClient(persistCache: boolean): QueryClient {
    return new QueryClient({
        defaultOptions: {
            queries: {
                staleTime: 30_000,
                retry: 1,
                refetchOnWindowFocus: false,
                // Keep entries around long enough to survive a cold start so the
                // persisted cache is actually hydrated into live queries.
                ...(persistCache ? { gcTime: PERSIST_MAX_AGE_MS } : {}),
            },
        },
    });
}

export function Providers({ children }: { children: React.ReactNode }) {
    // One QueryClient per browser session. Created lazily in state so it is not
    // shared across requests on the server and survives re-renders on the client.
    const [persistCache] = useState(isStandalonePwa);
    const [queryClient] = useState(() => makeQueryClient(persistCache));

    // AppProvider is the single app context (auth, theme/i18n, data, actions),
    // ported from the Vite SPA and made SSR-safe. It exposes the stable useApp()
    // surface the views consume. The TanStack QueryClient wraps it so the data
    // layer can migrate to queries/mutations incrementally underneath useApp().
    if (!persistCache) {
        return (
            <QueryClientProvider client={queryClient}>
                <AppProvider>{children}</AppProvider>
            </QueryClientProvider>
        );
    }

    // localStorage is synchronous; createSyncStoragePersister no-ops when
    // window is undefined, so this branch is still SSR-safe even though it
    // only actually runs client-side (persistCache is false during SSR).
    const persister = createSyncStoragePersister({
        storage: window.localStorage,
        key: "fn_query_cache",
    });

    return (
        <PersistQueryClientProvider
            client={queryClient}
            persistOptions={{
                persister,
                maxAge: PERSIST_MAX_AGE_MS,
                buster: CACHE_BUSTER,
            }}
        >
            <AppProvider>{children}</AppProvider>
        </PersistQueryClientProvider>
    );
}
