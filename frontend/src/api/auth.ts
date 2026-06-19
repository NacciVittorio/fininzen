import {
    API,
    LONG_FETCH_TIMEOUT_MS,
    fetchWithTimeout,
    getCsrfToken,
} from "../utils/api";

export type TokenResponse = {
    access: string;
};

export type RegisterResult = {
    ok: boolean;
    status?: number;
    errors?: unknown[] | null;
};

export async function requestLogin(
    email: string,
    password: string,
): Promise<Response> {
    return fetchWithTimeout(`${API}/auth/token/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
        timeoutMs: LONG_FETCH_TIMEOUT_MS,
    });
}

export async function requestLogout(): Promise<Response> {
    return fetchWithTimeout(`${API}/auth/logout/`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": getCsrfToken(),
        },
    });
}

export async function requestTokenRefresh(): Promise<Response> {
    return fetchWithTimeout(`${API}/auth/token/refresh/`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": getCsrfToken(),
        },
    });
}
