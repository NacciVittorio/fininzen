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
    },
    webServer: {
        command: "npm run dev",
        url: "http://localhost:3000/login",
        reuseExistingServer: true,
        timeout: 120_000,
    },
});
