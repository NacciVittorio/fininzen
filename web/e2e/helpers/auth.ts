import { Page } from "@playwright/test";

// HIGH-21: the refresh token is an httpOnly cookie set by the auth endpoints.
// page.request shares the browser context's cookie jar, so POSTing the auth
// endpoint plants the cookie; we set the `fn_session` boot hint, then navigate
// into the app, which silently refreshes (cookie → in-memory access token) on
// its first call.
//
// Under Next the API lives behind the `/fininzen/api/*` prefix (Caddy/Next strip
// it before Django), and the active view is a real route — so after seeding we
// navigate to `/dashboard` and wait for `.app-net-worth`.
//
// `access_token` is stashed in localStorage purely for the SPECS to read back as
// a Bearer header on direct page.request seeding calls. The APP never reads it
// (its access token lives in memory only); this is a test-harness convenience.

const API = "/fininzen/api";

export async function loginAsDemo(page: Page): Promise<void> {
    await page.goto("/login");
    const res = await page.request.post(`${API}/auth/demo/`);
    if (!res.ok()) {
        throw new Error(`loginAsDemo: demo endpoint returned ${res.status()}`);
    }
    const { access } = await res.json();
    await page.evaluate((seedToken: string) => {
        localStorage.setItem("fn_session", "1");
        localStorage.setItem("is_demo", "true");
        localStorage.setItem("access_token", seedToken);
    }, access ?? "");
    await page.goto("/dashboard");
    await page.waitForSelector(".app-net-worth", { timeout: 15000 });
}

export async function loginAsTestUser(
    page: Page,
    email = "playwright_b@test.com",
    password = "PlTest!999abc",
): Promise<void> {
    await page.goto("/login");
    // register — ignore 400 if already exists
    await page.request.post(`${API}/auth/register/`, {
        data: { email, password, password2: password },
    });
    const res = await page.request.post(`${API}/auth/token/`, {
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
    await page.goto("/dashboard");
    await page.waitForSelector(".app-net-worth", { timeout: 15000 });
}
