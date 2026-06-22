import { afterEach, describe, expect, it, vi } from "vitest";
import { act, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import App from "../App";
import { AppProvider } from "../context/AppProvider";
import { useApp } from "../context/useApp";

function deferred() {
    let resolve!: (value: unknown) => void;
    const promise = new Promise((resolvePromise) => {
        resolve = resolvePromise;
    });
    return { promise, resolve };
}

function jsonResponse(data: unknown): Response {
    return {
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => data,
        text: async () => JSON.stringify(data),
    } as unknown as Response;
}

function DashboardPreferenceWriter({ onDone }: { onDone?: () => void }) {
    const { bootstrapReady, updateMonthlyOverviewPrefs, toggleWealthMetric } =
        useApp();
    const didWrite = useRef(false);
    useEffect(() => {
        if (!bootstrapReady || didWrite.current) return;
        didWrite.current = true;
        updateMonthlyOverviewPrefs({ year: 2024 });
        toggleWealthMetric("balance");
        onDone?.();
    }, [
        bootstrapReady,
        onDone,
        toggleWealthMetric,
        updateMonthlyOverviewPrefs,
    ]);
    return null;
}

async function waitUntil(assertion: () => void, attempts = 200) {
    let lastError: unknown;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
        try {
            assertion();
            return;
        } catch (error) {
            lastError = error;
            await act(async () => {
                await new Promise((resolve) => setTimeout(resolve, 0));
            });
        }
    }
    throw lastError;
}

