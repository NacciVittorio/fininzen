import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// HIGH-23: Content-Security-Policy for the Next.js SPA.
//
// The old Vite build injected a <meta> CSP (script-src 'self'); that mechanism
// disappeared in the Next.js cutover, leaving the production HTML with NO CSP
// (Caddy sets HSTS/X-Frame/nosniff/Referrer but not CSP, and Django's middleware
// only covers /api/*). This middleware restores a strict, nonce-based policy.
//
// Next's App Router renders inline bootstrap/streaming <script> tags, so a flat
// `script-src 'self'` would break hydration. Instead we mint a per-request nonce,
// expose it to Next via the *request* CSP header (Next stamps the nonce onto its
// own scripts) and enforce the same policy on the response. `'strict-dynamic'`
// lets the nonce'd bootstrap load the chunk scripts without allowlisting hashes.
//
// The app pulls no external scripts, fonts or CDNs (system fonts; data: SVG
// backgrounds only; same-origin API via /fininzen/api), so everything stays at
// 'self' aside from img/style which need data:/inline for React + CSS.
export function middleware(request: NextRequest) {
    const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
    const isDev = process.env.NODE_ENV !== "production";

    // Dev needs eval/inline for React Fast Refresh + the webpack HMR runtime;
    // production locks scripts down to the nonce + strict-dynamic.
    const scriptSrc = isDev
        ? "'self' 'unsafe-eval' 'unsafe-inline'"
        : `'self' 'nonce-${nonce}' 'strict-dynamic'`;

    // Allow a cross-origin API base in connect-src. Prod serves the API
    // same-origin (default `/fininzen/api`, a relative path → no extra origin),
    // but a build pointed at an absolute NEXT_PUBLIC_API_BASE would otherwise be
    // blocked by `connect-src 'self'`.
    let apiOrigin = "";
    const apiBase = process.env.NEXT_PUBLIC_API_BASE;
    if (apiBase && /^https?:\/\//i.test(apiBase)) {
        try {
            apiOrigin = new URL(apiBase).origin;
        } catch {
            apiOrigin = "";
        }
    }
    const connectSrc = apiOrigin ? `'self' ${apiOrigin}` : "'self'";

    const csp = [
        "default-src 'self'",
        `script-src ${scriptSrc}`,
        // React inline styles + Next's injected <style> need 'unsafe-inline';
        // style nonces are not reliably propagated by React's style attribute.
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob:",
        "font-src 'self'",
        `connect-src ${connectSrc}`,
        "worker-src 'self'",
        "base-uri 'self'",
        "form-action 'self'",
        "frame-ancestors 'none'",
        "object-src 'none'",
    ].join("; ");

    // Next reads the nonce from the request CSP header to stamp its own scripts.
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-nonce", nonce);
    requestHeaders.set("Content-Security-Policy", csp);

    const response = NextResponse.next({
        request: { headers: requestHeaders },
    });
    response.headers.set("Content-Security-Policy", csp);
    return response;
}

export const config = {
    // Run on document/page requests only. Skip Next's static assets, the image
    // optimizer, the favicon and prefetches (no inline scripts to protect there),
    // and the /fininzen/api/* rewrites (Django serves those with its own headers).
    matcher: [
        {
            source: "/((?!_next/static|_next/image|favicon.ico|fininzen/api).*)",
            missing: [
                { type: "header", key: "next-router-prefetch" },
                { type: "header", key: "purpose", value: "prefetch" },
            ],
        },
    ],
};
