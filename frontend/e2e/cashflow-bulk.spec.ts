import { test, expect, Page } from "@playwright/test";
import { loginAsTestUser } from "./helpers/auth";

const TEST_EMAIL = "playwright_cfbulk@test.com";
const TEST_PASS = "PlBu!555abc";

const EXP_CAT_NAME = "E2E CF Bulk Expense";

async function getToken(page: Page): Promise<string> {
  const token = await page.evaluate(() => localStorage.getItem("access_token"));
  if (!token) throw new Error("No access_token in localStorage");
  return token;
}

async function cleanupOrphanedCats(page: Page, token: string): Promise<void> {
  const res = await page.request.get("/api/expenses/categories/", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok()) return;
  const cats = await res.json();
  for (const cat of cats.filter(
    (c: { name: string }) => c.name === EXP_CAT_NAME,
  )) {
    await page.request.delete(`/api/expenses/categories/${cat.id}/`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  }
}

async function goToCashFlow(page: Page): Promise<void> {
  await page.reload();
  await page.waitForLoadState("networkidle");
  await page.click('button.nav-item:has-text("Cash Flow")');
  await expect(
    page.locator('button.nav-item[aria-current="page"]:has-text("Cash Flow")'),
  ).toBeVisible({ timeout: 5000 });
  await page.waitForLoadState("networkidle");
}

test.describe("Cash Flow — Bulk selection", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsTestUser(page, TEST_EMAIL, TEST_PASS);
    await expect(page.locator(".app-net-worth")).toBeVisible({
      timeout: 15000,
    });
    const token = await getToken(page);
    await cleanupOrphanedCats(page, token);
  });

  test("bulk verify on selected expenses updates the API state", async ({
    page,
  }) => {
    const token = await getToken(page);
    const headers = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };
    const today = new Date().toISOString().slice(0, 10);

    const expCat = await (
      await page.request.post("/api/expenses/categories/", {
        headers,
        data: {
          name: EXP_CAT_NAME,
          color: "#ff6b6b",
          icon: "🔴",
          category_type: "expense",
        },
      })
    ).json();

    // Three rows so we can confirm "Verify" toggles the lot atomically.
    const stamp = Date.now();
    const descA = `E2E bulk A ${stamp}`;
    const descB = `E2E bulk B ${stamp + 1}`;
    const descC = `E2E bulk C ${stamp + 2}`;
    const expA = await (
      await page.request.post("/api/expenses/", {
        headers,
        data: {
          description: descA,
          amount: "11.00",
          category: expCat.id,
          date: today,
        },
      })
    ).json();
    const expB = await (
      await page.request.post("/api/expenses/", {
        headers,
        data: {
          description: descB,
          amount: "12.00",
          category: expCat.id,
          date: today,
        },
      })
    ).json();
    const expC = await (
      await page.request.post("/api/expenses/", {
        headers,
        data: {
          description: descC,
          amount: "13.00",
          category: expCat.id,
          date: today,
        },
      })
    ).json();

    try {
      await goToCashFlow(page);
      await expect(page.locator(`text=${descA}`)).toBeVisible({
        timeout: 8000,
      });

      // Enter selection mode and tick each row.
      await page.locator('[data-testid="cf-bulk-toggle"]').click();
      await expect(
        page.locator('[data-testid="cf-bulk-banner"]'),
      ).toBeVisible();
      await page.locator(`text=${descA}`).click();
      await page.locator(`text=${descB}`).click();
      await page.locator(`text=${descC}`).click();

      // Toolbar exposes Verify; click it and wait for the network round-trip.
      await expect(
        page.locator('[data-testid="cf-bulk-toolbar"]'),
      ).toBeVisible();
      const verifyPromise = page.waitForResponse(
        (res) =>
          res.url().includes("/api/expenses/cashflow/bulk/") &&
          res.request().method() === "POST",
      );
      await page.locator('[data-testid="cf-bulk-verify"]').click();
      const resp = await verifyPromise;
      expect(resp.ok()).toBeTruthy();

      // After applying, the selection mode resets so the toolbar disappears.
      await expect(
        page.locator('[data-testid="cf-bulk-toolbar"]'),
      ).not.toBeVisible({ timeout: 5000 });

      // Confirm via API that all three are now verified.
      for (const id of [expA.id, expB.id, expC.id]) {
        const got = await (
          await page.request.get(`/api/expenses/${id}/`, { headers })
        ).json();
        expect(got.is_verified).toBe(true);
      }
    } finally {
      await page.request
        .delete(`/api/expenses/${expA.id}/`, { headers })
        .catch(() => {});
      await page.request
        .delete(`/api/expenses/${expB.id}/`, { headers })
        .catch(() => {});
      await page.request
        .delete(`/api/expenses/${expC.id}/`, { headers })
        .catch(() => {});
      await page.request
        .delete(`/api/expenses/categories/${expCat.id}/`, { headers })
        .catch(() => {});
    }
  });

  test("bulk edit modal: 'Remove value' button swaps description input for pill", async ({
    page,
  }) => {
    const token = await getToken(page);
    const headers = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };
    const today = new Date().toISOString().slice(0, 10);

    const expCat = await (
      await page.request.post("/api/expenses/categories/", {
        headers,
        data: {
          name: EXP_CAT_NAME,
          color: "#ff6b6b",
          icon: "🔴",
          category_type: "expense",
        },
      })
    ).json();
    const stamp = Date.now();
    const desc = `E2E bulk-clear ${stamp}`;
    const exp = await (
      await page.request.post("/api/expenses/", {
        headers,
        data: {
          description: desc,
          amount: "5.00",
          category: expCat.id,
          date: today,
        },
      })
    ).json();

    try {
      await goToCashFlow(page);
      await expect(page.locator(`text=${desc}`)).toBeVisible({
        timeout: 8000,
      });
      await page.locator('[data-testid="cf-bulk-toggle"]').click();
      await page.locator(`text=${desc}`).click();
      await page.locator('[data-testid="cf-bulk-edit"]').click();

      // The text input starts as "keep". The Remove button swaps it for the
      // "— Rimuovi valore —" pill so the user can see the explicit clear.
      const textInput = page.locator(
        '[data-testid="cf-bulk-field-text-description"]',
      );
      await expect(textInput).toBeVisible();
      await page
        .locator('[data-testid="cf-bulk-field-remove-description"]')
        .click();
      await expect(
        page.locator('[data-testid="cf-bulk-field-cleared-description"]'),
      ).toBeVisible();
      await expect(textInput).toHaveCount(0);
    } finally {
      await page.request
        .delete(`/api/expenses/${exp.id}/`, { headers })
        .catch(() => {});
      await page.request
        .delete(`/api/expenses/categories/${expCat.id}/`, { headers })
        .catch(() => {});
    }
  });

  test("selection gating: outcome locks the kind; income click is rejected with a toast", async ({
    page,
  }) => {
    const token = await getToken(page);
    const headers = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };
    const today = new Date().toISOString().slice(0, 10);

    const expCat = await (
      await page.request.post("/api/expenses/categories/", {
        headers,
        data: {
          name: EXP_CAT_NAME,
          color: "#ff6b6b",
          icon: "🔴",
          category_type: "expense",
        },
      })
    ).json();
    const incomeCat = await (
      await page.request.post("/api/expenses/categories/", {
        headers,
        data: {
          name: `${EXP_CAT_NAME} INC`,
          color: "#22c55e",
          icon: "💰",
          category_type: "income",
        },
      })
    ).json();
    const stamp = Date.now();
    const descOut = `E2E gate out ${stamp}`;
    const descIn = `E2E gate in ${stamp + 1}`;
    const expOut = await (
      await page.request.post("/api/expenses/", {
        headers,
        data: {
          description: descOut,
          amount: "5.00",
          category: expCat.id,
          date: today,
        },
      })
    ).json();
    const expIn = await (
      await page.request.post("/api/expenses/", {
        headers,
        data: {
          description: descIn,
          amount: "100.00",
          category: incomeCat.id,
          date: today,
        },
      })
    ).json();

    try {
      await goToCashFlow(page);
      await expect(page.locator(`text=${descOut}`)).toBeVisible({
        timeout: 8000,
      });
      await page.locator('[data-testid="cf-bulk-toggle"]').click();
      await page.locator(`text=${descOut}`).click();

      // Count is 1. Clicking an income row of a different kind triggers the
      // mismatch toast and the count stays at 1.
      await page.locator(`text=${descIn}`).click();
      await expect(
        page.locator('[data-testid="cf-bulk-kind-mismatch-toast"]'),
      ).toBeVisible({ timeout: 2000 });
      await expect(
        page.locator('[data-testid="cf-bulk-banner"]'),
      ).toContainText("1");
    } finally {
      await page.request
        .delete(`/api/expenses/${expOut.id}/`, { headers })
        .catch(() => {});
      await page.request
        .delete(`/api/expenses/${expIn.id}/`, { headers })
        .catch(() => {});
      await page.request
        .delete(`/api/expenses/categories/${expCat.id}/`, { headers })
        .catch(() => {});
      await page.request
        .delete(`/api/expenses/categories/${incomeCat.id}/`, { headers })
        .catch(() => {});
    }
  });

  test("bulk delete removes the selected rows", async ({ page }) => {
    const token = await getToken(page);
    const headers = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };
    const today = new Date().toISOString().slice(0, 10);

    const expCat = await (
      await page.request.post("/api/expenses/categories/", {
        headers,
        data: {
          name: EXP_CAT_NAME,
          color: "#ff6b6b",
          icon: "🔴",
          category_type: "expense",
        },
      })
    ).json();

    const stamp = Date.now();
    const desc = `E2E bulk-del ${stamp}`;
    const exp = await (
      await page.request.post("/api/expenses/", {
        headers,
        data: {
          description: desc,
          amount: "7.00",
          category: expCat.id,
          date: today,
        },
      })
    ).json();

    try {
      await goToCashFlow(page);
      await expect(page.locator(`text=${desc}`)).toBeVisible({
        timeout: 8000,
      });

      await page.locator('[data-testid="cf-bulk-toggle"]').click();
      await page.locator(`text=${desc}`).click();
      await page.locator('[data-testid="cf-bulk-delete-open"]').click();

      const deletePromise = page.waitForResponse(
        (res) =>
          res.url().includes("/api/expenses/cashflow/bulk/") &&
          res.request().method() === "POST",
      );
      await page.locator('[data-testid="cf-bulk-delete-confirm"]').click();
      const resp = await deletePromise;
      expect(resp.ok()).toBeTruthy();

      // The row is gone from both the UI and the API.
      await expect(page.locator(`text=${desc}`)).not.toBeVisible({
        timeout: 5000,
      });
      const got = await page.request.get(`/api/expenses/${exp.id}/`, {
        headers,
      });
      expect(got.status()).toBe(404);
    } finally {
      await page.request
        .delete(`/api/expenses/${exp.id}/`, { headers })
        .catch(() => {});
      await page.request
        .delete(`/api/expenses/categories/${expCat.id}/`, { headers })
        .catch(() => {});
    }
  });
});
