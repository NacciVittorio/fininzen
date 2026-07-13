import { test, expect } from '@playwright/test';
import { loginAsDemo } from './helpers/auth';

test.describe('Authentication', () => {
  test('wrong credentials shows error', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', 'nobody@example.com');
    await page.fill('input[type="password"]', 'wrongpassword');
    await page.click('button[type="submit"]');
    await expect(page.locator('text=Invalid email or password')).toBeVisible({ timeout: 8000 });
  });

  test('demo login renders dashboard with net worth', async ({ page }) => {
    await loginAsDemo(page);
    await expect(page.locator('.app-net-worth')).toBeVisible({ timeout: 15000 });
    // Tab nav present
    await expect(page.locator('nav a[href="/dashboard"]')).toBeVisible();
    await expect(page.locator('nav a[href="/cashflow"]')).toBeVisible();
  });

  // PARITY GAP: the Next.js app shell is currently a placeholder top-nav with no
  // demo banner (the old SPA showed a "demo mode" banner with a demo-logout CTA).
  // Re-enable once the shell reaches parity. Tracked under task #8 / shell parity.
  test.fixme('demo banner shown on demo login', async ({ page }) => {
    await loginAsDemo(page);
    await expect(page.locator('.app-net-worth')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('text=demo mode')).toBeVisible();
  });

  test('logout returns to login form', async ({ page }) => {
    await loginAsDemo(page);
    await expect(page.locator('.app-net-worth')).toBeVisible({ timeout: 15000 });
    // Sign-out lives only in Settings now (removed from the header/sidebar), so
    // reach it via the Settings tab and click the Settings sign-out button.
    await page.click('nav a[href="/settings"]');
    await expect(page).toHaveURL(/\/settings$/);
    await page.getByTestId('settings-root-logout').click();
    await expect(page.locator('input[type="email"]')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('input[type="password"]')).toBeVisible();
  });
});
