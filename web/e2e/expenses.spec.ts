import { test, expect, Page } from '@playwright/test';
import { loginAsTestUser } from './helpers/auth';

const TEST_EMAIL = 'playwright_expenses@test.com';
const TEST_PASS = 'PlExp!888xyz';

async function getToken(page: Page): Promise<string> {
  const token = await page.evaluate(() => localStorage.getItem('access_token'));
  if (!token) throw new Error('No access_token in localStorage');
  return token;
}

const CAT_NAME = 'E2E Test Category';

async function createCategory(page: Page, token: string): Promise<number> {
  const res = await page.request.post('/fininzen/api/expenses/categories/', {
    headers: { Authorization: `Bearer ${token}` },
    data: { name: CAT_NAME, color: '#4f7fff', icon: '🧪', category_type: 'expense' },
  });
  if (!res.ok()) throw new Error(`category create failed: ${res.status()}`);
  const body = await res.json();
  return body.id;
}

async function deleteCategory(page: Page, token: string, id: number): Promise<void> {
  await page.request.delete(`/fininzen/api/expenses/categories/${id}/`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

// Reload page and navigate to Cash Flow so the app refetches categories/expenses.
async function goToCashFlow(page: Page): Promise<void> {
  await page.reload();
  await page.waitForLoadState('networkidle');
  await page.click('nav a[href="/cashflow"]');
  await page.waitForLoadState('networkidle');
}

test.describe('Expenses CRUD', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsTestUser(page, TEST_EMAIL, TEST_PASS);
    await expect(page.locator('.app-net-worth')).toBeVisible({ timeout: 15000 });
  });

  test('add expense appears in list', async ({ page }) => {
    const token = await getToken(page);
    const catId = await createCategory(page, token);

    // Reload so app fetches the newly created category into its state
    await goToCashFlow(page);

    const desc = `E2E expense ${Date.now()}`;

    // Open modal
    await page.click('[data-testid="expenses-add-fab"]');
    await expect(page.locator('text=New Expense')).toBeVisible({ timeout: 5000 });

    // Fill form
    await page.fill('input[placeholder="Description"]', desc);
    await page.fill('input[inputmode="decimal"]', '42.50');
    // Open CategorySelect dropdown and pick the category by name
    await page.locator('[data-testid="category-select-trigger"]').click();
    await page.locator(`[data-testid="category-select-dropdown"] button:has-text("${CAT_NAME}")`).first().click();
    const today = new Date().toISOString().slice(0, 10);
    await page.fill('input[type="date"]', today);

    // Submit via the movement sheet's primary button. The web app renders the
    // expense form in a BottomSheet (.bottom-sheet__panel), not the old .modal-inner.
    await Promise.all([
      page.waitForResponse((r) => r.url().includes('/fininzen/api/expenses/') && r.ok()),
      page.click('.bottom-sheet__panel button.btn.btn-p'),
    ]);

    await expect(page.locator(`text=${desc}`)).toBeVisible({ timeout: 8000 });

    await deleteCategory(page, token, catId);
  });

  test('edit modal pre-fills existing expense', async ({ page }) => {
    const token = await getToken(page);
    const catId = await createCategory(page, token);

    // Create expense via API
    const desc = `E2E edit ${Date.now()}`;
    const expRes = await page.request.post('/fininzen/api/expenses/', {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: {
        description: desc,
        amount: '10.00',
        category: catId,
        date: new Date().toISOString().slice(0, 10),
      },
    });
    expect(expRes.ok()).toBeTruthy();

    // Reload so the new expense and category are in the app's state
    await goToCashFlow(page);

    await expect(page.locator(`text=${desc}`)).toBeVisible({ timeout: 8000 });

    // The web app opens a read-only detail sheet (CfDetailSheet) on row click,
    // not the edit modal directly — click through its edit button.
    await page.locator(`text=${desc}`).first().click();
    await page.locator('[data-testid="cf-detail-edit"]').click();

    // Edit modal opens with correct description
    await expect(page.locator('text=Edit Expense')).toBeVisible({ timeout: 5000 });
    // React controlled input — check value property not HTML attribute
    await expect(page.locator('input[placeholder="Description"]')).toHaveValue(desc, { timeout: 3000 });

    await page.click('button:has-text("Cancel")');

    await deleteCategory(page, token, catId);
  });

  test('delete expense removes it from list', async ({ page }) => {
    const token = await getToken(page);
    const catId = await createCategory(page, token);

    const desc = `E2E delete ${Date.now()}`;
    const expRes = await page.request.post('/fininzen/api/expenses/', {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: {
        description: desc,
        amount: '5.00',
        category: catId,
        date: new Date().toISOString().slice(0, 10),
      },
    });
    const { id: expId } = await expRes.json();

    await goToCashFlow(page);
    await expect(page.locator(`text=${desc}`)).toBeVisible({ timeout: 8000 });

    // Delete via API (avoids flaky multi-step UI interaction)
    await page.request.delete(`/fininzen/api/expenses/${expId}/`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    // Reload to confirm gone
    await goToCashFlow(page);
    await expect(page.locator(`text=${desc}`)).not.toBeVisible({ timeout: 5000 });

    await deleteCategory(page, token, catId);
  });
});
