import { test, expect, Page } from "@playwright/test";
import { loginAsTestUser } from "./helpers/auth";

const TEST_EMAIL = "playwright_expenses@test.com";
const TEST_PASS = "PlExp!888xyz";
const CAT_NAME = "E2E Import Category";
const ACCOUNT_TYPE_NAME = "E2E Import Bank Type";
const ACCOUNT_NAME = "E2E Import Bank";

async function getToken(page: Page): Promise<string> {
    const token = await page.evaluate(() =>
        localStorage.getItem("access_token"),
    );
    if (!token) throw new Error("No access_token in localStorage");
    return token;
}

async function createCategory(page: Page, token: string): Promise<number> {
    const res = await page.request.post("/api/expenses/categories/", {
        headers: { Authorization: `Bearer ${token}` },
        data: {
            name: CAT_NAME,
            color: "#4f7fff",
            icon: "🧪",
            category_type: "expense",
        },
    });
    if (!res.ok()) throw new Error(`category create failed: ${res.status()}`);
    const body = await res.json();
    return body.id;
}

async function createBankAccount(
    page: Page,
    token: string,
): Promise<{ typeId: number; accountId: number }> {
    const headers = {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
    };
    const typeRes = await page.request.post(
        "/api/portfolio/investment-types/",
        {
            headers,
            data: {
                name: ACCOUNT_TYPE_NAME,
                color: "#4ade80",
                icon: "🏦",
                supports_ticker: false,
                is_bank_account: true,
            },
        },
    );
    if (!typeRes.ok())
        throw new Error(`investment-type create failed: ${typeRes.status()}`);
    const typeId = (await typeRes.json()).id;
    const accRes = await page.request.post("/api/portfolio/", {
        headers,
        data: {
            name: ACCOUNT_NAME,
            investment_type: typeId,
            tracking_type: "MANUAL",
        },
    });
    if (!accRes.ok())
        throw new Error(`bank account create failed: ${accRes.status()}`);
    return { typeId, accountId: (await accRes.json()).id };
}

async function cleanupBankAccount(
    page: Page,
    token: string,
    typeId: number,
    accountId: number,
): Promise<void> {
    const headers = { Authorization: `Bearer ${token}` };
    await page.request.delete(`/api/portfolio/${accountId}/`, { headers });
    await page.request.delete(`/api/portfolio/investment-types/${typeId}/`, {
        headers,
    });
}

async function deleteCategory(
    page: Page,
    token: string,
    id: number,
): Promise<void> {
    await page.request.delete(`/api/expenses/categories/${id}/`, {
        headers: { Authorization: `Bearer ${token}` },
    });
}

