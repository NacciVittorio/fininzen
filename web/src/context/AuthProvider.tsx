"use client";

import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useState,
} from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
    requestDemoLogin,
    requestLogin,
    requestLogout,
    requestRegister,
    requestTokenRefresh,
} from "../api/auth";
import type { RegisterResult, TokenResponse } from "../api/auth";
import { clearAccessToken, setAccessToken } from "../utils/api";

type AuthStatus = "loading" | "authenticated" | "unauthenticated";

type AuthContextValue = {
    status: AuthStatus;
    isAuthenticated: boolean;
    isDemo: boolean;
    user: string | null;
    login: (email: string, password: string) => Promise<boolean>;
    register: (
        email: string,
        password: string,
        password2: string,
    ) => Promise<RegisterResult>;
    demoLogin: () => Promise<boolean>;
    logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const hasWindow = typeof window !== "undefined";

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const router = useRouter();
    const queryClient = useQueryClient();
    const [status, setStatus] = useState<AuthStatus>("loading");
    const [isDemo, setIsDemo] = useState(false);
    const [user, setUser] = useState<string | null>(null);

    // HIGH-21: the access token is in memory only, so a reload starts with no
    // token. Bootstrap silently exchanges the httpOnly refresh cookie for a
    // fresh access token; failure (no/expired cookie) means unauthenticated.
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await requestTokenRefresh();
                if (!res.ok) throw new Error("no session");
                const data = (await res.json()) as TokenResponse;
                if (cancelled) return;
                setAccessToken(data.access);
                if (hasWindow) {
                    setIsDemo(localStorage.getItem("is_demo") === "true");
                    setUser(localStorage.getItem("auth_email"));
                }
                setStatus("authenticated");
            } catch {
                if (!cancelled) setStatus("unauthenticated");
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    const adoptSession = useCallback(
        (access: string, email: string, demo: boolean) => {
            setAccessToken(access);
            if (hasWindow) {
                localStorage.setItem("fn_session", "1");
                localStorage.setItem("auth_email", email);
                if (demo) localStorage.setItem("is_demo", "true");
                else localStorage.removeItem("is_demo");
            }
            setIsDemo(demo);
            setUser(email);
            setStatus("authenticated");
            queryClient.clear();
        },
        [queryClient],
    );

    const login = useCallback(
        async (email: string, password: string) => {
            try {
                const res = await requestLogin(email, password);
                if (!res.ok) return false;
                const data = (await res.json()) as TokenResponse;
                adoptSession(data.access, email, false);
                router.push("/dashboard");
                return true;
            } catch {
                return false;
            }
        },
        [adoptSession, router],
    );

    const demoLogin = useCallback(async () => {
        try {
            const res = await requestDemoLogin();
            if (!res.ok) return false;
            const data = (await res.json()) as TokenResponse;
            adoptSession(data.access, "demo@demo.com", true);
            router.push("/dashboard");
            return true;
        } catch {
            return false;
        }
    }, [adoptSession, router]);

    const register = useCallback(
        (email: string, password: string, password2: string) =>
            requestRegister(email, password, password2),
        [],
    );

    const logout = useCallback(() => {
        // Best-effort server-side logout: clears + blacklists the refresh cookie.
        try {
            requestLogout().catch(() => {});
        } catch {
            /* ignore */
        }
        clearAccessToken();
        if (hasWindow) {
            localStorage.removeItem("fn_session");
            localStorage.removeItem("is_demo");
            localStorage.removeItem("auth_email");
        }
        setIsDemo(false);
        setUser(null);
        setStatus("unauthenticated");
        queryClient.clear();
        router.push("/login");
    }, [queryClient, router]);

    return (
        <AuthContext.Provider
            value={{
                status,
                isAuthenticated: status === "authenticated",
                isDemo,
                user,
                login,
                register,
                demoLogin,
                logout,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth(): AuthContextValue {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
    return ctx;
}
