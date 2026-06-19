import { test, expect } from '@playwright/test';
import { loginAsDemo } from './helpers/auth';

test.describe('Year navigation — Monthly Net Worth', () => {
  test.beforeEach(async ({ page }) => {
    // Set state before React mounts so the app reads correct prefs on first render
    await page.addInitScript(() => {
      localStorage.setItem('tab', 'dashboard');
      localStorage.removeItem('dashConfig');
      localStorage.removeItem('monthlyOverviewPrefs');
    });
    await loginAsDemo(page);
  });

  test('bug #38 regression: click › fires exactly 1 API call', async ({ page }) => {
    const prevBtn = page.getByTestId('mnw-prev-year');
    const nextBtn = page.getByTestId('mnw-next-year');

    await expect(prevBtn).toBeVisible({ timeout: 20000 });

    // Skip if can't go back (single year of data)
    if (await prevBtn.isDisabled()) {
      test.skip();
      return;
    }

    // Navigate to previous year and wait for data
    await Promise.all([
      page.waitForResponse((r) => r.url().includes('monthly-overview') && r.ok()),
      prevBtn.click(),
    ]);

    // Now navigate forward — collect ALL monthly-overview calls made
    const calls: string[] = [];
    page.on('request', (req) => {
      if (req.url().includes('monthly-overview')) calls.push(req.url());
    });

    await Promise.all([
      page.waitForResponse((r) => r.url().includes('monthly-overview') && r.ok()),
      nextBtn.click(),
    ]);

    // Allow a short window for any spurious second call
    await page.waitForTimeout(400);

    expect(calls).toHaveLength(1);
  });

  test('‹ and › update the year display', async ({ page }) => {
    const prevBtn = page.getByTestId('mnw-prev-year');
    const nextBtn = page.getByTestId('mnw-next-year');

    await expect(prevBtn).toBeVisible({ timeout: 20000 });

    if (await prevBtn.isDisabled()) {
      test.skip();
      return;
    }

    // The year span sits immediately after the prev-year button
    const yearSpan = page.locator('[data-testid="mnw-prev-year"] + span');
    const initialYear = parseInt((await yearSpan.textContent()) ?? '0', 10);

    await Promise.all([
      page.waitForResponse((r) => r.url().includes('monthly-overview') && r.ok()),
      prevBtn.click(),
    ]);
    expect(parseInt((await yearSpan.textContent()) ?? '0', 10)).toBe(initialYear - 1);

    await Promise.all([
      page.waitForResponse((r) => r.url().includes('monthly-overview') && r.ok()),
      nextBtn.click(),
    ]);
    expect(parseInt((await yearSpan.textContent()) ?? '0', 10)).toBe(initialYear);
  });
});
