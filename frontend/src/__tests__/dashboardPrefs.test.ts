import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import {
    mergeDashConfig,
    normalizeMonthlyOverviewPrefs,
    normalizeWealthMetrics,
} from "../context/AppContext";

// These pure helpers back the cross-device dashboard sync: they reconcile a
// saved/server layout with the current catalog and clamp section view-prefs so
// every device renders the same order/data regardless of where it was set.

describe("mergeDashConfig", () => {
    const defaultIds = [
        "wealth_trend",
        "kpi_cards",
        "monthly_overview",
        "budget_progress",
        "expenses_pie",
        "expenses_trend",
        "portfolio_alloc",
        "currency_exposure",
        "recurring_overview",
    ];

    it("returns null for non-list input (so callers can preserve local fallback)", () => {
        expect(mergeDashConfig(null)).toBeNull();
        expect(mergeDashConfig("nope")).toBeNull();
    });

    it("treats an empty server layout as the default catalog", () => {
        expect(mergeDashConfig([])!.map((c) => c.id)).toEqual(defaultIds);
    });

    it("preserves the saved leading order and per-section visibility", () => {
        const saved = [
            { id: "monthly_overview", visible: true },
            { id: "wealth_trend", visible: false },
            { id: "kpi_cards", visible: true },
        ];
        const merged = mergeDashConfig(saved)!;
        // The first two cards keep their position; newly-added defaults splice in
        // after them. Every saved card survives with its visibility intact.
        expect(merged.slice(0, 2)).toEqual(saved.slice(0, 2));
        for (const s of saved) {
            expect(merged).toContainEqual(s);
        }
    });

    it("drops retired section ids", () => {
        const merged = mergeDashConfig([
            { id: "wealth_trend", visible: true },
            { id: "performance", visible: true },
            { id: "returns_heatmap", visible: false },
        ])!;
        const ids = merged.map((c) => c.id);
        expect(ids).not.toContain("performance");
        expect(ids).not.toContain("returns_heatmap");
    });

    it("splices in newly-added default sections missing from the saved layout", () => {
        const merged = mergeDashConfig([
            { id: "wealth_trend", visible: true },
        ])!;
        const ids = merged.map((c) => c.id);
        // every default section ends up present exactly once
        for (const id of defaultIds) {
            expect(ids.filter((x) => x === id)).toHaveLength(1);
        }
    });

    it("preserves DASH_DEFAULT order for missing sections", () => {
        const merged = mergeDashConfig([
            { id: "wealth_trend", visible: true },
            { id: "kpi_cards", visible: true },
        ])!;
        expect(merged.map((c) => c.id)).toEqual(defaultIds);
    });

    it("ignores malformed saved entries", () => {
        const merged = mergeDashConfig([
            { id: "wealth_trend", visible: true },
            { id: 123, visible: true },
            { id: "bad_visible", visible: "yes" },
            "garbage",
            null,
        ])!;
        expect(merged.some((c) => c.id === "wealth_trend")).toBe(true);
        expect(merged.every((c) => typeof c.id === "string")).toBe(true);
        expect(merged.every((c) => typeof c.visible === "boolean")).toBe(true);
    });
});

describe("normalizeMonthlyOverviewPrefs", () => {
    // jsdom has no matchMedia; the monthRange fallback path calls it.
    beforeEach(() => {
        vi.stubGlobal(
            "matchMedia",
            vi.fn(() => ({ matches: false })),
        );
    });
    afterEach(() => vi.unstubAllGlobals());

    it("keeps valid values verbatim", () => {
        const prefs = normalizeMonthlyOverviewPrefs({
            mode: "compare",
            year: 2023,
            yearA: 2021,
            yearB: 2022,
            monthRange: 6,
        });
        expect(prefs).toEqual({
            mode: "compare",
            year: 2023,
            yearA: 2021,
            yearB: 2022,
            monthRange: 6,
        });
    });

    it("clamps out-of-domain values to safe defaults", () => {
        const thisYear = new Date().getFullYear();
        const prefs = normalizeMonthlyOverviewPrefs({
            mode: "bogus",
            year: 3000,
            monthRange: 7,
        });
        expect(prefs.mode).toBe("single");
        expect(prefs.year).toBe(thisYear);
        // 7 is not a valid range → falls back to a viewport default (3 or 12)
        expect([3, 12]).toContain(prefs.monthRange);
    });

    it("tolerates non-object input", () => {
        const thisYear = new Date().getFullYear();
        const prefs = normalizeMonthlyOverviewPrefs(null);
        expect(prefs.year).toBe(thisYear);
        expect(prefs.mode).toBe("single");
    });
});

describe("normalizeWealthMetrics", () => {
    afterEach(() => vi.restoreAllMocks());

    it("keeps known metrics", () => {
        expect(normalizeWealthMetrics(["wealth", "balance"])).toEqual([
            "wealth",
            "balance",
        ]);
    });

    it("drops unknown metrics", () => {
        expect(normalizeWealthMetrics(["wealth", "bogus"])).toEqual(["wealth"]);
    });

    it("falls back to ['wealth'] when only the goal line would remain", () => {
        expect(normalizeWealthMetrics(["goal"])).toEqual(["wealth"]);
    });

    it("falls back to ['wealth'] for non-array input", () => {
        expect(normalizeWealthMetrics(undefined)).toEqual(["wealth"]);
        expect(normalizeWealthMetrics("wealth")).toEqual(["wealth"]);
    });
});
