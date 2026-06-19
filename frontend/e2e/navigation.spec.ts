import { test, expect } from '@playwright/test';
import { loginAsDemo } from './helpers/auth';

test.describe('Tab navigation', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsDemo(page);
    await expect(page.locator('.app-net-worth')).toBeVisible({ timeout: 15000 });
  });

  const tabs = [
    'Cash Flow',
    'Accounts',
    'Investments',
    'Fire',
    'Settings',
    'Dashboard',
  ];

  for (const label of tabs) {
    test(`"${label}" tab renders without crash`, async ({ page }) => {
      await page.click(`button.nav-item:has-text("${label}")`);
      // Wait for loading spinner to disappear and content to settle
      await page.waitForLoadState('networkidle');
      // The clicked nav item becomes active via aria-current.
      await expect(page.locator(`button.nav-item[aria-current="page"]:has-text("${label}")`)).toBeVisible({ timeout: 3000 });
    });
  }

  test('active tab persists after page reload', async ({ page }) => {
    await page.click('button.nav-item:has-text("Cash Flow")');
    await expect(page.locator('button.nav-item[aria-current="page"]:has-text("Cash Flow")')).toBeVisible({ timeout: 3000 });

    await page.reload();
    await page.waitForLoadState('networkidle');
    // AppContext restores from localStorage on mount
    await expect(page.locator('button.nav-item[aria-current="page"]:has-text("Cash Flow")')).toBeVisible({ timeout: 10000 });
  });
});
