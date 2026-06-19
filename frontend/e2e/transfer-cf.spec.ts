import { test, expect, Page } from "@playwright/test";
import { loginAsTestUser } from "./helpers/auth";

const TEST_EMAIL = "playwright_expenses@test.com";
const TEST_PASS = "PlExp!888xyz";

const ACCOUNT_TYPE_NAME = "E2E Bank Type";
const ACCOUNT_A_NAME = "E2E Account Alpha";
const ACCOUNT_B_NAME = "E2E Account Beta";

async function getToken(page: Page): Promise<string> {
    const token = await page.evaluate(() =>
        localStorage.getItem("access_token"),
    );
    if (!token) throw new Error("No access_token in localStorage");
    return token;
}

async function cleanupOrphans(page: Page, token: string): Promise<void> {
    const headers = {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
    };

    const assetsRes = await page.request.get("/api/portfolio/", { headers });
    if (assetsRes.ok()) {
        const assets: { id: number; name: string }[] = await assetsRes.json();
        for (const a of assets.filter((a) =>
            [ACCOUNT_A_NAME, ACCOUNT_B_NAME].includes(a.name),
        )) {
            await page.request.delete(`/api/portfolio/${a.id}/`, { headers });
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
}

async function goToAllTransactions(page: Page): Promise<void> {
    // No reload needed — beforeEach already leaves us on a loaded Dashboard
    await page.click('button.nav-item:has-text("Cash Flow")');
    await expect(
        page.locator(
            'button.nav-item[aria-current="page"]:has-text("Cash Flow")',
        ),
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

test.describe("Transfer via Cash Flow form (K4.5)", () => {
    test.beforeEach(async ({ page }) => {
        await loginAsTestUser(page, TEST_EMAIL, TEST_PASS);
        await expect(page.locator(".app-net-worth")).toBeVisible({
            timeout: 15000,
        });
        const token = await getToken(page);
        await cleanupOrphans(page, token);
    });

    test("Transfer option appears in expense modal type toggle", async ({
        page,
    }) => {
        await page.click('button.nav-item:has-text("Cash Flow")');
        await page.waitForLoadState("networkidle");
        await page.click('[data-testid="expenses-add-fab"]');
        await expect(
            page.locator(".modal-inner").getByText(/New Expense|Nuova Spesa/),
        ).toBeVisible({ timeout: 5000 });
        await expect(
            page.locator(
                'button:has-text("Transfer"), button:has-text("Trasferimento")',
            ),
        ).toBeVisible({ timeout: 5000 });
    });

    test("golden path: create transfer via Cash Flow form", async ({
        page,
    }) => {
        test.setTimeout(30_000);
        const token = await getToken(page);
        const headers = {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
        };

        // Create a bank account investment type
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
            throw new Error(
                `investment-type create failed: ${await typeRes.text()}`,
            );
        const typeId = (await typeRes.json()).id;

        // Create two bank accounts
        const accARes = await page.request.post("/api/portfolio/", {
            headers,
            data: {
                name: ACCOUNT_A_NAME,
                investment_type: typeId,
                tracking_type: "MANUAL",
            },
        });
        if (!accARes.ok())
            throw new Error(`account A create failed: ${await accARes.text()}`);
        const accAId = (await accARes.json()).id;

        const accBRes = await page.request.post("/api/portfolio/", {
            headers,
            data: {
                name: ACCOUNT_B_NAME,
                investment_type: typeId,
                tracking_type: "MANUAL",
            },
        });
        if (!accBRes.ok())
            throw new Error(`account B create failed: ${await accBRes.text()}`);
        const accBId = (await accBRes.json()).id;

        // Reload so React's asset list includes the newly created accounts (it was fetched on page
        // load before the accounts existed — the transfer modal select would have no options)
        await page.reload();
        await page.waitForSelector(".app-net-worth", { timeout: 15000 });

        try {
            await goToAllTransactions(page);

            // Open expense modal
            await page.click('[data-testid="expenses-add-fab"]');
            await expect(
                page
                    .locator('[data-testid="transfer-from-account"]')
                    .or(
                        page.locator(
                            'button:has-text("Transfer"), button:has-text("Trasferimento")',
                        ),
                    )
                    .first(),
            ).toBeVisible({ timeout: 5000 });

            // Switch to Transfer type — scope to modal-inner; the All Transactions filter bar also has a
            // "Transfer" button (earlier in DOM) covered by the backdrop and never actionable
            await page
                .locator(".modal-inner")
                .getByRole("button", { name: /^(Transfer|Trasferimento)$/ })
                .click();
            await expect(
                page.locator('[data-testid="transfer-from-account"]'),
            ).toBeVisible({ timeout: 5000 });

            // Select from/to accounts
            await page.selectOption('[data-testid="transfer-from-account"]', {
                value: String(accAId),
            });
            await page.selectOption('[data-testid="transfer-to-account"]', {
                value: String(accBId),
            });

            // Enter amount
            await page.fill('[data-testid="transfer-amount"]', "42.50");

            // Submit
            await Promise.all([
                page.waitForResponse(
                    (r) =>
                        r.url().includes("/api/portfolio/transfer/") && r.ok(),
                ),
                page.click(
                    'button.btn-p:has-text("Transfer"), button.btn-p:has-text("Trasferisci")',
                ),
            ]);

            // Modal should close
            await expect(
                page.locator('[data-testid="transfer-from-account"]'),
            ).not.toBeVisible({ timeout: 5000 });

            // Verify transfer created via API — avoids slow UI navigation + cashflow re-fetch
            const cfRes = await page.request.get("/api/expenses/cashflow/", {
                headers,
                params: { types: "transfer", page_size: "200" },
            });
            expect(cfRes.ok()).toBe(true);
            const cfData = await cfRes.json();
            const cfItems: {
                from_account?: { id: number };
                to_account?: { id: number };
            }[] = Array.isArray(cfData) ? cfData : (cfData.results ?? []);
            const transferEntry = cfItems.find(
                (e) =>
                    e.from_account?.id === accAId &&
                    e.to_account?.id === accBId,
            );
            expect(transferEntry).toBeTruthy();
        } finally {
            await Promise.allSettled([
                safeDelete(page, `/api/portfolio/${accAId}/`, headers),
                safeDelete(page, `/api/portfolio/${accBId}/`, headers),
                safeDelete(
                    page,
                    `/api/portfolio/investment-types/${typeId}/`,
                    headers,
                ),
            ]);
        }
    });

    test("switching to transfer resets from/to fields", async ({ page }) => {
        await page.click('button.nav-item:has-text("Cash Flow")');
        await page.waitForLoadState("networkidle");
        await page.click('[data-testid="expenses-add-fab"]');

        // Switch to transfer
        await page.click(
            'button:has-text("Transfer"), button:has-text("Trasferimento")',
        );
        await expect(
            page.locator('[data-testid="transfer-from-account"]'),
        ).toBeVisible({ timeout: 5000 });

        // Switch back to expense — scope to modal-inner; page-level "Expenses" filter buttons exist behind
        // the backdrop and clicking at their coordinates triggers onClose instead of the type toggle
        await page
            .locator(".modal-inner")
            .getByRole("button", { name: /^(Expenses|Uscite)$/ })
            .click();
        await expect(
            page.locator('[data-testid="transfer-from-account"]'),
        ).not.toBeVisible({ timeout: 3000 });

        // Switch back to transfer — fields should be empty
        await page
            .locator(".modal-inner")
            .getByRole("button", { name: /^(Transfer|Trasferimento)$/ })
            .click();
        const fromVal = await page
            .locator('[data-testid="transfer-from-account"]')
            .inputValue();
        expect(fromVal).toBe("");
    });

    test("Accounts page no longer has transfer button", async ({ page }) => {
        await page.click('button.nav-item:has-text("Accounts")');
        await page.waitForLoadState("networkidle");
        await expect(
            page.locator(
                'button:has-text("Transfer"), button:has-text("Trasferisci")',
            ),
        ).not.toBeVisible({ timeout: 3000 });
    });
});
