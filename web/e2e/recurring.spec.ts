import { test, expect, Page } from "@playwright/test";
import { loginAsTestUser } from "./helpers/auth";

const TEST_EMAIL = "playwright_recurring@test.com";
const TEST_PASS = "PlRec!888xyz";

async function getToken(page: Page): Promise<string> {
    const token = await page.evaluate(() =>
        localStorage.getItem("access_token"),
    );
    if (!token) throw new Error("No access_token in localStorage");
    return token;
}

async function openRecurringSettings(page: Page): Promise<void> {
    await page.reload();
    await page.waitForSelector(".app-net-worth", { timeout: 15000 });
    await page.click('nav a[href="/settings"]');
    const recurring = page.locator('[data-testid="settings-root-recurring"]');
    await expect(recurring).toBeVisible({ timeout: 5000 });
    await recurring.click();
}

async function createExpenseCategory(
    page: Page,
    token: string,
    name: string,
): Promise<number> {
    const res = await page.request.post("/fininzen/api/expenses/categories/", {
        headers: { Authorization: `Bearer ${token}` },
        data: {
            name,
            color: "#4f7fff",
            icon: "R",
            category_type: "expense",
        },
    });
    if (!res.ok()) throw new Error(`category create failed: ${res.status()}`);
    return (await res.json()).id;
}

async function createBankAccount(
    page: Page,
    token: string,
    suffix: string,
): Promise<{ typeId: number; accountId: number }> {
    const typeRes = await page.request.post(
        "/fininzen/api/portfolio/investment-types/",
        {
            headers: { Authorization: `Bearer ${token}` },
            data: {
                name: `E2E Bank ${suffix}`,
                color: "#4f7fff",
                icon: "B",
                supports_ticker: false,
                is_liquid_default: true,
                is_bank_account: true,
                tax_rate: "0",
            },
        },
    );
    if (!typeRes.ok())
        throw new Error(`type create failed: ${typeRes.status()}`);
    const typeId = (await typeRes.json()).id;

    const accountRes = await page.request.post("/fininzen/api/portfolio/", {
        headers: { Authorization: `Bearer ${token}` },
        data: {
            name: `E2E Main Account ${suffix}`,
            tracking_type: "MANUAL",
            investment_type: typeId,
            is_liquid: true,
            current_value: "1000.00",
            invested_capital: "1000.00",
        },
    });
    if (!accountRes.ok()) {
        throw new Error(`account create failed: ${accountRes.status()}`);
    }
    return { typeId, accountId: (await accountRes.json()).id };
}

test.describe("Recurring expenses form", () => {
    test("creates, edits, toggles, and deletes a recurring expense", async ({
        page,
    }) => {
        test.setTimeout(20000);

        await loginAsTestUser(page, TEST_EMAIL, TEST_PASS);
        const token = await getToken(page);
        const suffix = String(Date.now());
        const categoryName = `E2E Recurring Category ${suffix}`;
        const description = `E2E recurring ${suffix}`;
        const categoryId = await createExpenseCategory(
            page,
            token,
            categoryName,
        );
        const { typeId, accountId } = await createBankAccount(
            page,
            token,
            suffix,
        );

        try {
            await openRecurringSettings(page);

            await page
                .getByRole("button", {
                    name: /Add Recurring|Aggiungi Ricorrente/,
                })
                .click();
            const modal = page.locator(".modal-inner");
            await expect(modal).toContainText(
                /Add Recurring Expense|Aggiungi Spesa Ricorrente/,
            );

            await modal
                .locator('input[placeholder="Description"]')
                .fill(description);
            await modal.locator('input[inputmode="decimal"]').fill("12,50");
            await modal
                .locator('[data-testid="category-select-trigger"]')
                .click();
            await page
                .locator(
                    `[data-testid="category-select-dropdown"] button:has-text("${categoryName}")`,
                )
                .first()
                .click();
            // The modal has two <select.inp> (linked_asset, then frequency);
            // the account/linked-asset select is the first.
            await modal
                .locator("select.inp")
                .first()
                .selectOption(String(accountId));
            await modal.locator('input[type="number"]').fill("31");
            await modal
                .locator('input[type="date"]')
                .first()
                .fill("2026-01-31");

            await Promise.all([
                page.waitForResponse(
                    (r) =>
                        r.request().method() === "POST" &&
                        r.url().includes("/fininzen/api/expenses/recurring/") &&
                        r.ok(),
                ),
                modal.locator("button.btn.btn-p").click(),
            ]);

            await expect(page.locator(`text=${description}`)).toBeVisible({
                timeout: 8000,
            });

            const row = page
                .locator(".card")
                .filter({ hasText: description })
                .first();
            await row.getByRole("button", { name: /Edit|Modifica/ }).click();
            await expect(
                modal.locator('input[placeholder="Description"]'),
            ).toHaveValue(description);
            await modal.locator('input[inputmode="decimal"]').fill("13,75");
            await modal.locator('input[type="number"]').fill("30");

            await Promise.all([
                page.waitForResponse(
                    (r) =>
                        r.request().method() === "PATCH" &&
                        r.url().includes("/fininzen/api/expenses/recurring/") &&
                        r.ok(),
                ),
                modal.locator("button.btn.btn-p").click(),
            ]);

            const listRes = await page.request.get(
                "/fininzen/api/expenses/recurring/",
                {
                    headers: { Authorization: `Bearer ${token}` },
                },
            );
            const recurrings = await listRes.json();
            const updated = (recurrings.results || recurrings).find(
                (r: { description: string }) => r.description === description,
            );
            expect(updated.amount).toBe("13.75");
            expect(updated.day_of_month).toBe(30);
            expect(updated.linked_asset).toBe(accountId);

            await Promise.all([
                page.waitForResponse(
                    (r) => r.url().includes("/disable/") && r.ok(),
                ),
                row.getByRole("button", { name: /Disable|Disabilita/ }).click(),
            ]);
            await expect(row).toContainText("DISABLED");

            await Promise.all([
                page.waitForResponse(
                    (r) => r.url().includes("/enable/") && r.ok(),
                ),
                row.getByRole("button", { name: /Enable|Abilita/ }).click(),
            ]);

            await row.getByRole("button", { name: /Delete|Elimina/ }).click();
            await Promise.all([
                page.waitForResponse(
                    (r) =>
                        r.request().method() === "DELETE" &&
                        r.url().includes("/fininzen/api/expenses/recurring/") &&
                        r.ok(),
                ),
                page.locator(".modal-inner button.btn.btn-r").click(),
            ]);
            await expect(page.locator(`text=${description}`)).toHaveCount(0);
        } finally {
            const recRes = await page.request.get(
                "/fininzen/api/expenses/recurring/",
                {
                    headers: { Authorization: `Bearer ${token}` },
                },
            );
            if (recRes.ok()) {
                const recurrings = await recRes.json();
                for (const rec of recurrings.results || recurrings) {
                    if (rec.description === description) {
                        await page.request.delete(
                            `/fininzen/api/expenses/recurring/${rec.id}/`,
                            {
                                headers: { Authorization: `Bearer ${token}` },
                            },
                        );
                    }
                }
            }
            await page.request.delete(
                `/fininzen/api/expenses/categories/${categoryId}/`,
                {
                    headers: { Authorization: `Bearer ${token}` },
                },
            );
            await page.request.delete(`/fininzen/api/portfolio/${accountId}/`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            await page.request.delete(
                `/fininzen/api/portfolio/investment-types/${typeId}/`,
                {
                    headers: { Authorization: `Bearer ${token}` },
                },
            );
        }
    });
});
