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
        await page.waitForLoadState("networkidle");
    });

    test("add MANUAL asset appears in list", async ({ page }) => {
        const token = await getToken(page);
        const { id: typeId } = await createInvestmentType(page, token);

        // Reload so app fetches the newly created investment type into its state
        await page.reload();
        await page.waitForLoadState("networkidle");
        await page.click('nav a[href="/portfolio"]');
        await expect(page).toHaveURL(/\/portfolio$/);
        await page.waitForLoadState("networkidle");

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
        await page.waitForLoadState("networkidle");
        await page.click('nav a[href="/portfolio"]');
        await expect(page).toHaveURL(/\/portfolio$/);
        await page.waitForLoadState("networkidle");

        await expect(page.locator(`text=${assetName}`)).toBeVisible({
            timeout: 8000,
        });

        await deleteAsset(page, token, assetId);
        await deleteInvestmentType(page, token, typeId);
    });
});
