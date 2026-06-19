import { test, expect, Page } from '@playwright/test';
import { loginAsTestUser } from './helpers/auth';

const TEST_EMAIL = 'playwright_cashflow@test.com';
const TEST_PASS = 'PlCf!777xyz';

const INC_CAT_NAME = 'E2E CF Income';
const EXP_CAT_NAME = 'E2E CF Expense';

async function getToken(page: Page): Promise<string> {
  const token = await page.evaluate(() => localStorage.getItem('access_token'));
  if (!token) throw new Error('No access_token in localStorage');
  return token;
}

// Cleanup orphaned categories from previous failed runs (category_type=income/expense SET_NULL on expenses).
async function cleanupOrphanedCats(page: Page, token: string): Promise<void> {
  const res = await page.request.get('/api/expenses/categories/', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok()) return;
  const cats = await res.json();
  for (const cat of cats.filter((c: any) => [INC_CAT_NAME, EXP_CAT_NAME].includes(c.name))) {
    await page.request.delete(`/api/expenses/categories/${cat.id}/`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  }
}

async function goToAllTransactions(page: Page): Promise<void> {
  await page.reload();
  await page.waitForLoadState('networkidle');
  await page.click('button.nav-item:has-text("Cash Flow")');
  await expect(
    page.locator('button.nav-item[aria-current="page"]:has-text("Cash Flow")')
  ).toBeVisible({ timeout: 5000 });
  await page.waitForLoadState('networkidle');
}

async function safeDelete(page: Page, url: string, headers: Record<string, string>): Promise<void> {
  try {
    await page.request.delete(url, { headers, timeout: 1200 });
  } catch {
    // best-effort cleanup only
  }
}

async function cleanupTestData(page: Page, urls: string[], headers: Record<string, string>): Promise<void> {
  for (const url of urls) {
    await safeDelete(page, url, headers);
  }
}

test.describe('Cash Flow — All Transactions', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsTestUser(page, TEST_EMAIL, TEST_PASS);
    await expect(page.locator('.app-net-worth')).toBeVisible({ timeout: 15000 });
    const token = await getToken(page);
    await cleanupOrphanedCats(page, token);
  });

  test('view loads expenses on open', async ({ page }) => {
    const token = await getToken(page);
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    const today = new Date().toISOString().slice(0, 10);

    const incCat = await (await page.request.post('/api/expenses/categories/', { headers, data: { name: INC_CAT_NAME, color: '#4ade80', icon: '💚', category_type: 'income' } })).json();
    const expCat = await (await page.request.post('/api/expenses/categories/', { headers, data: { name: EXP_CAT_NAME, color: '#ff6b6b', icon: '🔴', category_type: 'expense' } })).json();

    const incDesc = `E2E cf-income ${Date.now()}`;
    const expDesc = `E2E cf-expense ${Date.now() + 1}`;
    const inc = await (await page.request.post('/api/expenses/', { headers, data: { description: incDesc, amount: '100.00', category: incCat.id, date: today } })).json();
    const exp = await (await page.request.post('/api/expenses/', { headers, data: { description: expDesc, amount: '50.00', category: expCat.id, date: today } })).json();

    try {
      await goToAllTransactions(page);
      await expect(page.locator(`text=${incDesc}`)).toBeVisible({ timeout: 8000 });
      await expect(page.locator(`text=${expDesc}`)).toBeVisible({ timeout: 5000 });
    } finally {
      await cleanupTestData(page, [
        `/api/expenses/${inc.id}/`,
        `/api/expenses/${exp.id}/`,
        `/api/expenses/categories/${incCat.id}/`,
        `/api/expenses/categories/${expCat.id}/`,
      ], headers);
    }
  });

  test('type filter Income hides outcome items', async ({ page }) => {
    const token = await getToken(page);
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    const today = new Date().toISOString().slice(0, 10);

    const incCat = await (await page.request.post('/api/expenses/categories/', { headers, data: { name: INC_CAT_NAME, color: '#4ade80', icon: '💚', category_type: 'income' } })).json();
    const expCat = await (await page.request.post('/api/expenses/categories/', { headers, data: { name: EXP_CAT_NAME, color: '#ff6b6b', icon: '🔴', category_type: 'expense' } })).json();

    const incDesc = `E2E cf-income ${Date.now()}`;
    const expDesc = `E2E cf-expense ${Date.now() + 1}`;
    const inc = await (await page.request.post('/api/expenses/', { headers, data: { description: incDesc, amount: '100.00', category: incCat.id, date: today } })).json();
    const exp = await (await page.request.post('/api/expenses/', { headers, data: { description: expDesc, amount: '50.00', category: expCat.id, date: today } })).json();

    try {
      await goToAllTransactions(page);
      await expect(page.locator(`text=${incDesc}`)).toBeVisible({ timeout: 8000 });

      await page.click('[data-testid="cf-kpi-income"]');

      await expect(page.locator(`text=${incDesc}`)).toBeVisible({ timeout: 5000 });
      await expect(page.locator(`text=${expDesc}`)).not.toBeVisible({ timeout: 5000 });
    } finally {
      await cleanupTestData(page, [
        `/api/expenses/${inc.id}/`,
        `/api/expenses/${exp.id}/`,
        `/api/expenses/categories/${incCat.id}/`,
        `/api/expenses/categories/${expCat.id}/`,
      ], headers);
    }
  });

  test('type filter Outcome hides income items', async ({ page }) => {
    const token = await getToken(page);
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    const today = new Date().toISOString().slice(0, 10);

    const incCat = await (await page.request.post('/api/expenses/categories/', { headers, data: { name: INC_CAT_NAME, color: '#4ade80', icon: '💚', category_type: 'income' } })).json();
    const expCat = await (await page.request.post('/api/expenses/categories/', { headers, data: { name: EXP_CAT_NAME, color: '#ff6b6b', icon: '🔴', category_type: 'expense' } })).json();

    const incDesc = `E2E cf-income ${Date.now()}`;
    const expDesc = `E2E cf-expense ${Date.now() + 1}`;
    const inc = await (await page.request.post('/api/expenses/', { headers, data: { description: incDesc, amount: '100.00', category: incCat.id, date: today } })).json();
    const exp = await (await page.request.post('/api/expenses/', { headers, data: { description: expDesc, amount: '50.00', category: expCat.id, date: today } })).json();

    try {
      await goToAllTransactions(page);
      await expect(page.locator(`text=${expDesc}`)).toBeVisible({ timeout: 8000 });

      await page.click('[data-testid="cf-kpi-outcome"]');

      await expect(page.locator(`text=${expDesc}`)).toBeVisible({ timeout: 5000 });
      await expect(page.locator(`text=${incDesc}`)).not.toBeVisible({ timeout: 5000 });
    } finally {
      await cleanupTestData(page, [
        `/api/expenses/${inc.id}/`,
        `/api/expenses/${exp.id}/`,
        `/api/expenses/categories/${incCat.id}/`,
        `/api/expenses/categories/${expCat.id}/`,
      ], headers);
    }
  });

  test('category filter restricts list', async ({ page }) => {
    const token = await getToken(page);
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    const today = new Date().toISOString().slice(0, 10);

    const incCat = await (await page.request.post('/api/expenses/categories/', { headers, data: { name: INC_CAT_NAME, color: '#4ade80', icon: '💚', category_type: 'income' } })).json();
    const expCat = await (await page.request.post('/api/expenses/categories/', { headers, data: { name: EXP_CAT_NAME, color: '#ff6b6b', icon: '🔴', category_type: 'expense' } })).json();

    const incDesc = `E2E cf-income ${Date.now()}`;
    const expDesc = `E2E cf-expense ${Date.now() + 1}`;
    const inc = await (await page.request.post('/api/expenses/', { headers, data: { description: incDesc, amount: '100.00', category: incCat.id, date: today } })).json();
    const exp = await (await page.request.post('/api/expenses/', { headers, data: { description: expDesc, amount: '50.00', category: expCat.id, date: today } })).json();

    try {
      await goToAllTransactions(page);
      await expect(page.locator(`text=${incDesc}`)).toBeVisible({ timeout: 8000 });

      await page.click('[data-testid="cf-filter-category"]');
      await page.locator(`button:has-text("${EXP_CAT_NAME}")`).first().click();

      await expect(page.locator(`text=${expDesc}`)).toBeVisible({ timeout: 5000 });
      await expect(page.locator(`text=${incDesc}`)).not.toBeVisible({ timeout: 5000 });
    } finally {
      await cleanupTestData(page, [
        `/api/expenses/${inc.id}/`,
        `/api/expenses/${exp.id}/`,
        `/api/expenses/categories/${incCat.id}/`,
        `/api/expenses/categories/${expCat.id}/`,
      ], headers);
    }
  });

  test('clearing category filter restores all items', async ({ page }) => {
    const token = await getToken(page);
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    const today = new Date().toISOString().slice(0, 10);

    const incCat = await (await page.request.post('/api/expenses/categories/', { headers, data: { name: INC_CAT_NAME, color: '#4ade80', icon: '💚', category_type: 'income' } })).json();
    const expCat = await (await page.request.post('/api/expenses/categories/', { headers, data: { name: EXP_CAT_NAME, color: '#ff6b6b', icon: '🔴', category_type: 'expense' } })).json();

    const incDesc = `E2E cf-income ${Date.now()}`;
    const expDesc = `E2E cf-expense ${Date.now() + 1}`;
    const inc = await (await page.request.post('/api/expenses/', { headers, data: { description: incDesc, amount: '100.00', category: incCat.id, date: today } })).json();
    const exp = await (await page.request.post('/api/expenses/', { headers, data: { description: expDesc, amount: '50.00', category: expCat.id, date: today } })).json();

    try {
      await goToAllTransactions(page);
      await expect(page.locator(`text=${incDesc}`)).toBeVisible({ timeout: 8000 });

      await page.click('[data-testid="cf-filter-category"]');
      await page.locator(`button:has-text("${EXP_CAT_NAME}")`).first().click();
      await expect(page.locator(`text=${incDesc}`)).not.toBeVisible({ timeout: 5000 });

      await page.locator('[data-testid="cf-filter-category"] + button[aria-label="Clear filter"]').click();

      await expect(page.locator(`text=${incDesc}`)).toBeVisible({ timeout: 5000 });
      await expect(page.locator(`text=${expDesc}`)).toBeVisible({ timeout: 5000 });
    } finally {
      await cleanupTestData(page, [
        `/api/expenses/${inc.id}/`,
        `/api/expenses/${exp.id}/`,
        `/api/expenses/categories/${incCat.id}/`,
        `/api/expenses/categories/${expCat.id}/`,
      ], headers);
    }
  });
});
