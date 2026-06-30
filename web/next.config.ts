import { readFileSync } from "node:fs";
import { join } from "node:path";

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

// In production Caddy terminates TLS on fininzen.nacci.eu and routes
// `/fininzen/api/*` straight to Django (stripping the `/fininzen` prefix), so
// those requests never reach Next. In local dev there is no Caddy, so Next
// proxies the same public path to the Django dev server. Keeping the public
// path identical in both environments means the browser-side client never has
// to know which mode it is running in.
const DJANGO_ORIGIN = process.env.DJANGO_ORIGIN ?? "http://localhost:8000";

// The mobile build (BUILD_TARGET=mobile) is a static export bundled inside the
// Capacitor/iOS app: no Next server, no middleware, no rewrites. It loads its
// assets locally and talks to the API cross-origin via an ABSOLUTE
// NEXT_PUBLIC_API_BASE (e.g. https://fininzen.nacci.eu/fininzen/api). The web
// build keeps the SSR server, the CSP middleware and the dev/prod rewrites.
const IS_MOBILE = process.env.BUILD_TARGET === "mobile";

const nextConfig: NextConfig = {
    reactStrictMode: true,
    env: {
        NEXT_PUBLIC_APP_VERSION: APP_VERSION,
        // Inlined so client code (utils/platform.ts) can branch on the target.
        NEXT_PUBLIC_BUILD_TARGET: process.env.BUILD_TARGET ?? "",
    },
    // Django's API endpoints require trailing slashes (and the typed client uses
    // them). Without this, Next 308-redirects `/fininzen/api/auth/x/` to the
    // slash-less form before the rewrite runs, breaking every API call.
    skipTrailingSlashRedirect: true,
    ...(IS_MOBILE
        ? {
              // Static HTML export for the native shell. The Next image
              // optimizer needs a server, so disable it for the export.
              output: "export" as const,
              images: { unoptimized: true },
          }
        : {
              async rewrites() {
                  return [
                      // Next's `:path*` capture drops the trailing slash, but
                      // Django's endpoints (and the typed client) require it — so
                      // match and re-append it explicitly. The slash-less rule is
                      // the fallback.
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
          }),
};

export default nextConfig;
