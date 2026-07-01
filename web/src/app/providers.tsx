"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { useState } from "react";
import { AppProvider } from "../context/AppProvider";
import { IS_MOBILE_BUILD } from "../utils/platform";
import { registerNativeSecureStore } from "../utils/nativeSecureStore";

// Plug the iOS Keychain into the refresh-token seam at module load — before any
// component renders or the session controller attempts a silent refresh. Guarded
// by the compile-time build flag so the web bundle dead-code-eliminates it; on
// the native prerender it is a no-op until the app runs on a real device/sim.
if (IS_MOBILE_BUILD) {
    registerNativeSecureStore();
}

// Offline read: in the native build the query cache is persisted so the app can
// open and show the last-fetched data with no network. We persist ONLY in the
// mobile build — the device is personal and the WKWebView storage is
// app-sandboxed — to avoid writing financial data to a shared browser's disk.
const PERSIST_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24h
// Bump with the app version so a deploy can't resurrect an incompatible cache.
const CACHE_BUSTER = process.env.NEXT_PUBLIC_APP_VERSION ?? "dev";

function makeQueryClient(): QueryClient {
    return new QueryClient({
        defaultOptions: {
            queries: {
                staleTime: 30_000,
                retry: 1,
                refetchOnWindowFocus: false,
                // Keep entries around long enough to survive a cold start so the
                // persisted cache is actually hydrated into live queries.
                gcTime: PERSIST_MAX_AGE_MS,
            },
        },
    });
}

export function Providers({ children }: { children: React.ReactNode }) {
    // One QueryClient per browser session. Created lazily in state so it is not
    // shared across requests on the server and survives re-renders on the client.
    const [queryClient] = useState(makeQueryClient);

    // AppProvider is the single app context (auth, theme/i18n, data, actions),
    // ported from the Vite SPA and made SSR-safe. It exposes the stable useApp()
    // surface the views consume. The TanStack QueryClient wraps it so the data
    // layer can migrate to queries/mutations incrementally underneath useApp().
    if (!IS_MOBILE_BUILD) {
        return (
            <QueryClientProvider client={queryClient}>
                <AppProvider>{children}</AppProvider>
            </QueryClientProvider>
        );
    }

    // localStorage is synchronous and available in the WKWebView; it backs the
    // persisted cache (not secrets — those live in the Keychain via
    // refreshTokenStore). createSyncStoragePersister no-ops when window is
    // undefined, so this is SSR/export-safe.
    const persister = createSyncStoragePersister({
        storage:
            typeof window !== "undefined" ? window.localStorage : undefined,
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
