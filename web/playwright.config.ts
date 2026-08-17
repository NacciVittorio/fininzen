import { defineConfig, devices } from "@playwright/test";

// E2E against Next.js on :3000 (dev server locally, a production build in CI —
// see webServer.command below), which proxies `/fininzen/api/*` to the Django
// dev server on :8000 (see next.config). Django must already be running with
// REFRESH_COOKIE_PATH=/fininzen/api/auth/ (the prefix the browser sees) or
// silent refresh 401-loops. Shared backend/demo state → workers: 1.
export default defineConfig({
    testDir: "./e2e",
    timeout: 15_000,
    workers: 1,
    // GitHub-hosted runners are noisy enough that a lone assertion in the ~130-test
    // suite occasionally misses its window under load — confirmed by two CI runs of
    // the identical commit SHA, one green and one red on an unrelated spec. Retry
    // only in CI so a genuinely broken assertion still fails locally on the first try.
    retries: process.env.CI ? 2 : 0,
    use: {
        baseURL: "http://localhost:3000",
    },
    projects: [
        {
            // The primary nav is a bottom bar (a `<nav>`) only at ≤760px; on
            // desktop it is a sidebar `<aside>`. The specs drive navigation via
            // `nav a[href]`, so this (the suite's original/default profile)
            // runs at a mobile-sized viewport, without device emulation, where
            // that `<nav>` is rendered and visible.
            name: "mobile-viewport",
            use: { viewport: { width: 390, height: 844 } },
        },
        {
            // Real Android Chrome emulation (UA, touch, DPR) so graphical
            // regressions specific to Blink/Android — not just a narrow
            // desktop-Chromium viewport — get caught by the existing suite.
            name: "Mobile Chrome (Android)",
            use: { ...devices["Pixel 7"] },
        },
    ],
    webServer: {
        // CI runs a production build of the commit under test (no HMR/dev
        // traffic), which is what lets networkidle waits settle at all — the
        // dev server never quiets down. Local runs keep `next dev` as-is.
        command: process.env.CI
            ? "npm run build && npm run start"
            : "npm run dev",
        url: "http://localhost:3000/login",
        reuseExistingServer: true,
        timeout: 180_000,
        // E2E=1 hides the dev indicator (see next.config.ts); pinning the API
        // base to the same-origin default keeps a developer's local .env.local
        // (e.g. a LAN IP for device testing) from breaking the run via CSP.
        env: {
            E2E: "1",
            NEXT_PUBLIC_API_BASE: "/fininzen/api",
            NEXT_PUBLIC_CONTACT_EMAIL: "support@example.test",
        },
    },
});