async function deleteExpenseByDesc(
    page: Page,
    token: string,
    desc: string,
): Promise<void> {
    const res = await page.request.get("/api/expenses/", {
        headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    const items = Array.isArray(data) ? data : (data.results ?? []);
    for (const exp of items) {
        if (exp.description === desc) {
            await page.request.delete(`/api/expenses/${exp.id}/`, {
                headers: { Authorization: `Bearer ${token}` },
            });
        }
    }
}

function categoryTrigger(page: Page, index = 0) {
    return page.locator('[data-testid="category-select-trigger"]').nth(index);
}

function categoryDropdown(page: Page) {
    return page.locator('[data-testid="category-select-dropdown"]');
}

async function goToSettings(page: Page): Promise<void> {
    await page.click('button.nav-item:has-text("Settings")');
    await expect(
        page.locator('[data-testid="settings-root-data"]'),
    ).toBeVisible({ timeout: 5000 });
}

async function openImportSection(page: Page): Promise<void> {
    // Import lives in the Data/Dati drill-down page.
    const row = page.locator('[data-testid="settings-root-data"]');
    if (await row.isVisible().catch(() => false)) {
        await row.click();
        await page.waitForTimeout(300);
    }
    await expect(
        page
            .locator("text=Import from CSV")
            .or(page.locator("text=Importa da CSV")),
    ).toBeVisible({ timeout: 5000 });
}

const CSV_CONTENT = `date;description;amount;account
2026-04-10;E2E import pizza;-15.00;${ACCOUNT_NAME}
2026-04-11;E2E import coffee;-3.50;${ACCOUNT_NAME}
2026-04-12;Income ignored;+100.00;${ACCOUNT_NAME}
`;

test.describe("Settings CSV import", () => {
    test.beforeEach(async ({ page }) => {
        await loginAsTestUser(page, TEST_EMAIL, TEST_PASS);
        await expect(page.locator(".app-net-worth")).toBeVisible({
            timeout: 15000,
        });
    });

    test("CSV import with CategorySelect assigns category to imported rows", async ({
        page,
    }) => {
        test.setTimeout(30_000);
        const token = await getToken(page);
        const headers = { Authorization: `Bearer ${token}` };

        // Cleanup leftovers from previous failed runs (expenses + stale categories + stale bank account/type)
        await deleteExpenseByDesc(page, token, "E2E import pizza");
        await deleteExpenseByDesc(page, token, "E2E import coffee");
        await deleteExpenseByDesc(page, token, "Income ignored");
        const catsRes = await page.request.get("/api/expenses/categories/", {
            headers,
        });
        if (catsRes.ok()) {
            const catsData = await catsRes.json();
            const existing: { id: number; name: string }[] = Array.isArray(
                catsData,
            )
                ? catsData
                : (catsData.results ?? []);
            for (const c of existing.filter((c) => c.name === CAT_NAME)) {
                await page.request.delete(`/api/expenses/categories/${c.id}/`, {
                    headers,
                });
            }
        }
        const accsRes = await page.request.get("/api/portfolio/", { headers });
        if (accsRes.ok()) {
            const accs: { id: number; name: string }[] = await accsRes.json();
            for (const a of accs.filter((a) => a.name === ACCOUNT_NAME)) {
                await page.request.delete(`/api/portfolio/${a.id}/`, {
                    headers,
                });
            }
        }
        const typesRes = await page.request.get(
            "/api/portfolio/investment-types/",
            { headers },
        );
        if (typesRes.ok()) {
            const types: { id: number; name: string }[] = await typesRes.json();
            for (const t of types.filter((t) => t.name === ACCOUNT_TYPE_NAME)) {
                await page.request.delete(
                    `/api/portfolio/investment-types/${t.id}/`,
                    { headers },
                );
            }
        }

        const catId = await createCategory(page, token);
        const { typeId, accountId } = await createBankAccount(page, token);

        // Reload so React's category + bank account lists include the newly created entries
        await page.reload();
        await expect(page.locator(".app-net-worth")).toBeVisible({
            timeout: 15000,
        });

        await goToSettings(page);
        await openImportSection(page);

        // Upload CSV
        const csvBuffer = Buffer.from(CSV_CONTENT, "utf-8");
        await page.locator('input[type="file"][accept=".csv"]').setInputFiles({
            name: "test.csv",
            mimeType: "text/csv",
            buffer: csvBuffer,
        });

        // Wait for parsed state (column mapping card appears)
        await expect(
            page
                .locator("text=Column Mapping")
                .or(page.locator("text=Mapping colonne")),
        ).toBeVisible({ timeout: 5000 });

        // Map Finnet fields to CSV column headers. The schema order is
        // [type, date, description, amount, category_name, linked_asset_name, is_verified],
        // so nth(N) targets the Nth field, and the option values are CSV header names.
        const selects = page.locator(".card select.inp");
        await selects.nth(1).selectOption("date");
        await selects.nth(2).selectOption("description");
        await selects.nth(3).selectOption("amount");
        await selects.nth(5).selectOption("account");

        // Select expense fallback category via CategorySelect
        await categoryTrigger(page, 0).click();
        await categoryDropdown(page)
            .locator(`button:has-text("${CAT_NAME}")`)
            .first()
            .click();

        // Verify category is selected (trigger shows category name)
        await expect(categoryTrigger(page, 0)).toContainText(CAT_NAME);

        // Wait for preview card and click import — use exact match to avoid matching category trigger
        const importBtn = page
            .getByRole("button", { name: "Import", exact: true })
            .or(page.getByRole("button", { name: "Importa", exact: true }));
        await expect(importBtn).toBeVisible({ timeout: 3000 });
        await Promise.all([
            page.waitForResponse(
                (r) => r.url().includes("/api/expenses/import-csv/") && r.ok(),
            ),
            importBtn.click(),
        ]);

        // Verify import result shows imported count — "2 rows imported" or Italian equivalent
        await expect(
            page
                .locator("text=rows imported")
                .or(page.locator("text=righe importate")),
        ).toBeVisible({ timeout: 5000 });

        // Verify via API that imported expenses have the correct category
        const expsRes = await page.request.get("/api/expenses/", { headers });
        const expsData = await expsRes.json();
        const items = Array.isArray(expsData)
            ? expsData
            : (expsData.results ?? []);
        const pizza = items.find(
            (e: { description: string }) =>
                e.description === "E2E import pizza",
        );
        const coffee = items.find(
            (e: { description: string }) =>
                e.description === "E2E import coffee",
        );
        expect(pizza?.category).toBe(catId);
        expect(coffee?.category).toBe(catId);

        // Cleanup
        await deleteExpenseByDesc(page, token, "E2E import pizza");
        await deleteExpenseByDesc(page, token, "E2E import coffee");
        await deleteExpenseByDesc(page, token, "Income ignored");
        await deleteCategory(page, token, catId);
        await cleanupBankAccount(page, token, typeId, accountId);
    });

    test("CategorySelect in import mapper resets when cleared", async ({
        page,
    }) => {
        test.setTimeout(30_000);
        const token = await getToken(page);
        const catId = await createCategory(page, token);
        await page.reload();
        await expect(page.locator(".app-net-worth")).toBeVisible({
            timeout: 15000,
        });

        await goToSettings(page);
        await openImportSection(page);

        // Upload CSV to show the column mapping card
        const csvBuffer = Buffer.from(CSV_CONTENT, "utf-8");
        await page.locator('input[type="file"][accept=".csv"]').setInputFiles({
            name: "test.csv",
            mimeType: "text/csv",
            buffer: csvBuffer,
        });
        await expect(
            page
                .locator("text=Column Mapping")
                .or(page.locator("text=Mapping colonne")),
        ).toBeVisible({ timeout: 5000 });

        // Select then clear
        await categoryTrigger(page, 0).click();
        await expect(
            categoryDropdown(page)
                .locator(`button:has-text("${CAT_NAME}")`)
                .first(),
        ).toBeVisible({ timeout: 5000 });
        await categoryDropdown(page)
            .locator(`button:has-text("${CAT_NAME}")`)
            .first()
            .click();
        await expect(categoryTrigger(page, 0)).toContainText(CAT_NAME);

        // Clear by clicking placeholder option (first button in dropdown)
        await categoryTrigger(page, 0).click();
        await categoryDropdown(page).locator("button").first().click();

        // Trigger should show placeholder again (not the category name)
        await expect(categoryTrigger(page, 0)).not.toContainText(CAT_NAME);

        await deleteCategory(page, token, catId);
    });
});
