// Lightweight logger that suppresses noise in production.
// Use logError instead of console.error so the bundle doesn't ship
// debug spam (and accidentally leak response bodies/PII).
// Next.js exposes the build mode via NODE_ENV (statically inlined at build time).
const DEV = process.env.NODE_ENV !== "production";

export const logError = (...args: unknown[]): void => {
    if (DEV) console.error(...args);
};

export const logWarn = (...args: unknown[]): void => {
    if (DEV) console.warn(...args);
};

export const logDebug = (...args: unknown[]): void => {
    if (DEV) console.debug(...args);
};
