import { test, expect, Page } from "@playwright/test";
import { loginAsTestUser } from "./helpers/auth";

const TEST_EMAIL = "playwright_portfolio@test.com";
const TEST_PASS = "PlPrt!777xyz";

async function getToken(page: Page): Promise<string> {
    const token = await page.evaluate(() =>
        localStorage.getItem("access_token"),
    );
    if (!token) throw new Error("No access_token in localStorage");
    return token;
}

async function createInvestmentType(
    page: Page,
    token: string,
): Promise<{ id: number; name: string }> {
    const name = `E2E Type ${Date.now()}`;
    const res = await page.request.post(
        "/fininzen/api/portfolio/investment-types/",
        {
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
            },
            data: {
                name,
                color: "#4ade80",
                icon: "🧪",
                supports_ticker: false,
                is_bank_account: false,
            },
        },
    );
    if (!res.ok())
        throw new Error(
            `investment-type create failed: ${res.status()} — ${await res.text()}`,
        );
    const body = await res.json();
    return { id: body.id, name };
}

async function deleteInvestmentType(
    page: Page,
    token: string,
    id: number,
): Promise<void> {
    await page.request.delete(
        `/fininzen/api/portfolio/investment-types/${id}/`,
        {
            headers: { Authorization: `Bearer ${token}` },
        },
    );
}

async function deleteAsset(
    page: Page,
    token: string,
    id: number,
): Promise<void> {
    await page.request.delete(`/fininzen/api/portfolio/${id}/`, {
        headers: { Authorization: `Bearer ${token}` },
    });
}

