import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Replica del singleton refresh pattern in AppContext.apiFetch (HIGH-21).
 *
 * Il problema: con ROTATE_REFRESH_TOKENS=True, N richieste concorrenti che
 * ricevono 401 chiamano tutte /token/refresh/ → solo la prima riesce,
 * le altre ottengono 401 perché il token è già stato blacklistato → logout.
 *
 * Il fix: refreshingRef.current condivide la promise tra tutti i caller.
 *
 * Modello token (HIGH-21): il refresh token è un cookie httpOnly che il browser
 * invia da solo; l'access token vive in memoria (qui `memAccess`). Il client
 * non legge né scrive alcun token in localStorage.
 */
type RefreshData = { access: string };
type RespLike = {
    ok?: boolean;
    status?: number;
    json?: () => Promise<RefreshData>;
};
type FetchLike = (url: string) => Promise<RespLike>;
type TokenStore = { access: string };

function makeApiFetch(
    mockFetch: FetchLike,
    logoutFn: () => void,
    store: TokenStore,
) {
    const refreshingRef: { current: Promise<boolean> | null } = {
        current: null,
    };

    return async function apiFetch(url: string) {
        let res = await mockFetch(url);

        if (res.status === 401) {
            if (!refreshingRef.current) {
                refreshingRef.current = (async () => {
                    try {
                        const refreshRes = await mockFetch(
                            "/api/auth/token/refresh/",
                        );
                        if (refreshRes.ok) {
                            const data = await refreshRes.json!();
                            store.access = data.access; // setAccessToken (in memory)
                            return true;
                        }
                        logoutFn();
                        return false;
                    } catch {
                        logoutFn();
                        return false;
                    } finally {
                        refreshingRef.current = null;
                    }
                })();
            }
            const refreshed = await refreshingRef.current;
            if (refreshed) res = await mockFetch(url + "?retry");
        }
        return res;
    };
}

beforeEach(() => {
    localStorage.clear();
});

describe("token refresh singleton", () => {
    it("chiama /token/refresh/ una sola volta per 15 richieste concorrenti con 401", async () => {
        const store: TokenStore = { access: "old_access" };
        let refreshCallCount = 0;
        const mockFetch = vi.fn((url: string): Promise<RespLike> => {
            if (url.includes("/token/refresh/")) {
                refreshCallCount++;
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ access: "new_access" }),
                });
            }
            if (url.includes("?retry")) return Promise.resolve({ status: 200 });
            return Promise.resolve({ status: 401 });
        });

        const apiFetch = makeApiFetch(mockFetch, vi.fn(), store);
        const results = await Promise.all(
            Array.from({ length: 15 }, (_, i) =>
                apiFetch(`/api/endpoint-${i}/`),
            ),
        );

        expect(refreshCallCount).toBe(1);
        expect(results.every((r) => r.status === 200)).toBe(true);
        expect(store.access).toBe("new_access");
    });

    it("non persiste alcun token in localStorage dopo il refresh (refresh = cookie)", async () => {
        const store: TokenStore = { access: "old_access" };
        const mockFetch = vi.fn((url: string): Promise<RespLike> => {
            if (url.includes("/token/refresh/"))
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ access: "new_access" }),
                });
            if (url.includes("?retry")) return Promise.resolve({ status: 200 });
            return Promise.resolve({ status: 401 });
        });

        const apiFetch = makeApiFetch(mockFetch, vi.fn(), store);
        await Promise.all([apiFetch("/api/a/"), apiFetch("/api/b/")]);

        expect(localStorage.getItem("access_token")).toBeNull();
        expect(localStorage.getItem("refresh_token")).toBeNull();
        expect(store.access).toBe("new_access");
    });

    it("chiama logout una sola volta se il refresh fallisce con 401", async () => {
        const store: TokenStore = { access: "old_access" };
        const logoutFn = vi.fn();
        let refreshCallCount = 0;
        const mockFetch = vi.fn((url: string): Promise<RespLike> => {
            if (url.includes("/token/refresh/")) {
                refreshCallCount++;
                return Promise.resolve({ ok: false, status: 401 });
            }
            return Promise.resolve({ status: 401 });
        });

        const apiFetch = makeApiFetch(mockFetch, logoutFn, store);
        await Promise.all(
            Array.from({ length: 10 }, (_, i) =>
                apiFetch(`/api/endpoint-${i}/`),
            ),
        );

        expect(refreshCallCount).toBe(1);
        expect(logoutFn).toHaveBeenCalledTimes(1);
    });
});
