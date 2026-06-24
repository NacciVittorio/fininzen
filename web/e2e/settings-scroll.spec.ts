import { test, expect, Page } from '@playwright/test';
import { loginAsDemo } from './helpers/auth';

async function openSettingsPreferences(page: Page) {
  await page.click('nav a[href="/settings"]');
  // Settings is now an iOS-style drill-down: root list → section page.
  const preferences = page.locator('[data-testid="settings-root-preferences"]');
  await expect(preferences).toBeVisible({ timeout: 5000 });
  await preferences.click();
}

test.describe('Settings scroll behavior', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsDemo(page);
    await expect(page.locator('.app-net-worth')).toBeVisible({ timeout: 15000 });
  });

  test('preserves scroll position when a setting updates page state', async ({ page }) => {
    await openSettingsPreferences(page);

    const resetDashboard = page.getByRole('button', { name: /Reset|Ripristina/ });
    await resetDashboard.scrollIntoViewIfNeeded();

    const before = await page.evaluate(() => window.scrollY);
    expect(before).toBeGreaterThan(100);

    await resetDashboard.click();
    await page.waitForTimeout(300);

    const after = await page.evaluate(() => window.scrollY);
    expect(after).toBeGreaterThan(before - 80);
  });
});
