import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchWithTimeout } from "../utils/api";

function pendingFetch(
    _url: string,
    { signal }: { signal: AbortSignal },
): Promise<Response> {
    return new Promise<Response>((_resolve, reject) => {
        signal.addEventListener(
            "abort",
            () =>
                reject(
                    signal.reason || new DOMException("Aborted", "AbortError"),
                ),
            { once: true },
        );
    });
}

afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
});

describe("fetchWithTimeout", () => {
    it("aborts requests after the configured timeout", async () => {
        vi.useFakeTimers();
        vi.spyOn(globalThis, "fetch").mockImplementation(
            pendingFetch as unknown as typeof fetch,
        );

        const pending = fetchWithTimeout("/api/slow/", { timeoutMs: 50 });
        const assertion = expect(pending).rejects.toMatchObject({
            name: "TimeoutError",
        });
        await vi.advanceTimersByTimeAsync(50);

        await assertion;
    });

    it("preserves explicit abort signals", async () => {
        vi.spyOn(globalThis, "fetch").mockImplementation(
            pendingFetch as unknown as typeof fetch,
        );
        const controller = new AbortController();

        const pending = fetchWithTimeout("/api/autofill/", {
            signal: controller.signal,
        });
        const assertion = expect(pending).rejects.toMatchObject({
            name: "AbortError",
        });
        controller.abort();

        await assertion;
    });
});
