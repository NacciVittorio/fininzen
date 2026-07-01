// Build-time platform flag. `next.config.ts` inlines NEXT_PUBLIC_BUILD_TARGET
// from the BUILD_TARGET env var, so this constant is folded to a literal at
// build time (dead-code-eliminated in the web build). The mobile build is the
// static export shipped inside the Capacitor/iOS WKWebView; it talks to the API
// cross-origin and therefore uses the body-based JWT refresh flow instead of the
// httpOnly cookie the same-origin web app relies on.
export const IS_MOBILE_BUILD =
    process.env.NEXT_PUBLIC_BUILD_TARGET === "mobile";
