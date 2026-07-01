// Keychain-backed refresh-token storage for the native (iOS) build.
//
// M2 defined the `RefreshTokenBackend` seam in refreshTokenStore.ts with an
// in-memory default that never persists the long-lived token to insecure web
// storage. Here the native shell plugs in the real durable backend: the iOS
// Keychain via @aparajita/capacitor-secure-storage (values are stored in the
// Keychain, NOT UserDefaults, so they are encrypted at rest and survive app
// restarts). This is what makes silent refresh work after a cold start.
//
// On the web build (and during the Node prerender of the static export)
// Capacitor.isNativePlatform() is false, so registration is a no-op and the
// in-memory backend stays in place — nothing native is ever invoked.

import { Capacitor } from "@capacitor/core";
import { SecureStorage } from "@aparajita/capacitor-secure-storage";
import {
    setRefreshTokenBackend,
    type RefreshTokenBackend,
} from "./refreshTokenStore";

const REFRESH_TOKEN_KEY = "fn_refresh";

const keychainBackend: RefreshTokenBackend = {
    async get() {
        return SecureStorage.getItem(REFRESH_TOKEN_KEY);
    },
    async set(token: string) {
        await SecureStorage.setItem(REFRESH_TOKEN_KEY, token);
    },
    async clear() {
        await SecureStorage.remove(REFRESH_TOKEN_KEY);
    },
};

// Registered once at client boot (see app/providers.tsx). Idempotent and safe to
// call on any platform: outside the native shell it does nothing.
export function registerNativeSecureStore(): void {
    if (Capacitor.isNativePlatform()) {
        setRefreshTokenBackend(keychainBackend);
    }
}
