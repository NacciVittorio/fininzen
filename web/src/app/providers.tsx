"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { I18nProvider } from "../context/I18nProvider";
import { AuthProvider } from "../context/AuthProvider";

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

    return (
        <QueryClientProvider client={queryClient}>
            <I18nProvider>
                <AuthProvider>{children}</AuthProvider>
            </I18nProvider>
        </QueryClientProvider>
    );
}
