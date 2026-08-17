import { readFileSync } from "node:fs";
import { join } from "node:path";

import withSerwistInit from "@serwist/next";
import type { NextConfig } from "next";

// Unified app version: read the repo-root VERSION file (the single source of
// truth, bumped by `just release`) at build time and inline it as
// NEXT_PUBLIC_APP_VERSION so the About tab shows the real deployed version
// instead of "dev". The backend reads the same file at runtime. See
// wiki/VERSIONING.md.
const APP_VERSION = readFileSync(
    join(__dirname, "..", "VERSION"),
    "utf8",
).trim();

// Release date of the version above, read from the CHANGELOG heading commitizen
// writes on every bump (`## v0.5.0 (2026-07-14)`). Deriving it beats maintaining
// the date by hand, and it exists for every release — including the ones with no
// user-facing notes. Empty when the section is missing (e.g. a checkout with no
// release yet), and the UI omits the date in that case.
const releaseDate = (version: string): string => {
    try {
        const changelog = readFileSync(
            join(__dirname, "..", "CHANGELOG.md"),
            "utf8",
        );
        // Parse headings with a static expression, then compare the captured
        // version literally. Building a RegExp from VERSION would require a
        // custom escaping routine and is both unnecessary and easy to get wrong.
        const headings = changelog.matchAll(
            /^## v?(\S+) \((\d{4}-\d{2}-\d{2})\)$/gm,
        );
        for (const match of headings) {
            if (match[1] === version) {
                return match[2] ?? "";
            }
        }
        return "";
    } catch {
        return "";
    }
};

const RELEASE_DATE = releaseDate(APP_VERSION);

// In production Caddy terminates TLS on fininzen.nacci.eu and routes
// `/fininzen/api/*` straight to Django (stripping the `/fininzen` prefix), so
// those requests never reach Next. In local dev there is no Caddy, so Next
// proxies the same public path to the Django dev server. Keeping the public
// path identical in both environments means the browser-side client never has
// to know which mode it is running in.
const DJANGO_ORIGIN = process.env.DJANGO_ORIGIN ?? "http://localhost:8000";

const nextConfig: NextConfig = {
    reactStrictMode: true,
    poweredByHeader: false,
    // Disable the Next dev-tools indicator during E2E only: at the mobile
    // viewport the tests run at, its bottom-left button overlaps the bottom nav
    // and intercepts Playwright's clicks. Normal `next dev` keeps the indicator.
    ...(process.env.E2E === "1" ? { devIndicators: false as const } : {}),
    env: {
        NEXT_PUBLIC_APP_VERSION: APP_VERSION,
        NEXT_PUBLIC_RELEASE_DATE: RELEASE_DATE,
    },
    // Django's API endpoints require trailing slashes (and the typed client uses
    // them). Without this, Next 308-redirects `/fininzen/api/auth/x/` to the
    // slash-less form before the rewrite runs, breaking every API call.
    skipTrailingSlashRedirect: true,
    async rewrites() {
        return [
            // Next's `:path*` capture drops the trailing slash, but Django's
            // endpoints (and the typed client) require it — so match and
            // re-append it explicitly. The slash-less rule is the fallback.
            {
                source: "/fininzen/api/:path*/",
                destination: `${DJANGO_ORIGIN}/api/:path*/`,
            },
            {
                source: "/fininzen/api/:path*",
                destination: `${DJANGO_ORIGIN}/api/:path*`,
            },
        ];
    },
};

const withSerwist = withSerwistInit({
    swSrc: "src/app/sw.ts",
    swDest: "public/sw.js",
    // Precaching every hashed Next chunk here would fight with server-rendered
    // pages (route data isn't static); the app shell + API cache above already
    // cover the offline-read use case, so disable it instead of fighting churn.
    disable: process.env.NODE_ENV === "development",
});

export default withSerwist(nextConfig);
