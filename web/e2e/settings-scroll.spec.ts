import { test, expect, Page } from "@playwright/test";
import { loginAsDemo } from "./helpers/auth";

async function openSettingsPreferences(page: Page) {
    await page.click('nav a[href="/settings"]');
    // Settings is now an iOS-style drill-down: root list → section page.
    const preferences = page.locator(
        '[data-testid="settings-root-preferences"]',
    );
    await expect(preferences).toBeVisible({ timeout: 5000 });
    await preferences.click();
}

test.describe("Settings scroll behavior", () => {
    test.beforeEach(async ({ page }) => {
        await loginAsDemo(page);
        await expect(page.locator(".app-net-worth")).toBeVisible({
            timeout: 15000,
        });
    });

    test("preserves scroll position when a setting updates page state", async ({
        page,
    }) => {
        await openSettingsPreferences(page);

        const resetDashboard = page.getByRole("button", {
            name: /Reset|Ripristina/,
        });
        await resetDashboard.scrollIntoViewIfNeeded();

        const before = await page.evaluate(() => window.scrollY);
        expect(before).toBeGreaterThan(100);

        await resetDashboard.click();
        await page.waitForTimeout(300);

        const after = await page.evaluate(() => window.scrollY);
        expect(after).toBeGreaterThan(before - 80);
    });

    test("keeps the Settings root and subsections on the same column", async ({
        page,
    }) => {
        await page.click('nav a[href="/settings"]');
        const root = page.locator("main .settings-page");
        await expect(root).toBeVisible({ timeout: 5000 });

        const rootBox = await root.boundingBox();
        expect(rootBox).not.toBeNull();

        await page.locator('[data-testid="settings-root-preferences"]').click();
        await expect(page).toHaveURL(/\/settings\/preferences$/);
        const subsectionBox = await page
            .locator("main .settings-page")
            .boundingBox();
        expect(subsectionBox).not.toBeNull();

        expect(
            Math.abs((rootBox?.x ?? 0) - (subsectionBox?.x ?? 0)),
        ).toBeLessThanOrEqual(1);
        expect(
            Math.abs((rootBox?.width ?? 0) - (subsectionBox?.width ?? 0)),
        ).toBeLessThanOrEqual(1);

        const hasHorizontalOverflow = await page.evaluate(
            () => document.documentElement.scrollWidth > window.innerWidth,
        );
        expect(hasHorizontalOverflow).toBe(false);
    });
});
