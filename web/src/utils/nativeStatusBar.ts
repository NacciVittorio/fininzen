// Status bar styling for the native (iOS) build.
//
// The WKWebView's status bar is transparent by default and does not follow
// the app's own theme, so without this the system clock/battery icons can
// end up low-contrast against the app background. useThemeLang.ts already
// toggles `document.documentElement.dataset.theme` and syncs the
// `<meta name="theme-color">` canvas colors on every theme change (light
// "#f4f8ff" / dark "#06101e") — this observes that same attribute instead of
// duplicating the theme logic, so the status bar always tracks the app's
// active theme (including the user's light/dark/auto toggle).
//
// On the web build (and during the Node prerender of the static export)
// Capacitor.isNativePlatform() is false, so this is a no-op.

import { Capacitor } from "@capacitor/core";
import { Style, StatusBar } from "@capacitor/status-bar";

const LIGHT_BG = "#f4f8ff";
const DARK_BG = "#06101e";

function applyForTheme(theme: string | undefined): void {
    const isDark = theme === "dark";
    void StatusBar.setStyle({ style: isDark ? Style.Dark : Style.Light });
    void StatusBar.setBackgroundColor({ color: isDark ? DARK_BG : LIGHT_BG });
}

export function registerNativeStatusBar(): void {
    if (!Capacitor.isNativePlatform()) return;

    const root = document.documentElement;
    applyForTheme(root.dataset.theme);

    const observer = new MutationObserver(() => {
        applyForTheme(root.dataset.theme);
    });
    observer.observe(root, {
        attributes: true,
        attributeFilter: ["data-theme"],
    });
}
