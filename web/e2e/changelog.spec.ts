import { readFileSync } from "node:fs";
import { join } from "node:path";

import { test, expect } from "@playwright/test";
import { loginAsDemo } from "./helpers/auth";

// Matches the app's own version, not a hardcoded literal that goes stale on
// every release — see helpers/auth.ts's APP_VERSION for the same pattern.
const APP_VERSION = readFileSync(
    join(__dirname, "..", "..", "VERSION"),
    "utf8",
).trim();

async function openChangelog(page: import("@playwright/test").Page) {
    // Keep the in-memory access token alive by following the app's normal
    // client-side path rather than hard-loading a protected route.
    await page.click('nav a[href="/settings"]');
    await expect(page).toHaveURL(/\/settings$/);
    await page.getByTestId("settings-root-preferences").click();
    const changelogLink = page.locator('a[href="/changelog"]');
    await expect(changelogLink).toBeVisible();
    await changelogLink.click();
    await expect(page).toHaveURL(/\/changelog$/);
}

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
        await openChangelog(page);

        const close = page.getByTestId("changelog-close");
        await expect(close).toBeVisible();
        await close.click();

        // Back to where we came from, no bottom-nav tap required.
        await expect(page).toHaveURL(/\/settings$/);
    });

    test("shows the current version live from the backend", async ({
        page,
    }) => {
        await openChangelog(page);
        // useAppVersion reads GET /api/health/, which reports the same VERSION
        // file; the matching release entry is then flagged as the current one.
        await expect(page.getByText(`v${APP_VERSION}`)).toBeVisible();
        // Keep this exact: release-note prose may legitimately contain “in use”,
        // while this assertion is specifically about the current-version pill.
        await expect(page.getByText(/^(In uso|In use)$/i)).toBeVisible();
    });
});