describe("authenticated bootstrap", () => {
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
    });

    it("renders the dashboard while one aggregate trend request is pending", async () => {
        localStorage.setItem("fn_session", "1");
        vi.stubGlobal(
            "matchMedia",
            vi.fn(() => ({
                matches: false,
                addEventListener: vi.fn(),
                removeEventListener: vi.fn(),
            })),
        );
        vi.stubGlobal(
            "ResizeObserver",
            class {
                observe() {}
                disconnect() {}
            },
        );
        const trends = deferred();
        const mockFetch = vi
            .spyOn(globalThis, "fetch")
            .mockImplementation((url) => {
                const path = String(url);
                if (path.endsWith("/expenses/trends/"))
                    return trends.promise as Promise<Response>;
                if (path.endsWith("/auth/profile/")) {
                    return Promise.resolve(
                        jsonResponse({
                            email: "test@example.com",
                            decimal_separator: ",",
                            accounting_month_start_day: 1,
                            enabled_features: {},
                        }),
                    );
                }
                if (path.endsWith("/auth/grants/")) {
                    return Promise.resolve(
                        jsonResponse({ given: [], received: [] }),
                    );
                }
                if (path.includes("/monthly-overview/")) {
                    return Promise.resolve(
                        jsonResponse({
                            available_years: [],
                            assets: [],
                            summary: {},
                        }),
                    );
                }
                return Promise.resolve(jsonResponse([]));
            });
        container = document.createElement("div");
        document.body.appendChild(container);
        root = createRoot(container);

        await act(async () => root!.render(<App />));
        await waitUntil(() => {
            expect(
                mockFetch.mock.calls.filter(([url]) =>
                    String(url).endsWith("/expenses/trends/"),
                ),
            ).toHaveLength(1);
        });
        await waitUntil(() => {
            expect(container!.textContent).toContain("Net Worth");
        });

        trends.resolve(jsonResponse({ expenses: [], incomes: [] }));
        await act(async () => {
            await trends.promise;
        });
    });

    it("hydrates Monthly Net Worth prefs from the profile and fetches that year", async () => {
        localStorage.setItem("fn_session", "1");
        vi.stubGlobal(
            "matchMedia",
            vi.fn(() => ({
                matches: false,
                addEventListener: vi.fn(),
                removeEventListener: vi.fn(),
            })),
        );
        vi.stubGlobal(
            "ResizeObserver",
            class {
                observe() {}
                disconnect() {}
            },
        );
        const mockFetch = vi
            .spyOn(globalThis, "fetch")
            .mockImplementation((url) => {
                const path = String(url);
                if (path.endsWith("/auth/profile/")) {
                    return Promise.resolve(
                        jsonResponse({
                            email: "test@example.com",
                            decimal_separator: ",",
                            accounting_month_start_day: 1,
                            enabled_features: {},
                            // Server-synced layout + prefs from another device.
                            dashboard_config: [
                                { id: "wealth_trend", visible: true },
                            ],
                            dashboard_preferences: {
                                monthly_overview: {
                                    mode: "single",
                                    year: 2023,
                                    monthRange: 6,
                                },
                                wealth_metrics: ["wealth", "balance"],
                            },
                        }),
                    );
                }
                if (path.endsWith("/auth/grants/")) {
                    return Promise.resolve(
                        jsonResponse({ given: [], received: [] }),
                    );
                }
                if (path.includes("/monthly-overview/")) {
                    return Promise.resolve(
                        jsonResponse({
                            available_years: [2023],
                            assets: [],
                            summary: {},
                        }),
                    );
                }
                return Promise.resolve(jsonResponse([]));
            });
        container = document.createElement("div");
        document.body.appendChild(container);
        root = createRoot(container);

        await act(async () => root!.render(<App />));

        // Hydration set monthlyOverviewPrefs.year = 2023, so the overview fetch
        // must eventually request that year (proving server prefs drive the data).
        await waitUntil(() => {
            expect(
                mockFetch.mock.calls.filter(([url]) =>
                    String(url).includes("/monthly-overview/?year=2023"),
                ).length,
            ).toBeGreaterThan(0);
        });
    });

    it("resets stale local dashboard prefs when the profile has empty server prefs", async () => {
        const thisYear = new Date().getFullYear();
        const staleYear = thisYear - 3;
        localStorage.setItem("fn_session", "1");
        localStorage.setItem(
            "monthlyOverviewPrefs",
            JSON.stringify({ mode: "single", year: staleYear, monthRange: 6 }),
        );
        localStorage.setItem("wealthChartMetrics", JSON.stringify(["balance"]));
        localStorage.setItem(
            "dashConfig",
            JSON.stringify([{ id: "wealth_trend", visible: false }]),
        );
        vi.stubGlobal(
            "matchMedia",
            vi.fn(() => ({
                matches: false,
                addEventListener: vi.fn(),
                removeEventListener: vi.fn(),
            })),
        );
        vi.stubGlobal(
            "ResizeObserver",
            class {
                observe() {}
                disconnect() {}
            },
        );
        const mockFetch = vi
            .spyOn(globalThis, "fetch")
            .mockImplementation((url) => {
                const path = String(url);
                if (path.endsWith("/auth/profile/")) {
                    return Promise.resolve(
                        jsonResponse({
                            email: "test@example.com",
                            decimal_separator: ",",
                            accounting_month_start_day: 1,
                            enabled_features: {},
                            dashboard_config: [],
                            dashboard_preferences: {},
                        }),
                    );
                }
                if (path.endsWith("/auth/grants/")) {
                    return Promise.resolve(
                        jsonResponse({ given: [], received: [] }),
                    );
                }
                if (path.includes("/monthly-overview/")) {
                    return Promise.resolve(
                        jsonResponse({
                            available_years: [thisYear],
                            assets: [],
                            summary: {},
                        }),
                    );
                }
                return Promise.resolve(jsonResponse([]));
            });
        container = document.createElement("div");
        document.body.appendChild(container);
        root = createRoot(container);

        await act(async () => root!.render(<App />));

        await waitUntil(() => {
            expect(
                mockFetch.mock.calls.filter(([url]) =>
                    String(url).includes(`/monthly-overview/?year=${thisYear}`),
                ).length,
            ).toBeGreaterThan(0);
        });
        expect(
            mockFetch.mock.calls.some(([url]) =>
                String(url).includes(`/monthly-overview/?year=${staleYear}`),
            ),
        ).toBe(false);
        expect(
            JSON.parse(localStorage.getItem("wealthChartMetrics") ?? "null"),
        ).toEqual(["wealth"]);
        expect(
            JSON.parse(localStorage.getItem("dashConfig") ?? "null")[0],
        ).toEqual({
            id: "wealth_trend",
            visible: true,
        });
    });

    it("coalesces rapid dashboard preference updates into one complete patch", async () => {
        localStorage.setItem("fn_session", "1");
        vi.stubGlobal(
            "matchMedia",
            vi.fn(() => ({
                matches: false,
                addEventListener: vi.fn(),
                removeEventListener: vi.fn(),
            })),
        );
        const patches: Array<{
            dashboard_preferences: {
                monthly_overview: Record<string, unknown>;
                wealth_metrics: unknown[];
            };
        }> = [];
        vi.spyOn(globalThis, "fetch").mockImplementation(
            (url, options = {}) => {
                const path = String(url);
                if (
                    path.endsWith("/auth/profile/") &&
                    options.method === "PATCH"
                ) {
                    patches.push(JSON.parse(options.body as string));
                    return Promise.resolve(jsonResponse({}));
                }
                if (path.endsWith("/auth/profile/")) {
                    return Promise.resolve(
                        jsonResponse({
                            email: "test@example.com",
                            decimal_separator: ",",
                            accounting_month_start_day: 1,
                            enabled_features: {},
                            dashboard_config: [],
                            dashboard_preferences: {
                                monthly_overview: {
                                    mode: "single",
                                    year: 2026,
                                    monthRange: 12,
                                },
                                wealth_metrics: ["wealth"],
                            },
                        }),
                    );
                }
                if (path.endsWith("/auth/grants/")) {
                    return Promise.resolve(
                        jsonResponse({ given: [], received: [] }),
                    );
                }
                if (path.includes("/monthly-overview/")) {
                    return Promise.resolve(
                        jsonResponse({
                            available_years: [2024],
                            assets: [],
                            summary: {},
                        }),
                    );
                }
                return Promise.resolve(jsonResponse([]));
            },
        );
        container = document.createElement("div");
        document.body.appendChild(container);
        root = createRoot(container);
        let wrote = false;

        await act(async () =>
            root!.render(
                <AppProvider>
                    <DashboardPreferenceWriter onDone={() => (wrote = true)} />
                </AppProvider>,
            ),
        );

        await waitUntil(() => expect(wrote).toBe(true));
        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 350));
        });
        expect(patches).toHaveLength(1);
        expect(
            patches[0]!.dashboard_preferences.monthly_overview,
        ).toMatchObject({
            mode: "single",
            year: 2024,
            monthRange: 12,
        });
        expect(patches[0]!.dashboard_preferences.wealth_metrics).toEqual([
            "wealth",
            "balance",
        ]);
    });
});
