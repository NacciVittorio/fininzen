// Lightweight logger that suppresses noise in production.
// Use logError instead of console.error so the bundle doesn't ship
// debug spam (and accidentally leak response bodies/PII).
const DEV = import.meta.env.DEV;

export const logError = (...args: unknown[]): void => {
  if (DEV) console.error(...args);
};

export const logWarn = (...args: unknown[]): void => {
  if (DEV) console.warn(...args);
};

export const logDebug = (...args: unknown[]): void => {
  if (DEV) console.debug(...args);
};
