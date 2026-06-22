import { describe, it, expect, vi } from "vitest";

/**
 * Tests for profile fetch/update logic (K5.2).
 * Mirrors the pattern in tokenRefresh.test.ts: extract pure logic, no React harness.
 */
type ProfileLike = { decimal_separator?: string };
type ProfileResponse = { ok: boolean; json: () => Promise<ProfileLike> };
type ProfileFetch = (
    url: string,
    init?: RequestInit,
) => Promise<ProfileResponse>;
type SeparatorSetter = (sep: string | undefined) => void;

function makeFetchProfile(
    apiFetch: ProfileFetch,
    setDecimalSeparator: SeparatorSetter,
) {
    return async function fetchProfile() {
        try {
            const res = await apiFetch("/api/auth/profile/");
            if (!res.ok) return;
            const data = await res.json();
            setDecimalSeparator(data.decimal_separator ?? ",");
        } catch {
            // silent
        }
    };
}

function makeUpdateDecimalSeparator(
    apiFetch: ProfileFetch,
    setDecimalSeparator: SeparatorSetter,
) {
    return async function updateDecimalSeparator(sep: string) {
        try {
            const res = await apiFetch("/api/auth/profile/", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ decimal_separator: sep }),
            });
            if (!res.ok) return false;
            const data = await res.json();
            setDecimalSeparator(data.decimal_separator);
            return true;
        } catch {
            return false;
        }
    };
}

describe("fetchProfile", () => {
    it("sets decimal_separator from API response", async () => {
        const setter = vi.fn();
        const apiFetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ decimal_separator: "." }),
        });
        await makeFetchProfile(apiFetch, setter)();
        expect(setter).toHaveBeenCalledWith(".");
    });

    it("defaults to ',' when decimal_separator missing from response", async () => {
        const setter = vi.fn();
        const apiFetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({}),
        });
        await makeFetchProfile(apiFetch, setter)();
        expect(setter).toHaveBeenCalledWith(",");
    });

    it("does not call setter on non-ok response", async () => {
        const setter = vi.fn();
        const apiFetch = vi.fn().mockResolvedValue({ ok: false });
        await makeFetchProfile(apiFetch, setter)();
        expect(setter).not.toHaveBeenCalled();
    });
});

describe("updateDecimalSeparator", () => {
    it("calls PATCH with correct body and updates state", async () => {
        const setter = vi.fn();
        const apiFetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ decimal_separator: "." }),
        });
        const result = await makeUpdateDecimalSeparator(apiFetch, setter)(".");
        expect(result).toBe(true);
        expect(apiFetch).toHaveBeenCalledWith(
            "/api/auth/profile/",
            expect.objectContaining({
                method: "PATCH",
                body: JSON.stringify({ decimal_separator: "." }),
            }),
        );
        expect(setter).toHaveBeenCalledWith(".");
    });

    it("returns false on non-ok response", async () => {
        const setter = vi.fn();
        const apiFetch = vi.fn().mockResolvedValue({ ok: false });
        const result = await makeUpdateDecimalSeparator(apiFetch, setter)(".");
        expect(result).toBe(false);
        expect(setter).not.toHaveBeenCalled();
    });

    it("returns false on network error", async () => {
        const setter = vi.fn();
        const apiFetch = vi.fn().mockRejectedValue(new Error("network"));
        const result = await makeUpdateDecimalSeparator(apiFetch, setter)(".");
        expect(result).toBe(false);
    });
});
