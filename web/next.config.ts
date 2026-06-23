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
    async rewrites() {
        return [
            {
                source: "/fininzen/api/:path*",
                destination: `${DJANGO_ORIGIN}/api/:path*`,
            },
        ];
    },
};

export default nextConfig;
