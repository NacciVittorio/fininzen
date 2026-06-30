import {
    API,
    LONG_FETCH_TIMEOUT_MS,
    fetchWithTimeout,
    getCsrfToken,
} from "../utils/api";
import { IS_MOBILE_BUILD } from "../utils/platform";
import { getRefreshToken } from "../utils/refreshTokenStore";

export type TokenResponse = {
    access: string;
    // Present only on the native (body-based) flow; the web flow keeps the
    // refresh token in an httpOnly cookie and never returns it in the body.
    refresh?: string;
};

export type RegisterResult = {
    ok: boolean;
    status?: number;
    errors?: unknown[] | null;
};

// Native clients tag every auth request so the backend returns/accepts the
// refresh token in the JSON body instead of the httpOnly cookie.
const mobileHeader: Record<string, string> = IS_MOBILE_BUILD
    ? { "X-Client": "mobile" }
    : {};

export async function requestLogin(
    email: string,
    password: string,
): Promise<Response> {
    return fetchWithTimeout(`${API}/auth/token/`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...mobileHeader },
        body: JSON.stringify({ username: email, password }),
    });
}

export async function requestRegister(
    email: string,
    password: string,
    password2: string,
): Promise<RegisterResult> {
    try {
        const response = await fetchWithTimeout(`${API}/auth/register/`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password, password2 }),
        });
        if (response.ok) return { ok: true };
        const data = await response.json().catch(() => ({}));
        const errors = Object.values(data).flat().filter(Boolean);
        return {
            ok: false,
            status: response.status,
            errors: errors.length ? errors : null,
        };
    } catch {
        return { ok: false };
    }
}

export async function requestDemoLogin(): Promise<Response> {
    return fetchWithTimeout(`${API}/auth/demo/`, {
        method: "POST",
        headers: { ...mobileHeader },
        timeoutMs: LONG_FETCH_TIMEOUT_MS,
    });
}

export async function requestLogout(): Promise<Response> {
    if (IS_MOBILE_BUILD) {
        // No cookie/CSRF: send the stored refresh in the body so the server can
        // blacklist it.
        const refresh = await getRefreshToken();
        return fetchWithTimeout(`${API}/auth/logout/`, {
            method: "POST",
            headers: { "Content-Type": "application/json", ...mobileHeader },
            body: JSON.stringify(refresh ? { refresh } : {}),
        });
    }
    return fetchWithTimeout(`${API}/auth/logout/`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": getCsrfToken(),
        },
    });
}

export async function requestTokenRefresh(): Promise<Response> {
    if (IS_MOBILE_BUILD) {
        // Replay the stored refresh token in the body; the rotated refresh comes
        // back in the response body (the caller re-stores it).
        const refresh = await getRefreshToken();
        return fetchWithTimeout(`${API}/auth/token/refresh/`, {
            method: "POST",
            headers: { "Content-Type": "application/json", ...mobileHeader },
            body: JSON.stringify(refresh ? { refresh } : {}),
        });
    }
    return fetchWithTimeout(`${API}/auth/token/refresh/`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": getCsrfToken(),
        },
    });
}
