import type { CapacitorConfig } from "@capacitor/cli";

// Capacitor wraps the Next static export (`BUILD_TARGET=mobile` → `output: 'export'`,
// emitted to `web/out/`) in a native WKWebView shell. The bundle is loaded LOCALLY
// from `webDir` — there is no `server.url` — so the app opens with no network and the
// persisted TanStack Query cache (see app/providers.tsx) backs offline reads. The API
// is reached cross-origin via the absolute NEXT_PUBLIC_API_BASE baked into the build.
const config: CapacitorConfig = {
    appId: "eu.nacci.fininzen",
    appName: "Fininzen",
    webDir: "out",
    ios: {
        // Let the web content manage the safe-area insets itself (the layout already
        // uses env(safe-area-inset-*)); Capacitor should not add its own inset.
        contentInset: "never",
    },
};

export default config;
