/// <reference lib="webworker" />
import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { ExpirationPlugin, NetworkFirst, NetworkOnly, Serwist } from "serwist";

declare global {
    interface WorkerGlobalScope extends SerwistGlobalConfig {
        __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
    }
}

declare const self: ServiceWorkerGlobalScope;

const API_PREFIX = "/fininzen/api/";
const API_CACHE = "fn-api-cache-v2";
const LEGACY_API_CACHES = ["fn-api-cache"];

const serwist = new Serwist({
    precacheEntries: self.__SW_MANIFEST,
    skipWaiting: true,
    clientsClaim: true,
    navigationPreload: true,
    // Matching is first-wins in array order, and these must precede
    // `defaultCache`: its API rules test `pathname.startsWith("/api/")`, false
    // for `/fininzen/api/...`, so without an explicit rule here these requests
    // would fall through to its catch-all `others` rule and be cached there.
    runtimeCaching: [
        // Auth endpoints carry session state: a reused response would cross two
        // different sessions. Placed before the API rule so it can't claim them.
        {
            matcher: ({ url, sameOrigin }) =>
                sameOrigin && url.pathname.startsWith(`${API_PREFIX}auth/`),
            handler: new NetworkOnly(),
        },
        // API GETs: the network always wins, so a write made on another device
        // shows up on the first fetch. The cache is only an offline fallback.
        // StaleWhileRevalidate returned the cached response to the app and
        // refreshed the cache behind it, leaving the UI one fetch behind
        // everywhere. No `networkTimeoutSeconds`: on a slow-but-working
        // connection it would silently serve stale data again — the client
        // already bounds this (fetchWithTimeout), and a genuinely offline
        // device fails fast and falls back without waiting.
        {
            matcher: ({ url, sameOrigin }) =>
                sameOrigin && url.pathname.startsWith(API_PREFIX),
            handler: new NetworkFirst({
                cacheName: API_CACHE,
                plugins: [
                    // Not a freshness gate (NetworkFirst provides that) — just
                    // a bound on the size and age of the offline fallback.
                    new ExpirationPlugin({
                        maxEntries: 64,
                        maxAgeSeconds: 24 * 60 * 60,
                        purgeOnQuotaError: true,
                    }),
                ],
            }),
        },
        ...defaultCache,
    ],
});

// The v1 cache was filled by StaleWhileRevalidate, so every entry is a
// generation behind (and may belong to a different account). It has to be
// deleted rather than promoted to offline fallback: without this, a device
// going offline before its first NetworkFirst hit would still be served the
// poisoned entries. v2 survives future deploys, so offline read isn't lost on
// every release.
self.addEventListener("activate", (event) => {
    event.waitUntil(
        Promise.all(LEGACY_API_CACHES.map((name) => caches.delete(name))),
    );
});

serwist.addEventListeners();
