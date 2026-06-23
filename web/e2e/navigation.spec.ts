import { test, expect } from "@playwright/test";
import { loginAsDemo } from "./helpers/auth";

// Ported from frontend/e2e/navigation.spec.ts. The old SPA switched a `tab`
// string (persisted in localStorage) and asserted on a sidebar `button.nav-item`
// with aria-current. Under Next each tab is a real URL, so navigation is driven
// by the nav `<a href>` links and assertions are URL-based; tab persistence is
// the browser's (reload lands on the same route, no localStorage involved).
test.describe("Tab navigation", () => {
    test.beforeEach(async ({ page }) => {
        await loginAsDemo(page);
        await expect(page.locator(".app-net-worth")).toBeVisible({
            timeout: 15000,
        });
    });

    const routes = [
        "/cashflow",
        "/accounts",
        "/portfolio",
        "/fire",
        "/settings",
        "/dashboard",
    ];

    for (const route of routes) {
        test(`"${route}" renders without crash`, async ({ page }) => {
            await page.click(`nav a[href="${route}"]`);
            await expect(page).toHaveURL(new RegExp(`${route}$`));
            // The clicked nav item becomes active via aria-current.
            await expect(
                page.locator(`nav a[href="${route}"][aria-current="page"]`),
            ).toBeVisible({ timeout: 5000 });
            await expect(page.locator("main")).toBeVisible();
        });
    }

    test("active tab persists after page reload", async ({ page }) => {
        await page.click(`nav a[href="/cashflow"]`);
        await expect(page).toHaveURL(/\/cashflow$/);
        await expect(
            page.locator(`nav a[href="/cashflow"][aria-current="page"]`),
        ).toBeVisible({ timeout: 5000 });

        await page.reload();
        // The URL is the source of truth — reload lands back on /cashflow.
        await expect(page).toHaveURL(/\/cashflow$/);
        await expect(
            page.locator(`nav a[href="/cashflow"][aria-current="page"]`),
        ).toBeVisible({ timeout: 10000 });
    });
});
