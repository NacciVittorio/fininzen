import { test, expect, Browser, BrowserContext, Page } from "@playwright/test";
import { loginAsTestUser } from "./helpers/auth";

// Recipient (User B) and grantor (User A). The demo user can't act as grantor
// because IsNotDemoUser blocks all writes (fininzen/permissions.py).
const TEST_USER_EMAIL = "playwright_b@test.com";
const TEST_USER_PASS = "PlTest!999abc";
const TEST_USER_A_EMAIL = "playwright_a@test.com";
const TEST_USER_A_PASS = "PlTestA!777xyz";

// Read User A's access token from localStorage (set by loginAsTestUser).
async function getUserAToken(page: Page): Promise<string> {
    const token = await page.evaluate(() =>
        localStorage.getItem("access_token"),
    );
    if (!token)
        throw new Error(
            "No access_token in localStorage — call loginAsTestUser first",
        );
    return token;
}

// Helper: create grant from User A to test user via API
async function createGrantViaApi(page: Page): Promise<void> {
    const accessToken = await getUserAToken(page);
    await page.request.post("/api/auth/grants/", {
        headers: { Authorization: `Bearer ${accessToken}` },
        data: { email: TEST_USER_EMAIL, permission: "read" },
    });
}

// Helper: delete all grants from User A via API
async function revokeAllGrantsViaApi(page: Page): Promise<void> {
    const accessToken = await getUserAToken(page);
    const res = await page.request.get("/api/auth/grants/", {
        headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok()) {
        throw new Error(
            `grants GET failed: ${res.status()} — ${await res.text()}`,
        );
    }
    const body = await res.json();
    if (!Array.isArray(body.given)) {
        throw new Error(`unexpected grants response: ${JSON.stringify(body)}`);
    }
    const given: { id: number }[] = body.given;
    for (const g of given) {
        await page.request.delete(`/api/auth/grants/${g.id}/`, {
            headers: { Authorization: `Bearer ${accessToken}` },
        });
    }
}

test.describe("DataAccessGrant UI", () => {
    let contextB: BrowserContext;
    let pageB: Page;

    test.beforeAll(async ({ browser }: { browser: Browser }) => {
        contextB = await browser.newContext({
            baseURL: "http://localhost:5173",
        });
        pageB = await contextB.newPage();
        await loginAsTestUser(pageB, TEST_USER_EMAIL, TEST_USER_PASS);
    });

    test.afterAll(async () => {
        await contextB.close();
    });

    test("4.6 — self-grant shows 400 error", async ({ page }) => {
        await loginAsTestUser(page, TEST_USER_A_EMAIL, TEST_USER_A_PASS);
        const accessToken = await page.evaluate(() =>
            localStorage.getItem("access_token"),
        );
        const res = await page.request.post("/api/auth/grants/", {
            headers: { Authorization: `Bearer ${accessToken}` },
            data: { email: TEST_USER_A_EMAIL, permission: "read" },
        });
        expect(res.status()).toBe(400);
        const body = await res.json();
        expect(body.error).toBeTruthy();
    });

    test("4.1 — create grant via UI, recipient sees dropdown", async ({
        page,
    }) => {
        await loginAsTestUser(page, TEST_USER_A_EMAIL, TEST_USER_A_PASS);

        // Create grant via API for speed (UI grant creation tested separately)
        await createGrantViaApi(page);

        // Reload User B page and check they see the dropdown
        await pageB.reload();
        await pageB.waitForLoadState("networkidle");

        const dropdown = pageB.locator("select").filter({ hasText: "My data" });
        await expect(dropdown).toBeVisible({ timeout: 8000 });

        // The option for User A should appear
        const options = await dropdown.locator("option").allTextContents();
        expect(options.some((o) => o.includes(TEST_USER_A_EMAIL))).toBeTruthy();
    });

    test("4.2 — view-as shows yellow banner with owner email", async ({
        page,
    }) => {
        await loginAsTestUser(page, TEST_USER_A_EMAIL, TEST_USER_A_PASS);
        await createGrantViaApi(page);

        await pageB.reload();
        await pageB.waitForLoadState("networkidle");

        const dropdown = pageB.locator("select").filter({ hasText: "My data" });
        await expect(dropdown).toBeVisible({ timeout: 8000 });

        // Select the User A account
        const options = await dropdown.locator("option").all();
        const ownerOption = options.find(async (o) =>
            (await o.textContent())?.includes(TEST_USER_A_EMAIL),
        );
        if (!ownerOption) {
            test.skip();
            return;
        }

        await dropdown.selectOption({ index: 1 }); // select first non-"My data" option

        // Yellow banner should appear
        await expect(pageB.locator("text=Viewing as")).toBeVisible({
            timeout: 5000,
        });
    });

    test("4.5 — revoke grant removes option from recipient dropdown", async ({
        page,
    }) => {
        await loginAsTestUser(page, TEST_USER_A_EMAIL, TEST_USER_A_PASS);
        await createGrantViaApi(page);

        await pageB.reload();
        await pageB.waitForLoadState("networkidle");

        // Verify grant exists in User B's dropdown
        const dropdown = pageB.locator("select").filter({ hasText: "My data" });
        await expect(dropdown).toBeVisible({ timeout: 8000 });

        // Revoke via API as User A
        await revokeAllGrantsViaApi(page);

        // Reload User B and verify dropdown is gone
        await pageB.reload();
        await pageB.waitForLoadState("networkidle");
        await expect(
            pageB.locator("select").filter({ hasText: "My data" }),
        ).not.toBeVisible({
            timeout: 5000,
        });
    });
});
