import { useCallback, useRef } from "react";
import { authHeaders, fetchWithTimeout, setAccessToken } from "../utils/api";
import { IS_MOBILE_BUILD } from "../utils/platform";
import { setRefreshToken } from "../utils/refreshTokenStore";
import { requestTokenRefresh } from "../api/auth";
import type { ApiFetcher } from "../api/client";

export type ViewAsAccount = {
    userId: number | string;
    email?: string;
    permission?: string;
};

type UseAuthenticatedFetchArgs = {
    logout: () => void;
    viewAs: ViewAsAccount | null;
};

export function useAuthenticatedFetch({
    logout,
    viewAs,
}: UseAuthenticatedFetchArgs): ApiFetcher {
    const refreshingRef = useRef<Promise<boolean> | null>(null);

    return useCallback(
        async (url: string, options = {}) => {
            const viewAsHeaders = viewAs
                ? { "X-View-As": String(viewAs.userId) }
                : {};
            const withAuth = (): RequestInit => {
                const headers = new Headers(authHeaders());
                Object.entries(viewAsHeaders).forEach(([key, value]) =>
                    headers.set(key, value),
                );
                new Headers(options.headers).forEach((value, key) =>
                    headers.set(key, value),
                );
                return { ...options, headers };
            };

            const response = await fetchWithTimeout(url, withAuth());
            if (response.status !== 401) return response;

            if (!refreshingRef.current) {
                refreshingRef.current = (async () => {
                    try {
                        const refreshResponse = await requestTokenRefresh();
                        if (!refreshResponse.ok) {
                            logout();
                            return false;
                        }
                        const data = (await refreshResponse.json()) as {
                            access: string;
                            refresh?: string;
                        };
                        setAccessToken(data.access);
                        // Native build rotates the refresh token in the body;
                        // persist the new one for the next refresh.
                        if (IS_MOBILE_BUILD && data.refresh) {
                            await setRefreshToken(data.refresh);
                        }
                        return true;
                    } catch {
                        logout();
                        return false;
                    } finally {
                        refreshingRef.current = null;
                    }
                })();
            }

            return (await refreshingRef.current)
                ? fetchWithTimeout(url, withAuth())
                : response;
        },
        [logout, viewAs],
    );
}
