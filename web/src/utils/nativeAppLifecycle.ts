// App lifecycle hook for the native (iOS) build.
//
// Deliberately NOT wired into the app-lock re-lock timer: that already works
// via document.addEventListener("visibilitychange", ...) in
// useSessionController.ts, which WKWebView fires correctly on background/
// foreground, so adding a second appStateChange-driven trigger here would
// risk a double re-lock race. This registration exists as the place future
// native lifecycle needs (deep links via appUrlOpen, Android back-button
// parity) will hook into, without needing to introduce this file later.
//
// On the web build (and during the Node prerender of the static export)
// Capacitor.isNativePlatform() is false, so this is a no-op.

import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";

export function registerNativeAppLifecycle(): void {
    if (!Capacitor.isNativePlatform()) return;
    void App.addListener("appStateChange", () => {});
}
