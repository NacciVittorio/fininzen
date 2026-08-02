import { readFileSync } from "node:fs";
import { join } from "node:path";

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

// ReleaseNotesBar shows once per release and, being anchored to the bottom edge,
// covers whatever sits at the foot of the page — it intercepted the Settings
// sign-out button. A fresh browser context starts with no dismissal, so it would
// greet every spec. Seeding the key the bar reads makes each spec start as a user
// who has already seen this release, which is the state the specs mean to test.
// A spec that wants the bar can clear this key.
//
// The value must match what next.config.ts bakes into NEXT_PUBLIC_APP_VERSION;
// both read the VERSION file, so they cannot drift.
const APP_VERSION = readFileSync(
    join(__dirname, "..", "..", "..", "VERSION"),
    "utf8",
).trim();

async function markReleaseSeen(page: Page): Promise<void> {
    await page.evaluate((version: string) => {
        localStorage.setItem("lastSeenRelease", version);
    }, APP_VERSION);
}

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
    // The demo account cannot PATCH its profile (IsNotDemoUser), so localStorage
    // is the only thing that can silence the bar for it.
    await markReleaseSeen(page);
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
        data: {
            email,
            password,
            password2: password,
            terms_accepted: true,
        },
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
    // Registration stamps last_seen_release, but this user usually already exists
    // (the register call above 400s), and one created before the field shipped has
    // it empty — so seed here too rather than rely on the account being fresh.
    await markReleaseSeen(page);
    await page.goto("/dashboard");
    await page.waitForSelector(".app-net-worth", { timeout: 15000 });
}
