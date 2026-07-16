import { test, expect } from "@playwright/test";
import { loginAsDemo } from "./helpers/auth";

// The changelog is a full-page view reached from the release banner or
// Settings → About, with no bottom-nav entry of its own. It must offer an
// explicit way out (a close button) rather than forcing the user onto a nav tab.
test.describe("Changelog", () => {
    test.beforeEach(async ({ page }) => {
        await loginAsDemo(page);
        await expect(page.locator(".app-net-worth")).toBeVisible({
            timeout: 15000,
        });
    });

    test("close button returns to the previous screen", async ({ page }) => {
        // loginAsDemo landed on /dashboard, so this push leaves it in history.
        await page.goto("/changelog");
        await expect(page).toHaveURL(/\/changelog$/);

        const close = page.getByTestId("changelog-close");
        await expect(close).toBeVisible();
        await close.click();

        // Back to where we came from, no bottom-nav tap required.
        await expect(page).toHaveURL(/\/dashboard$/);
    });

    test("shows the current version live from the backend", async ({
        page,
    }) => {
        await page.goto("/changelog");
        // useAppVersion reads GET /api/health/ (0.6.0); the matching release
        // entry is then flagged as the current one.
        await expect(page.getByText("v0.6.0")).toBeVisible();
        await expect(page.getByText(/In uso|In use/i)).toBeVisible();
    });
});
