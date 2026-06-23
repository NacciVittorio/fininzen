import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { AppProvider } from "../context/AppProvider";
import { AppContext } from "../context/AppContext";
import type { AppContextValue } from "../context/AppContext";

function jsonResponse(
    data: unknown,
    { ok = true, status = 200 }: { ok?: boolean; status?: number } = {},
): Response {
    return {
        ok,
        status,
        headers: new Headers(),
        json: async () => data,
        text: async () => JSON.stringify(data),
    } as unknown as Response;
}

function deferred() {
    let resolve!: () => void;
    const promise = new Promise<void>((res) => {
        resolve = () => res();
    });
    return { promise, resolve };
}

function ContextProbe({
    onValue,
}: {
    onValue: (value: AppContextValue | null) => void;
}) {
    return (
        <AppContext.Consumer>
            {(value) => {
                onValue(value);
                return null;
            }}
        </AppContext.Consumer>
    );
}

describe("AppContext bulk preview callbacks", () => {
    let root: Root | null;
    let container: HTMLDivElement | null;

    afterEach(async () => {
        const r = root;
        if (r) {
            await act(async () => r.unmount());
        }
        container?.remove();
        localStorage.clear();
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
        root = null;
        container = null;
    });

    it("keeps translation and bulk preview callback references stable across unrelated bulk state updates", async () => {
        vi.stubGlobal(
            "matchMedia",
            vi.fn(() => ({
                matches: false,
                addEventListener: vi.fn(),
                removeEventListener: vi.fn(),
            })),
        );
        vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse([]));

        const seen: (AppContextValue | null)[] = [];
        container = document.createElement("div");
        document.body.appendChild(container);
        root = createRoot(container);

        await act(async () => {
            root!.render(
                <AppProvider>
                    <ContextProbe onValue={(value) => seen.push(value)} />
                </AppProvider>,
            );
        });

        const initial = seen.at(-1)!;

        await act(async () => {
            initial.setCfBulkError("preview failed");
        });

        const afterBulkError = seen.at(-1)!;
        expect(afterBulkError.T).toBe(initial.T);
        expect(afterBulkError.runCfBulkPreview).toBe(initial.runCfBulkPreview);
    });

    it("closes bulk edit immediately after a successful apply while the feed reload is still pending", async () => {
        vi.stubGlobal(
            "matchMedia",
            vi.fn(() => ({
                matches: false,
                addEventListener: vi.fn(),
                removeEventListener: vi.fn(),
            })),
        );

        const cashflowReload = deferred();
        let delayCashflowReload = false;
        const fetchMock = vi.fn((input: unknown, init: RequestInit = {}) => {
            const url = String(input);
            const method = init?.method || "GET";
            if (
                url.includes("/api/expenses/cashflow/bulk/") &&
                method === "POST"
            ) {
                return Promise.resolve(jsonResponse({ ok: true, updated: 1 }));
            }
            if (
                delayCashflowReload &&
                url.includes("/api/expenses/cashflow/") &&
                method === "GET"
            ) {
                return cashflowReload.promise.then(() =>
                    jsonResponse({
                        results: [],
                        summary: {
                            income: "0.00",
                            outcome: "0.00",
                            net: "0.00",
                        },
                        next_page: null,
                        count: 0,
                    }),
                );
            }
            return Promise.resolve(jsonResponse([]));
        });
        vi.spyOn(globalThis, "fetch").mockImplementation(
            fetchMock as unknown as typeof fetch,
        );

        const seen: (AppContextValue | null)[] = [];
        container = document.createElement("div");
        document.body.appendChild(container);
        root = createRoot(container);

        await act(async () => {
            root!.render(
                <AppProvider>
                    <ContextProbe onValue={(value) => seen.push(value)} />
                </AppProvider>,
            );
        });

        await act(async () => {
            seen.at(-1)!.enterCfSelectionMode();
        });
        await act(async () => {
            const value = seen.at(-1)!;
            value.toggleCfItemSelected("expense_1", "outcome");
            value.setCfBulkEditOpen(true);
        });

        expect(seen.at(-1)!.cfSelectionMode).toBe(true);
        expect(seen.at(-1)!.cfSelectedCount).toBe(1);
        expect(seen.at(-1)!.cfBulkEditOpen).toBe(true);

        delayCashflowReload = true;
        let result: unknown;
        await act(async () => {
            result = await seen
                .at(-1)!
                .applyCfBulk({ action: "edit", patch: { is_verified: true } });
        });

        const afterApply = seen.at(-1)!;
        expect(result).toEqual({ ok: true, updated: 1 });
        expect(afterApply.cfBulkEditOpen).toBe(false);
        expect(afterApply.cfSelectionMode).toBe(false);
        expect(afterApply.cfSelectedCount).toBe(0);
        expect(afterApply.cfBulkLoading).toBe(false);
        expect(fetchMock).toHaveBeenCalledWith(
            expect.stringContaining("/api/expenses/cashflow/"),
            expect.any(Object),
        );

        await act(async () => {
            cashflowReload.resolve();
            await cashflowReload.promise;
        });
    });

    it("keeps bulk edit open and preserves selection when apply fails", async () => {
        vi.stubGlobal(
            "matchMedia",
            vi.fn(() => ({
                matches: false,
                addEventListener: vi.fn(),
                removeEventListener: vi.fn(),
            })),
        );
        vi.spyOn(globalThis, "fetch").mockImplementation(((
            input: unknown,
            init: RequestInit = {},
        ) => {
            const url = String(input);
            const method = init?.method || "GET";
            if (
                url.includes("/api/expenses/cashflow/bulk/") &&
                method === "POST"
            ) {
                return Promise.resolve(
                    jsonResponse(
                        { ok: false, error_codes: ["invalid_date"] },
                        { ok: false, status: 400 },
                    ),
                );
            }
            return Promise.resolve(jsonResponse([]));
        }) as unknown as typeof fetch);

        const seen: (AppContextValue | null)[] = [];
        container = document.createElement("div");
        document.body.appendChild(container);
        root = createRoot(container);

        await act(async () => {
            root!.render(
                <AppProvider>
                    <ContextProbe onValue={(value) => seen.push(value)} />
                </AppProvider>,
            );
        });

        await act(async () => {
            seen.at(-1)!.enterCfSelectionMode();
        });
        await act(async () => {
            const value = seen.at(-1)!;
            value.toggleCfItemSelected("expense_1", "outcome");
            value.setCfBulkEditOpen(true);
        });

        let result: unknown;
        await act(async () => {
            result = await seen
                .at(-1)!
                .applyCfBulk({ action: "edit", patch: { date: "not-a-date" } });
        });

        const afterApply = seen.at(-1)!;
        expect(result).toBeNull();
        expect(afterApply.cfBulkEditOpen).toBe(true);
        expect(afterApply.cfSelectionMode).toBe(true);
        expect(afterApply.cfSelectedCount).toBe(1);
        expect(afterApply.cfBulkError).toBeTruthy();
        expect(afterApply.cfBulkLoading).toBe(false);
    });
});
