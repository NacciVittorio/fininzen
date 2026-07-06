/// <reference lib="webworker" />
import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { Serwist, StaleWhileRevalidate } from "serwist";

declare global {
    interface WorkerGlobalScope extends SerwistGlobalConfig {
        __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
    }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
    precacheEntries: self.__SW_MANIFEST,
    skipWaiting: true,
    clientsClaim: true,
    navigationPreload: true,
    runtimeCaching: [
        // Same-origin API GETs (expenses, portfolio, ...): serve the last
        // cached response instantly, then refresh it in the background so the
        // app opens with data even offline. Writes (POST/PATCH/DELETE) are
        // never intercepted here — they always hit the network.
        {
            matcher: ({ url, request }) =>
                request.method === "GET" &&
                url.pathname.startsWith("/fininzen/api/"),
            handler: new StaleWhileRevalidate({ cacheName: "fn-api-cache" }),
        },
        ...defaultCache,
    ],
});

serwist.addEventListeners();
