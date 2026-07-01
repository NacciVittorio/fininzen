// Refresh-token storage for the native (mobile) build.
//
// On the web the refresh token is an httpOnly cookie owned by the browser, so
// this store is never used there. The native app has no cookie jar that
// round-trips reliably across the `capacitor://` scheme, so it holds the refresh
// token itself and replays it in the request body (see api/auth.ts).
//
// The real secure backend — the iOS Keychain via Capacitor — is registered by
// the native shell at startup through `setRefreshTokenBackend`. Until/unless a
// secure backend is registered, an in-memory backend keeps the session alive for
// the current app run WITHOUT ever persisting the long-lived token to insecure
// web storage (localStorage). This is a deliberate floor: a session-only token
// is the safe default, and durable persistence is opt-in via the Keychain.

export interface RefreshTokenBackend {
    get(): Promise<string | null>;
    set(token: string): Promise<void>;
    clear(): Promise<void>;
}

let memoryToken: string | null = null;

const memoryBackend: RefreshTokenBackend = {
    async get() {
        return memoryToken;
    },
    async set(token: string) {
        memoryToken = token;
    },
    async clear() {
        memoryToken = null;
    },
};

let backend: RefreshTokenBackend = memoryBackend;

// Called by the native shell (M3) to plug in Keychain-backed secure storage.
export const setRefreshTokenBackend = (next: RefreshTokenBackend): void => {
    backend = next;
};

export const getRefreshToken = (): Promise<string | null> => backend.get();
export const setRefreshToken = (token: string): Promise<void> =>
    backend.set(token);
export const clearRefreshToken = (): Promise<void> => backend.clear();
