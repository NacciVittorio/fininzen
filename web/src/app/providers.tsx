"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { AppProvider } from "../context/AppProvider";

export function Providers({ children }: { children: React.ReactNode }) {
    // One QueryClient per browser session. Created lazily in state so it is not
    // shared across requests on the server and survives re-renders on the client.
    const [queryClient] = useState(
        () =>
            new QueryClient({
                defaultOptions: {
                    queries: {
                        staleTime: 30_000,
                        retry: 1,
                        refetchOnWindowFocus: false,
                    },
                },
            }),
    );

    // AppProvider is the single app context (auth, theme/i18n, data, actions),
    // ported from the Vite SPA and made SSR-safe. It exposes the stable useApp()
    // surface the views consume. The TanStack QueryClient wraps it so the data
    // layer can migrate to queries/mutations incrementally underneath useApp().
    return (
        <QueryClientProvider client={queryClient}>
            <AppProvider>{children}</AppProvider>
        </QueryClientProvider>
    );
}