test.describe("Portfolio CRUD", () => {
    test.describe.configure({ timeout: 15000 });

    test.beforeEach(async ({ page }) => {
        await loginAsTestUser(page, TEST_EMAIL, TEST_PASS);
        await expect(page.locator(".app-net-worth")).toBeVisible({
            timeout: 15000,
        });
        await page.click('nav a[href="/portfolio"]');
        await expect(page).toHaveURL(/\/portfolio$/);
        await expect(
            page.locator('[data-testid="speed-dial-main"]'),
        ).toBeVisible({ timeout: 10000 });
    });

    test("add MANUAL asset appears in list", async ({ page }) => {
        const token = await getToken(page);
        const { id: typeId } = await createInvestmentType(page, token);

        // Reload so app fetches the newly created investment type into its state
        await page.reload();
        await expect(page.locator(".app-net-worth")).toBeVisible({
            timeout: 15000,
        });
        await page.click('nav a[href="/portfolio"]');
        await expect(page).toHaveURL(/\/portfolio$/);
        await expect(
            page.locator('[data-testid="speed-dial-main"]'),
        ).toBeVisible({ timeout: 10000 });

        const assetName = `E2E Asset ${Date.now()}`;

        // Open add asset modal
        await page.click('[data-testid="speed-dial-main"]');
        await page.click('[data-testid="portfolio-fab-add-asset"]');
        await expect(
            page.locator('[role="dialog"]').getByText("New Asset"),
        ).toBeVisible({ timeout: 5000 });

        // Fill name (placeholder is "Name (e.g. iShares Core MSCI World)")
        await page.fill('input[placeholder*="Name"]', assetName);

        // Select by value — typeId is now in the dropdown since we reloaded
        await page.selectOption("select.inp", { value: String(typeId) });

        // Submit via modal button — :not(.btn-sm) excludes the header "+ Add" button
        await Promise.all([
            page.waitForResponse(
                (r) => r.url().includes("/fininzen/api/portfolio/") && r.ok(),
            ),
            page.click('[role="dialog"] button.btn.btn-p'),
        ]);

        // Asset visible in list
        await expect(page.locator(`text=${assetName}`)).toBeVisible({
            timeout: 8000,
        });

        // Cleanup: get asset id then delete
        const assetsRes = await page.request.get("/fininzen/api/portfolio/", {
            headers: { Authorization: `Bearer ${token}` },
        });
        const assetsBody = await assetsRes.json();
        const assets: { id: number; name: string }[] = Array.isArray(assetsBody)
            ? assetsBody
            : (assetsBody?.results ?? []);
        const created = assets.find((a) => a.name === assetName);
        if (created) await deleteAsset(page, token, created.id);
        await deleteInvestmentType(page, token, typeId);
    });

    test("add asset modal validates required fields", async ({ page }) => {
        const token = await getToken(page);
        const { id: typeId } = await createInvestmentType(page, token);

        // Open modal
        await page.click('[data-testid="speed-dial-main"]');
        await page.click('[data-testid="portfolio-fab-add-asset"]');
        await expect(
            page.locator('[role="dialog"]').getByText("New Asset"),
        ).toBeVisible({ timeout: 5000 });

        // Submit via modal button without filling anything
        await page.click('[role="dialog"] button.btn.btn-p');

        await expect(page.locator("text=Name is required")).toBeVisible({
            timeout: 3000,
        });

        await page.click('button:has-text("Cancel")');
        await deleteInvestmentType(page, token, typeId);
    });

    // Regression: the transaction sheet used to disable Save/Update whenever
    // shares, date or price were empty, which meant no click, no submit and no
    // explanation. Editing a transaction and changing its date clears the price
    // (the historical-price autofill refills it, but only when the asset has a
    // ticker), so the button silently went dead with nothing on screen saying
    // why. It must stay clickable and name the missing field instead.
    test("transaction sheet reports the missing price instead of going inert", async ({
        page,
    }) => {
        const token = await getToken(page);
        const { id: typeId } = await createInvestmentType(page, token);

        // AUTO tracking (the sheet's asset picker only lists AUTO assets) but no
        // ticker, so the price autofill never runs and the field stays empty.
        const assetName = `E2E TxAsset ${Date.now()}`;
        const res = await page.request.post("/fininzen/api/portfolio/", {
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
            },
            data: {
                name: assetName,
                investment_type: typeId,
                tracking_type: "AUTO",
                currency: "EUR",
            },
        });
        const { id: assetId } = await res.json();

        await page.reload();
        await expect(page.locator(".app-net-worth")).toBeVisible({
            timeout: 15000,
        });
        await page.click('nav a[href="/portfolio"]');
        await expect(page).toHaveURL(/\/portfolio$/);
        await expect(
            page.locator('[data-testid="speed-dial-main"]'),
        ).toBeVisible({ timeout: 10000 });

        await page.click('[data-testid="speed-dial-main"]');
        await page.click('[data-testid="portfolio-fab-add-transaction"]');

        await page.click('[data-testid="addtx-asset"]');
        await page.click(`[data-testid="addtx-asset-option-${assetId}"]`);

        // Date is prefilled with today; supply shares only, leaving the price empty.
        await page.fill('[data-testid="addtx-shares"]', "3");

        const submit = page.locator('[data-testid="addtx-submit"]');
        await expect(submit).toBeEnabled();
        await submit.click();

        await expect(page.locator('[data-testid="addtx-error"]')).toHaveText(
            "Enter the price per share",
            { timeout: 5000 },
        );

        await deleteAsset(page, token, assetId);
        await deleteInvestmentType(page, token, typeId);
    });

    test("transaction sheet submits once on rapid clicks and unlocks after failure", async ({
        page,
    }) => {
        const token = await getToken(page);
        const { id: typeId } = await createInvestmentType(page, token);
        const assetName = `E2E SingleFlight ${Date.now()}`;
        const assetResponse = await page.request.post(
            "/fininzen/api/portfolio/",
            {
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
                data: {
                    name: assetName,
                    investment_type: typeId,
                    tracking_type: "AUTO",
                    currency: "EUR",
                },
            },
        );
        const { id: assetId } = await assetResponse.json();

        await page.reload();
        await expect(page.locator(".app-net-worth")).toBeVisible({
            timeout: 15000,
        });
        await page.click('nav a[href="/portfolio"]');
        await expect(page).toHaveURL(/\/portfolio$/);
        await expect(
            page.locator('[data-testid="speed-dial-main"]'),
        ).toBeVisible({ timeout: 10000 });

        await page.click('[data-testid="speed-dial-main"]');
        await page.click('[data-testid="portfolio-fab-add-transaction"]');
        await page.click('[data-testid="addtx-asset"]');
        await page.click(`[data-testid="addtx-asset-option-${assetId}"]`);
        await page.fill('[data-testid="addtx-shares"]', "3");
        await page.fill('[data-testid="addtx-price"]', "50");
        const cashAmount = page.locator('[data-testid="addtx-cash-amount"]');
        await expect(cashAmount).toHaveValue("150.00");
        await cashAmount.fill("149.90");
        await expect(
            page.locator('[data-testid="addtx-cash-variance"]'),
        ).toBeVisible();

        let releaseFirstRequest = () => {};
        const firstRequestCanFinish = new Promise<void>((resolve) => {
            releaseFirstRequest = resolve;
        });
        let postCount = 0;
        let failNextRequest = true;
        const transactionUrl = `**/fininzen/api/portfolio/${assetId}/transactions/`;
        await page.route(transactionUrl, async (route) => {
            if (route.request().method() !== "POST") {
                await route.continue();
                return;
            }
            postCount += 1;
            if (failNextRequest) {
                await firstRequestCanFinish;
                failNextRequest = false;
                await route.fulfill({
                    status: 500,
                    contentType: "application/json",
                    body: JSON.stringify({ error: "temporary failure" }),
                });
                return;
            }
            await route.continue();
        });

        const submit = page.locator('[data-testid="addtx-submit"]');
        await submit.evaluate((button: HTMLButtonElement) => {
            button.click();
            button.click();
        });

        await expect(submit).toBeDisabled();
        // Both click handlers ran synchronously; allow their network events to
        // reach Playwright while the first response remains deliberately held.
        await page.waitForTimeout(200);
        expect(postCount).toBe(1);

        releaseFirstRequest();
        await expect(page.locator('[data-testid="addtx-error"]')).toBeVisible();
        await expect(submit).toBeEnabled();

        const retryResponsePromise = page.waitForResponse(
            (response) =>
                response
                    .url()
                    .endsWith(
                        `/fininzen/api/portfolio/${assetId}/transactions/`,
                    ) && response.request().method() === "POST",
        );
        await submit.evaluate((button: HTMLButtonElement) => button.click());
        await expect(submit).toBeDisabled();
        const retryResponse = await retryResponsePromise;
        expect(retryResponse.status()).toBe(201);
        expect(postCount).toBe(2);

        const transactionsResponse = await page.request.get(
            `/fininzen/api/portfolio/${assetId}/transactions/`,
            { headers: { Authorization: `Bearer ${token}` } },
        );
        expect(transactionsResponse.ok()).toBeTruthy();
        const transactions = await transactionsResponse.json();
        expect(transactions).toHaveLength(1);
        expect(transactions[0].cash_amount).toBe("149.90");

        await deleteAsset(page, token, assetId);
        await deleteInvestmentType(page, token, typeId);
    });

    test("existing asset visible in investments list", async ({ page }) => {
        const token = await getToken(page);
        const { id: typeId } = await createInvestmentType(page, token);

        // Create asset via API
        const assetName = `E2E Existing ${Date.now()}`;
        const res = await page.request.post("/fininzen/api/portfolio/", {
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
            },
            data: {
                name: assetName,
                investment_type: typeId,
                tracking_type: "MANUAL",
                currency: "EUR",
            },
        });
        const { id: assetId } = await res.json();

        // Reload — asset should appear
        await page.reload();
        await expect(page.locator(".app-net-worth")).toBeVisible({
            timeout: 15000,
        });
        await page.click('nav a[href="/portfolio"]');
        await expect(page).toHaveURL(/\/portfolio$/);
        await expect(
            page.locator('[data-testid="speed-dial-main"]'),
        ).toBeVisible({ timeout: 10000 });

        await expect(page.locator(`text=${assetName}`)).toBeVisible({
            timeout: 8000,
        });

        await deleteAsset(page, token, assetId);
        await deleteInvestmentType(page, token, typeId);
    });
});
