import { defineConfig } from "@playwright/test";

// E2E against the Next.js dev server on :3000, which proxies `/fininzen/api/*`
// to the Django dev server on :8000 (see next.config). Django must already be
// running with REFRESH_COOKIE_PATH=/fininzen/api/auth/ (the prefix the browser
// sees) or silent refresh 401-loops. Shared backend/demo state → workers: 1.
export default defineConfig({
    testDir: "./e2e",
    timeout: 15_000,
    workers: 1,
    use: {
        baseURL: "http://localhost:3000",
        // The primary nav is a bottom bar (a `<nav>`) only at ≤760px; on desktop
        // it is a sidebar `<aside>`. The specs drive navigation via `nav a[href]`,
        // so run at a mobile viewport where that `<nav>` is rendered and visible.
        viewport: { width: 390, height: 844 },
    },
    webServer: {
        command: "npm run dev",
        url: "http://localhost:3000/login",
        reuseExistingServer: true,
        timeout: 120_000,
        // E2E=1 hides the dev indicator (see next.config.ts); pinning the API
        // base to the same-origin default keeps a developer's local .env.local
        // (e.g. a LAN IP for device testing) from breaking the run via CSP.
        env: { E2E: "1", NEXT_PUBLIC_API_BASE: "/fininzen/api" },
    },
});
