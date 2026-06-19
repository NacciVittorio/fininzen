import { test, expect } from '@playwright/test';
import { loginAsDemo } from './helpers/auth';

test.describe('Authentication', () => {
  test('wrong credentials shows error', async ({ page }) => {
    await page.goto('/');
    await page.fill('input[type="email"]', 'nobody@example.com');
    await page.fill('input[type="password"]', 'wrongpassword');
    await page.click('button[type="submit"]');
    await expect(page.locator('text=Invalid email or password')).toBeVisible({ timeout: 8000 });
  });

  test('demo login renders dashboard with net worth', async ({ page }) => {
    await loginAsDemo(page);
    await expect(page.locator('.app-net-worth')).toBeVisible({ timeout: 15000 });
    // Tab nav present
    await expect(page.locator('button.nav-item', { hasText: 'Dashboard' })).toBeVisible();
    await expect(page.locator('button.nav-item', { hasText: 'Cash Flow' })).toBeVisible();
  });

  test('demo banner shown on demo login', async ({ page }) => {
    await loginAsDemo(page);
    await expect(page.locator('.app-net-worth')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('text=demo mode')).toBeVisible();
  });

  test('logout returns to login form', async ({ page }) => {
    await loginAsDemo(page);
    await expect(page.locator('.app-net-worth')).toBeVisible({ timeout: 15000 });
    await page.click('[data-testid="demo-logout-cta"]');
    await expect(page.locator('input[type="email"]')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('input[type="password"]')).toBeVisible();
  });
});
