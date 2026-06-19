export const API = `/api`;
export const DEFAULT_FETCH_TIMEOUT_MS = 30_000;
export const LONG_FETCH_TIMEOUT_MS = 120_000;

// HIGH-21: the access token lives in memory only (never localStorage). The
// refresh token is an httpOnly cookie the browser sends to the auth endpoints;
// JS can neither read it nor be made to leak it via XSS.
let accessToken: string | null = null;

export const setAccessToken = (token?: string | null): void => {
  accessToken = token || null;
};
export const getAccessToken = (): string | null => accessToken;
export const clearAccessToken = (): void => {
  accessToken = null;
};

// Double-submit CSRF token: the backend sets a readable `fn_csrf` cookie on
// login/refresh; we echo it back in a header on the cookie-authenticated
// refresh/logout calls.
export const CSRF_COOKIE_NAME = "fn_csrf";
export const getCsrfToken = (): string => {
  const match = document.cookie.match(
    new RegExp(`(?:^|; )${CSRF_COOKIE_NAME}=([^;]*)`),
  );
  return match?.[1] ? decodeURIComponent(match[1]) : "";
};

export const authHeaders = (): Record<string, string> => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${accessToken ?? ""}`,
});

export type FetchWithTimeoutOptions = RequestInit & { timeoutMs?: number };

export async function fetchWithTimeout(
  input: RequestInfo | URL,
  options: FetchWithTimeoutOptions = {},
): Promise<Response> {
  const {
    timeoutMs = DEFAULT_FETCH_TIMEOUT_MS,
    signal: externalSignal,
    ...fetchOptions
  } = options;
  const controller = new AbortController();
  const timeoutError = new DOMException("Request timed out", "TimeoutError");
  let timedOut = false;

  const abortFromExternalSignal = () =>
    controller.abort(externalSignal?.reason);
  if (externalSignal) {
    if (externalSignal.aborted) {
      abortFromExternalSignal();
    } else {
      externalSignal.addEventListener("abort", abortFromExternalSignal, {
        once: true,
      });
    }
  }

  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort(timeoutError);
  }, timeoutMs);

  try {
    return await fetch(input, { ...fetchOptions, signal: controller.signal });
  } catch (error) {
    if (timedOut) throw timeoutError;
    throw error;
  } finally {
    clearTimeout(timeoutId);
    externalSignal?.removeEventListener("abort", abortFromExternalSignal);
  }
}
