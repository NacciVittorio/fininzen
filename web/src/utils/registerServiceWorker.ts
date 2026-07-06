// Registers the Serwist-generated service worker so the app shell and API
// GETs are cached for offline read. Must run in a regular browser tab (not
// just once installed as a PWA) since "Add to Home Screen" doesn't install
// anything itself — it just bookmarks a page that already has a working
// service worker.
export function registerServiceWorker(): void {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    window.addEventListener("load", () => {
        navigator.serviceWorker.register("/sw.js").catch(() => {
            // Best-effort: offline read degrades gracefully to no cache.
        });
    });
}
