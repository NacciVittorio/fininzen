import { Page } from "@playwright/test";

// HIGH-21: the refresh token is an httpOnly cookie set by the auth endpoints.
// page.request shares the browser context's cookie jar, so POSTing the auth
// endpoint plants the cookie; we set the `fn_session` boot hint and reload, and
// the app silently refreshes (cookie → in-memory access token) on its first call.
//
// `access_token` is also stashed in localStorage purely for the SPECS to read
// back as a Bearer header on direct page.request seeding calls. The APP never
// reads it (its access token lives in memory only); this is a test-harness
// convenience, not part of the runtime auth model.

export async function loginAsDemo(page: Page): Promise<void> {
    await page.goto("/");
    const res = await page.request.post("/api/auth/demo/");
    if (!res.ok()) {
        throw new Error(`loginAsDemo: demo endpoint returned ${res.status()}`);
    }
    const { access } = await res.json();
    await page.evaluate((seedToken: string) => {
        localStorage.setItem("fn_session", "1");
        localStorage.setItem("is_demo", "true");
        localStorage.setItem("access_token", seedToken);
    }, access ?? "");
    await page.reload();
    await page.waitForSelector(".app-net-worth", { timeout: 15000 });
}

export async function loginAsTestUser(
    page: Page,
    email = "playwright_b@test.com",
    password = "PlTest!999abc",
): Promise<void> {
    await page.goto("/");
    // register — ignore 400 if already exists
    await page.request.post("/api/auth/register/", {
        data: { email, password, password2: password },
    });
    const res = await page.request.post("/api/auth/token/", {
        data: { username: email, password },
    });
    if (!res.ok()) {
        const body = await res.text();
        throw new Error(
            `loginAsTestUser: token endpoint returned ${res.status()} for ${email} — ${body}`,
        );
    }
    const { access } = await res.json();
    await page.evaluate((seedToken: string) => {
        localStorage.setItem("fn_session", "1");
        localStorage.setItem("access_token", seedToken);
    }, access ?? "");
    await page.reload();
    // Wait for app to be usable — networkidle waits for all background fetches
    // which makes each beforeEach expensive; .app-net-worth is sufficient
    await page.waitForSelector(".app-net-worth", { timeout: 15000 });
}
