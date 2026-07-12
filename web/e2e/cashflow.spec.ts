import { test, expect, Page } from "@playwright/test";
import { loginAsTestUser } from "./helpers/auth";

const TEST_EMAIL = "playwright_cashflow@test.com";
const TEST_PASS = "PlCf!777xyz";

const INC_CAT_NAME = "E2E CF Income";
const EXP_CAT_NAME = "E2E CF Expense";

async function getToken(page: Page): Promise<string> {
    const token = await page.evaluate(() =>
        localStorage.getItem("access_token"),
    );
    if (!token) throw new Error("No access_token in localStorage");
    return token;
}

// Cleanup orphaned categories from previous failed runs (category_type=income/expense SET_NULL on expenses).
async function cleanupOrphanedCats(page: Page, token: string): Promise<void> {
    const res = await page.request.get("/fininzen/api/expenses/categories/", {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok()) return;
    // The categories endpoint is DRF-paginated ({count, results}); tolerate both a
    // bare array and the paginated envelope.
    const body = await res.json();
    const cats: Array<{ id: number; name: string }> = Array.isArray(body)
        ? body
        : (body?.results ?? []);
    for (const cat of cats.filter((c) =>
        [INC_CAT_NAME, EXP_CAT_NAME].includes(c.name),
    )) {
        await page.request.delete(
            `/fininzen/api/expenses/categories/${cat.id}/`,
            {
                headers: { Authorization: `Bearer ${token}` },
            },
        );
    }
}

async function goToAllTransactions(page: Page): Promise<void> {
    await page.reload();
    await page.waitForLoadState("networkidle");
    await page.click('nav a[href="/cashflow"]');
    await expect(page).toHaveURL(/\/cashflow$/);
    await expect(
        page.locator('nav a[href="/cashflow"][aria-current="page"]'),
    ).toBeVisible({ timeout: 5000 });
    await page.waitForLoadState("networkidle");
}

async function safeDelete(
    page: Page,
    url: string,
    headers: Record<string, string>,
): Promise<void> {
    try {
        await page.request.delete(url, { headers, timeout: 1200 });
    } catch {
        // best-effort cleanup only
    }
}

async function cleanupTestData(
    page: Page,
    urls: string[],
    headers: Record<string, string>,
): Promise<void> {
    for (const url of urls) {
        await safeDelete(page, url, headers);
    }
}

test.describe("Cash Flow — All Transactions", () => {
    test.beforeEach(async ({ page }) => {
        await loginAsTestUser(page, TEST_EMAIL, TEST_PASS);
        await expect(page.locator(".app-net-worth")).toBeVisible({
            timeout: 15000,
        });
        const token = await getToken(page);
        await cleanupOrphanedCats(page, token);
    });

    test("view loads expenses on open", async ({ page }) => {
        const token = await getToken(page);
        const headers = {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
        };
        const today = new Date().toISOString().slice(0, 10);

        const incCat = await (
            await page.request.post("/fininzen/api/expenses/categories/", {
                headers,
                data: {
                    name: INC_CAT_NAME,
                    color: "#4ade80",
                    icon: "💚",
                    category_type: "income",
                },
            })
        ).json();
        const expCat = await (
            await page.request.post("/fininzen/api/expenses/categories/", {
                headers,
                data: {
                    name: EXP_CAT_NAME,
                    color: "#ff6b6b",
                    icon: "🔴",
                    category_type: "expense",
                },
            })
        ).json();

        const incDesc = `E2E cf-income ${Date.now()}`;
        const expDesc = `E2E cf-expense ${Date.now() + 1}`;
        const inc = await (
            await page.request.post("/fininzen/api/expenses/", {
                headers,
                data: {
                    description: incDesc,
                    amount: "100.00",
                    category: incCat.id,
                    date: today,
                },
            })
        ).json();
        const exp = await (
            await page.request.post("/fininzen/api/expenses/", {
                headers,
                data: {
                    description: expDesc,
                    amount: "50.00",
                    category: expCat.id,
                    date: today,
                },
            })
        ).json();

        try {
            await goToAllTransactions(page);
            await expect(page.locator(`text=${incDesc}`)).toBeVisible({
                timeout: 8000,
            });
            await expect(page.locator(`text=${expDesc}`)).toBeVisible({
                timeout: 5000,
            });
        } finally {
            await cleanupTestData(
                page,
                [
                    `/fininzen/api/expenses/${inc.id}/`,
                    `/fininzen/api/expenses/${exp.id}/`,
                    `/fininzen/api/expenses/categories/${incCat.id}/`,
                    `/fininzen/api/expenses/categories/${expCat.id}/`,
                ],
                headers,
            );
        }
    });

    test("type filter Income hides outcome items", async ({ page }) => {
        const token = await getToken(page);
        const headers = {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
        };
        const today = new Date().toISOString().slice(0, 10);

        const incCat = await (
            await page.request.post("/fininzen/api/expenses/categories/", {
                headers,
                data: {
                    name: INC_CAT_NAME,
                    color: "#4ade80",
                    icon: "💚",
                    category_type: "income",
                },
            })
        ).json();
        const expCat = await (
            await page.request.post("/fininzen/api/expenses/categories/", {
                headers,
                data: {
                    name: EXP_CAT_NAME,
                    color: "#ff6b6b",
                    icon: "🔴",
                    category_type: "expense",
                },
            })
        ).json();

        const incDesc = `E2E cf-income ${Date.now()}`;
        const expDesc = `E2E cf-expense ${Date.now() + 1}`;
        const inc = await (
            await page.request.post("/fininzen/api/expenses/", {
                headers,
                data: {
                    description: incDesc,
                    amount: "100.00",
                    category: incCat.id,
                    date: today,
                },
            })
        ).json();
        const exp = await (
            await page.request.post("/fininzen/api/expenses/", {
                headers,
                data: {
                    description: expDesc,
                    amount: "50.00",
                    category: expCat.id,
                    date: today,
                },
            })
        ).json();

        try {
            await goToAllTransactions(page);
            await expect(page.locator(`text=${incDesc}`)).toBeVisible({
                timeout: 8000,
            });

            await page.click('[data-testid="cf-kpi-income"]');

            await expect(page.locator(`text=${incDesc}`)).toBeVisible({
                timeout: 5000,
            });
            await expect(page.locator(`text=${expDesc}`)).not.toBeVisible({
                timeout: 5000,
            });
        } finally {
            await cleanupTestData(
                page,
                [
                    `/fininzen/api/expenses/${inc.id}/`,
                    `/fininzen/api/expenses/${exp.id}/`,
                    `/fininzen/api/expenses/categories/${incCat.id}/`,
                    `/fininzen/api/expenses/categories/${expCat.id}/`,
                ],
                headers,
            );
        }
    });

    test("type filter Outcome hides income items", async ({ page }) => {
        const token = await getToken(page);
        const headers = {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
        };
        const today = new Date().toISOString().slice(0, 10);

        const incCat = await (
            await page.request.post("/fininzen/api/expenses/categories/", {
                headers,
                data: {
                    name: INC_CAT_NAME,
                    color: "#4ade80",
                    icon: "💚",
                    category_type: "income",
                },
            })
        ).json();
        const expCat = await (
            await page.request.post("/fininzen/api/expenses/categories/", {
                headers,
                data: {
                    name: EXP_CAT_NAME,
                    color: "#ff6b6b",
                    icon: "🔴",
                    category_type: "expense",
                },
            })
        ).json();

        const incDesc = `E2E cf-income ${Date.now()}`;
        const expDesc = `E2E cf-expense ${Date.now() + 1}`;
        const inc = await (
            await page.request.post("/fininzen/api/expenses/", {
                headers,
                data: {
                    description: incDesc,
                    amount: "100.00",
                    category: incCat.id,
                    date: today,
                },
            })
        ).json();
        const exp = await (
            await page.request.post("/fininzen/api/expenses/", {
                headers,
                data: {
                    description: expDesc,
                    amount: "50.00",
                    category: expCat.id,
                    date: today,
                },
            })
        ).json();

        try {
            await goToAllTransactions(page);
            await expect(page.locator(`text=${expDesc}`)).toBeVisible({
                timeout: 8000,
            });

            await page.click('[data-testid="cf-kpi-outcome"]');

            await expect(page.locator(`text=${expDesc}`)).toBeVisible({
                timeout: 5000,
            });
            await expect(page.locator(`text=${incDesc}`)).not.toBeVisible({
                timeout: 5000,
            });
        } finally {
            await cleanupTestData(
                page,
                [
                    `/fininzen/api/expenses/${inc.id}/`,
                    `/fininzen/api/expenses/${exp.id}/`,
                    `/fininzen/api/expenses/categories/${incCat.id}/`,
                    `/fininzen/api/expenses/categories/${expCat.id}/`,
                ],
                headers,
            );
        }
    });

    test("category filter restricts list", async ({ page }) => {
        const token = await getToken(page);
        const headers = {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
        };
        const today = new Date().toISOString().slice(0, 10);

        const incCat = await (
            await page.request.post("/fininzen/api/expenses/categories/", {
                headers,
                data: {
                    name: INC_CAT_NAME,
                    color: "#4ade80",
                    icon: "💚",
                    category_type: "income",
                },
            })
        ).json();
        const expCat = await (
            await page.request.post("/fininzen/api/expenses/categories/", {
                headers,
                data: {
                    name: EXP_CAT_NAME,
                    color: "#ff6b6b",
                    icon: "🔴",
                    category_type: "expense",
                },
            })
        ).json();

        const incDesc = `E2E cf-income ${Date.now()}`;
        const expDesc = `E2E cf-expense ${Date.now() + 1}`;
        const inc = await (
            await page.request.post("/fininzen/api/expenses/", {
                headers,
                data: {
                    description: incDesc,
                    amount: "100.00",
                    category: incCat.id,
                    date: today,
                },
            })
        ).json();
        const exp = await (
            await page.request.post("/fininzen/api/expenses/", {
                headers,
                data: {
                    description: expDesc,
                    amount: "50.00",
                    category: expCat.id,
                    date: today,
                },
            })
        ).json();

        try {
            await goToAllTransactions(page);
            await expect(page.locator(`text=${incDesc}`)).toBeVisible({
                timeout: 8000,
            });

            // Category filtering moved into the filters BottomSheet: open it, pick the
            // category in the CategorySelect dropdown, then apply (closes the sheet).
            await page.click('[data-testid="cf-filters-open"]');
            await page.click('[data-testid="category-select-trigger"]');
            await page
                .locator(
                    `[data-testid="category-select-dropdown"] button:has-text("${EXP_CAT_NAME}")`,
                )
                .first()
                .click();
            await page.click('[data-testid="category-select-trigger"]');
            await page.click('[data-testid="cf-filters-apply"]');

            await expect(page.locator(`text=${expDesc}`)).toBeVisible({
                timeout: 5000,
            });
            await expect(page.locator(`text=${incDesc}`)).not.toBeVisible({
                timeout: 5000,
            });
        } finally {
            await cleanupTestData(
                page,
                [
                    `/fininzen/api/expenses/${inc.id}/`,
                    `/fininzen/api/expenses/${exp.id}/`,
                    `/fininzen/api/expenses/categories/${incCat.id}/`,
                    `/fininzen/api/expenses/categories/${expCat.id}/`,
                ],
                headers,
            );
        }
    });

    test("clearing category filter restores all items", async ({ page }) => {
        const token = await getToken(page);
        const headers = {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
        };
        const today = new Date().toISOString().slice(0, 10);

        const incCat = await (
            await page.request.post("/fininzen/api/expenses/categories/", {
                headers,
                data: {
                    name: INC_CAT_NAME,
                    color: "#4ade80",
                    icon: "💚",
                    category_type: "income",
                },
            })
        ).json();
        const expCat = await (
            await page.request.post("/fininzen/api/expenses/categories/", {
                headers,
                data: {
                    name: EXP_CAT_NAME,
                    color: "#ff6b6b",
                    icon: "🔴",
                    category_type: "expense",
                },
            })
        ).json();

        const incDesc = `E2E cf-income ${Date.now()}`;
        const expDesc = `E2E cf-expense ${Date.now() + 1}`;
        const inc = await (
            await page.request.post("/fininzen/api/expenses/", {
                headers,
                data: {
                    description: incDesc,
                    amount: "100.00",
                    category: incCat.id,
                    date: today,
                },
            })
        ).json();
        const exp = await (
            await page.request.post("/fininzen/api/expenses/", {
                headers,
                data: {
                    description: expDesc,
                    amount: "50.00",
                    category: expCat.id,
                    date: today,
                },
            })
        ).json();

        try {
            await goToAllTransactions(page);
            await expect(page.locator(`text=${incDesc}`)).toBeVisible({
                timeout: 8000,
            });

            // Apply the expense-category filter via the filters BottomSheet.
            await page.click('[data-testid="cf-filters-open"]');
            await page.click('[data-testid="category-select-trigger"]');
            await page
                .locator(
                    `[data-testid="category-select-dropdown"] button:has-text("${EXP_CAT_NAME}")`,
                )
                .first()
                .click();
            await page.click('[data-testid="category-select-trigger"]');
            await page.click('[data-testid="cf-filters-apply"]');
            await expect(page.locator(`text=${incDesc}`)).not.toBeVisible({
                timeout: 5000,
            });

            // Clear via the sheet's reset button, then re-apply (closes the sheet).
            await page.click('[data-testid="cf-filters-open"]');
            await page.click('[data-testid="cf-filters-reset"]');
            await page.click('[data-testid="cf-filters-apply"]');

            await expect(page.locator(`text=${incDesc}`)).toBeVisible({
                timeout: 5000,
            });
            await expect(page.locator(`text=${expDesc}`)).toBeVisible({
                timeout: 5000,
            });
        } finally {
            await cleanupTestData(
                page,
                [
                    `/fininzen/api/expenses/${inc.id}/`,
                    `/fininzen/api/expenses/${exp.id}/`,
                    `/fininzen/api/expenses/categories/${incCat.id}/`,
                    `/fininzen/api/expenses/categories/${expCat.id}/`,
                ],
                headers,
            );
        }
    });
});
