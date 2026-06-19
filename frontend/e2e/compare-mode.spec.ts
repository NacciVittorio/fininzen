import { test, expect } from "@playwright/test";
import { loginAsDemo } from "./helpers/auth";

test.describe("Compare mode — Monthly Net Worth", () => {
    test.beforeEach(async ({ page }) => {
        await loginAsDemo(page);
        // Clear compare-mode prefs AFTER login (evaluate doesn't persist across reloads)
        await page.evaluate(() => {
            localStorage.setItem("tab", "dashboard");
            localStorage.removeItem("dashConfig");
            localStorage.removeItem("monthlyOverviewPrefs");
        });
        // Second reload so React reads the clean prefs; wait for monthly-overview data
        const waitForMonthlyOverview = page.waitForResponse(
            (r) => r.url().includes("monthly-overview") && r.ok(),
            { timeout: 25000 },
        );
        await page.reload();
        await waitForMonthlyOverview;
    });

    test("toggle between single and compare mode", async ({ page }) => {
        const compareBtn = page.locator('button:has-text("Compare years")');
        const singleBtn = page.locator('button:has-text("Single year")');
        const prevYearBtn = page.getByTestId("mnw-prev-year");

        // Start in single mode — MNW year nav arrow visible
        await expect(prevYearBtn).toBeVisible();

        // Switch to compare mode
        await compareBtn.click();

        // Year selects appear (compare mode adds yearA + yearB selects)
        await expect(page.locator("select").first()).toBeVisible({
            timeout: 5000,
        });
        // MNW year nav arrows unmounted (ternary replaces them with selects)
        await expect(prevYearBtn).not.toBeVisible({ timeout: 3000 });

        // Switch back to single mode
        await singleBtn.click();
        await expect(prevYearBtn).toBeVisible({ timeout: 3000 });
    });

    test("mode and years persist after page reload", async ({ page }) => {
        await page.locator('button:has-text("Compare years")').click();
        await page.waitForSelector("select", { timeout: 5000 });

        // Reload and verify compare mode is restored from localStorage
        await page.reload();
        await page.waitForLoadState("networkidle");
        await page.waitForSelector("select", { timeout: 10000 });
        await expect(page.getByTestId("mnw-prev-year")).not.toBeVisible();
    });

    test("year dropdowns trigger API fetch on change", async ({ page }) => {
        await page.locator('button:has-text("Compare years")').click();
        await page.waitForSelector("select", { timeout: 5000 });

        const selects = page.locator("select");
        const count = await selects.count();

        // Compare mode adds 2 selects (yearA, yearB); skip if not enough years
        if (count < 2) {
            test.skip();
            return;
        }

        // Use last 2 selects (to skip viewAs select if present)
        const yearASelect = selects.nth(count - 2);
        const optionValues = await yearASelect
            .locator("option")
            .evaluateAll((els) =>
                els.map((e) => (e as HTMLOptionElement).value),
            );
        if (optionValues.length < 2) {
            test.skip();
            return;
        }

        // Pick a value that differs from the currently selected one — otherwise
        // React fires no onChange and the test would race with the initial fetch.
        const currentValue = await yearASelect.inputValue();
        const differentValue = optionValues.find((v) => v !== currentValue);
        if (!differentValue) {
            test.skip();
            return;
        }

        const [response] = await Promise.all([
            page.waitForResponse(
                (r) =>
                    r.url().includes("monthly-overview") && r.status() === 200,
            ),
            yearASelect.selectOption({ value: differentValue }),
        ]);
        expect(response.ok()).toBeTruthy();
    });
});
