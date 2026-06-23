import type { NextConfig } from "next";

// In production Caddy terminates TLS on fininzen.nacci.eu and routes
// `/fininzen/api/*` straight to Django (stripping the `/fininzen` prefix), so
// those requests never reach Next. In local dev there is no Caddy, so Next
// proxies the same public path to the Django dev server. Keeping the public
// path identical in both environments means the browser-side client never has
// to know which mode it is running in.
const DJANGO_ORIGIN = process.env.DJANGO_ORIGIN ?? "http://localhost:8000";

const nextConfig: NextConfig = {
    reactStrictMode: true,
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

export default nextConfig;
