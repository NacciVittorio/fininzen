import { test, expect } from "@playwright/test";
import { loginAsDemo } from "./helpers/auth";

// The Monthly Net Worth year controls (MnwToolbar) are part of the desktop
// layout; the default mobile viewport doesn't render them. Run this suite at a
// desktop viewport so the year chevrons exist.
test.use({ viewport: { width: 1280, height: 900 } });

test.describe("Year navigation — Monthly Net Worth", () => {
    test.beforeEach(async ({ page }) => {
        // Set state before React mounts so the app reads correct prefs on first render.
        // (The old SPA also seeded localStorage `tab`=dashboard to start on the
        // dashboard; under Next the URL is the source of truth and the auth helper
        // already lands on /dashboard, so that line is gone.)
        await page.addInitScript(() => {
            localStorage.removeItem("dashConfig");
            localStorage.removeItem("monthlyOverviewPrefs");
        });
        await loginAsDemo(page);
    });

    // Bug #38 was a DOUBLE-fetch on year change. Under TanStack Query the
    // monthly-overview query is keyed on the year and dedupes automatically, so a
    // single year change fires at most one request (and 0 when returning to a year
    // still fresh in cache within staleTime). Assert "never more than one".
    test("bug #38 regression: year change does not double-fetch", async ({
        page,
    }) => {
        const prevBtn = page.getByTestId("mnw-prev-year");
        const nextBtn = page.getByTestId("mnw-next-year");

        await expect(prevBtn).toBeVisible({ timeout: 20000 });

        // Skip if can't go back (single year of data)
        if (await prevBtn.isDisabled()) {
            test.skip();
            return;
        }

        // Navigate to previous year (fresh → cache miss → exactly one fetch)
        await Promise.all([
            page.waitForResponse(
                (r) => r.url().includes("monthly-overview") && r.ok(),
            ),
            prevBtn.click(),
        ]);

        // Now navigate forward — count ALL monthly-overview requests in a window.
        const calls: string[] = [];
        page.on("request", (req) => {
            if (req.url().includes("monthly-overview")) calls.push(req.url());
        });

        await nextBtn.click();
        // Allow time for any (de-duplicated) fetch to fire
        await page.waitForTimeout(800);

        // The original year is still fresh in cache → 0 calls; a refetch → 1 call;
        // never 2. The bug-#38 invariant is "no duplicate".
        expect(calls.length).toBeLessThanOrEqual(1);
    });

    test("‹ and › update the year display", async ({ page }) => {
        const prevBtn = page.getByTestId("mnw-prev-year");
        const nextBtn = page.getByTestId("mnw-next-year");

        await expect(prevBtn).toBeVisible({ timeout: 20000 });

        if (await prevBtn.isDisabled()) {
            test.skip();
            return;
        }

        // The year span sits immediately after the prev-year button
        const yearSpan = page.locator('[data-testid="mnw-prev-year"] + span');
        const initialYear = parseInt((await yearSpan.textContent()) ?? "0", 10);

        // Back one year: fresh → cache miss → a fetch fires.
        await Promise.all([
            page.waitForResponse(
                (r) => r.url().includes("monthly-overview") && r.ok(),
            ),
            prevBtn.click(),
        ]);
        expect(parseInt((await yearSpan.textContent()) ?? "0", 10)).toBe(
            initialYear - 1,
        );

        // Forward again to the original year: served from TanStack cache (no network
        // call needed), so assert the user-visible year display, not a request.
        await nextBtn.click();
        await expect
            .poll(async () =>
                parseInt((await yearSpan.textContent()) ?? "0", 10),
            )
            .toBe(initialYear);
    });
});
