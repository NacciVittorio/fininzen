import {
    test,
    expect,
    Browser,
    BrowserContext,
    Page,
    Locator,
} from "@playwright/test";
import { loginAsTestUser } from "./helpers/auth";

// Split feature E2E (piano sez. 8.2). Mirrors data-access-grant.spec.ts for the
// two-user/two-BrowserContext partner-link flow, and recurring.spec.ts/
// cashflow.spec.ts for API-seeded setup (categories/bank accounts) + UI-driven
// assertions. `test.describe.serial` because scenarios b)-f) build on the
// group/contacts/expense state scenario a)/b) establish — a failure early on
// makes the rest meaningless, so the block stops rather than cascading.
//
// User emails are timestamped (unlike the rest of the e2e suite, which reuses
// fixed accounts): a SplitPartnerLink can only ever transition PENDING once
// (`send_partner_request` auto-accepts or returns the existing link on any
// later re-request, see splitting/services.py), so a fixed pair of users would
// only exercise the "pending → accept" transition on the very first run ever
// and silently skip it on every repeat while iterating locally.
const RUN_ID = Date.now();
const EMAIL_A = `playwright_split_a_${RUN_ID}@test.com`;
const PASS_A = "PlSplitA!123xyz";
const EMAIL_B = `playwright_split_b_${RUN_ID}@test.com`;
const PASS_B = "PlSplitB!456xyz";

async function getToken(page: Page): Promise<string> {
    const token = await page.evaluate(() =>
        localStorage.getItem("access_token"),
    );
    if (!token) throw new Error("No access_token in localStorage");
    return token;
}

async function apiGet<T = unknown>(
    page: Page,
    token: string,
    path: string,
): Promise<T> {
    const res = await page.request.get(`/fininzen/api${path}`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok()) {
        throw new Error(
            `GET ${path} failed: ${res.status()} — ${await res.text()}`,
        );
    }
    return res.json();
}

async function apiPost<T = unknown>(
    page: Page,
    token: string,
    path: string,
    data: unknown,
): Promise<T> {
    const res = await page.request.post(`/fininzen/api${path}`, {
        headers: { Authorization: `Bearer ${token}` },
        data,
    });
    if (!res.ok()) {
        throw new Error(
            `POST ${path} failed: ${res.status()} — ${await res.text()}`,
        );
    }
    return res.json();
}

// Waits for a specific successful XHR alongside the UI action that triggers
// it — same pattern as recurring.spec.ts/cashflow.spec.ts, never
// `waitForLoadState("networkidle")` (the dev server never quiets down).
async function waitForApi(
    page: Page,
    method: string,
    urlIncludes: string,
    action: () => Promise<void>,
): Promise<void> {
    await Promise.all([
        page.waitForResponse(
            (r) =>
                r.request().method() === method &&
                r.url().includes(urlIncludes) &&
                r.ok(),
        ),
        action(),
    ]);
}

// Last "-<digits>" segment of a `data-testid` (every Split row is
// `<prefix>-<numeric id>`, e.g. "split-group-row-42").
async function idFromTestId(locator: Locator): Promise<number> {
    const testId = await locator.getAttribute("data-testid");
    const raw = testId?.split("-").pop();
    const id = Number(raw);
    if (!raw || Number.isNaN(id)) {
        throw new Error(`could not parse id from data-testid "${testId}"`);
    }
    return id;
}

// The computed-share preview is always the LAST <span> in a participant row
// (dot, label, then the amount — the payer radio's caption is a bare text
// node, and the optional raw-input is an <input>, not a <span>), whatever the
// split method. Currency formatting can use a non-breaking/narrow space
// around "€"; strip all whitespace-ish characters before matching digits.
async function computedShareText(row: Locator): Promise<string> {
    const text = await row.locator("span").last().innerText();
    return text.replace(/[\s  ]/g, "");
}

async function todayIso(): Promise<string> {
    return new Date().toISOString().slice(0, 10);
}

// AmountCalculator's operator bar (shown while the amount field has focus on
// a narrow viewport) tears down on blur and reflows the BottomSheet's bottom
// padding — a click fired immediately after `.fill()` on the amount field can
// land mid-reflow and be swallowed. expenses.spec.ts works around this by
// reordering fields so something else is filled after Amount; here we just
// blur it explicitly (Tab moves focus to the next field in the sheet) before
// any subsequent click, everywhere the split expense form's amount is filled.
async function blurAmountField(page: Page): Promise<void> {
    await page.keyboard.press("Tab");
}

async function gotoSplit(page: Page): Promise<void> {
    await page.click('nav a[href="/split"]');
    await expect(page).toHaveURL(/\/split$/);
    await expect(page.locator('[data-testid="split-tab-groups"]')).toBeVisible({
        timeout: 10000,
    });
}

async function gotoSplitContacts(page: Page): Promise<void> {
    await gotoSplit(page);
    await page.click('[data-testid="split-tab-contacts"]');
    await expect(
        page.locator('[data-testid="split-partner-request-email"]'),
    ).toBeVisible({ timeout: 8000 });
}

test.describe.serial("Split feature", () => {
    let contextB: BrowserContext;
    let pageB: Page;
    let tokenA = "";
    let tokenB = "";

    // Populated by test (a).
    let contactBId = 0; // A's SplitContact row pointing at linked user B
    let localContactId = 0; // A's local (no-account) contact
    const localContactName = `E2E Split Local ${RUN_ID}`;

    // Populated by test (b).
    let groupId = 0;
    let userAId = 0;
    let userBId = 0;
    const groupName = `E2E Split Group ${RUN_ID}`;
    const equalExpenseDesc = `E2E split equal ${RUN_ID}`;

    // Populated by test (e) — read back by test (g).
    let settleNote = "";
    // Populated by test (f) — read back by test (h).
    let linkedExpenseDesc = "";

    test.beforeAll(async ({ browser }: { browser: Browser }) => {
        contextB = await browser.newContext({
            baseURL: "http://localhost:3000",
        });
        pageB = await contextB.newPage();
        await loginAsTestUser(pageB, EMAIL_B, PASS_B);
        tokenB = await getToken(pageB);
    });

    test.afterAll(async () => {
        await contextB.close();
    });

    test("a) partner link: A sends a request, B sees it pending and accepts, both end up with a mutual contact", async ({
        page,
    }) => {
        test.setTimeout(45000);
        await loginAsTestUser(page, EMAIL_A, PASS_A);
        tokenA = await getToken(page);

        await gotoSplitContacts(page);
        await page.fill('[data-testid="split-partner-request-email"]', EMAIL_B);
        await waitForApi(page, "POST", "/split/partner-links/", () =>
            page.click('[data-testid="split-partner-request-send"]'),
        );

        // A sees its own request as "sent, pending".
        await expect(
            page
                .locator('[data-testid^="split-partner-link-sent-"]')
                .filter({ hasText: EMAIL_B }),
        ).toBeVisible({ timeout: 8000 });

        // B (persistent context) opens Split > Contacts and sees the pending
        // received request.
        await gotoSplitContacts(pageB);
        const receivedRow = pageB
            .locator('[data-testid^="split-partner-link-row-"]')
            .filter({ hasText: EMAIL_A });
        await expect(receivedRow).toBeVisible({ timeout: 10000 });
        const linkId = await idFromTestId(receivedRow);

        await waitForApi(
            pageB,
            "POST",
            `/split/partner-links/${linkId}/accept/`,
            () =>
                pageB.click(
                    `[data-testid="split-partner-link-accept-${linkId}"]`,
                ),
        );

        // B now has A as a mutual contact.
        await expect(
            pageB
                .locator('[data-testid^="split-contact-row-"]')
                .filter({ hasText: EMAIL_A }),
        ).toBeVisible({ timeout: 8000 });

        // A reloads (fresh mount re-fetches contacts/links) and sees B too.
        // Not `.app-net-worth`: that element only exists on Dashboard/Accounts/
        // Portfolio (see DashboardView.tsx et al.) — we're reloading while
        // already on /split, so wait on the shared app-shell nav instead
        // (same fix as expenses.spec.ts's goToCashFlow for the same reason).
        await page.reload();
        await expect(page.locator('nav a[href="/split"]')).toBeVisible({
            timeout: 15000,
        });
        await gotoSplitContacts(page);
        const contactBRow = page
            .locator('[data-testid^="split-contact-row-"]')
            .filter({ hasText: EMAIL_B });
        await expect(contactBRow).toBeVisible({ timeout: 8000 });
        contactBId = await idFromTestId(contactBRow);

        // Also seed a local (account-less) contact for the group in test b).
        await page.fill(
            '[data-testid="split-contact-name-input"]',
            localContactName,
        );
        await waitForApi(page, "POST", "/split/contacts/", () =>
            page.click('[data-testid="split-contact-new-submit"]'),
        );
        const localRow = page
            .locator('[data-testid^="split-contact-row-"]')
            .filter({ hasText: localContactName });
        await expect(localRow).toBeVisible({ timeout: 8000 });
        localContactId = await idFromTestId(localRow);
    });

    test("b) group with 2 users + 1 local contact — an equal split expense shows the correct per-member balance", async ({
        page,
    }) => {
        test.setTimeout(45000);
        await loginAsTestUser(page, EMAIL_A, PASS_A);

        await gotoSplit(page);
        await page.click('[data-testid="split-group-new-btn"]');
        await page.fill('[data-testid="split-group-name-input"]', groupName);
        await waitForApi(page, "POST", "/split/groups/", () =>
            page.click('[data-testid="split-group-create-submit"]'),
        );
        const groupRow = page
            .locator('[data-testid^="split-group-row-"]')
            .filter({ hasText: groupName });
        await expect(groupRow).toBeVisible({ timeout: 8000 });
        groupId = await idFromTestId(groupRow);

        await groupRow.click();
        await expect(
            page.locator('[data-testid="split-group-balances"]'),
        ).toBeVisible({ timeout: 8000 });

        // Add B (the linked contact) then the local contact to the roster.
        await expect(
            page.locator('[data-testid="split-add-member-select"]'),
        ).toBeVisible({ timeout: 8000 });
        await page.click('[data-testid="split-add-member-select"]');
        await waitForApi(
            page,
            "POST",
            `/split/groups/${groupId}/members/`,
            () =>
                page.click(
                    `[data-testid="split-add-member-select-option-${contactBId}"]`,
                ),
        );
        await expect(
            page.locator('[data-testid^="split-member-row-"]').filter({
                hasText: EMAIL_B,
            }),
        ).toBeVisible({ timeout: 8000 });

        await page.click('[data-testid="split-add-member-select"]');
        await waitForApi(
            page,
            "POST",
            `/split/groups/${groupId}/members/`,
            () =>
                page.click(
                    `[data-testid="split-add-member-select-option-${localContactId}"]`,
                ),
        );
        await expect(
            page.locator('[data-testid^="split-member-row-"]').filter({
                hasText: localContactName,
            }),
        ).toBeVisible({ timeout: 8000 });

        // Resolve A/B's numeric SplitParticipant user ids (needed to target
        // the exact participant-key testids in tests c/d/e).
        const members = await apiGet<
            Array<{ user: number | null; user_email: string | null }>
        >(page, tokenA, `/split/groups/${groupId}/members/`);
        const memberA = members.find((m) => m.user_email === EMAIL_A);
        const memberB = members.find((m) => m.user_email === EMAIL_B);
        if (!memberA?.user || !memberB?.user) {
            throw new Error(
                `expected both A and B as group members, got ${JSON.stringify(members)}`,
            );
        }
        userAId = memberA.user;
        userBId = memberB.user;

        // New expense, equal split (default method) across all 3 members —
        // amount chosen so 90 / 3 == 30.00 exactly, no rounding remainder.
        await page.click('[data-testid="split-group-new-expense"]');
        const sheet = page.locator('[role="dialog"]');
        await expect(
            sheet.locator('[data-testid="split-expense-description"]'),
        ).toBeVisible({ timeout: 8000 });
        await sheet
            .locator('[data-testid="split-expense-description"]')
            .fill(equalExpenseDesc);
        await sheet
            .locator('[data-testid="split-expense-amount"]')
            .fill("90,00");
        await blurAmountField(page);
        // Method stays "equal"; payer defaults to the first participant added
        // to the group, which is A (the creator) — exactly who we want.
        await waitForApi(page, "POST", "/split/expenses/", () =>
            sheet.locator('[data-testid="split-expense-submit"]').click(),
        );

        await expect(
            page
                .locator('[data-testid^="split-expense-row-"]')
                .filter({ hasText: equalExpenseDesc }),
        ).toBeVisible({ timeout: 8000 });

        // Per-member balances: A is owed 60 (30 back from each of B/Local),
        // B and Local each owe 30.
        const aRow = page.locator(
            `[data-testid="split-group-balance-row-user:${userAId}"]`,
        );
        const bRow = page.locator(
            `[data-testid="split-group-balance-row-user:${userBId}"]`,
        );
        const localRow = page.locator(
            `[data-testid="split-group-balance-row-contact:${localContactId}"]`,
        );
        await expect(aRow).toContainText(/\+\s?60,00/, { timeout: 8000 });
        await expect(bRow).toContainText(/-\s?30,00/, { timeout: 8000 });
        await expect(localRow).toContainText(/-\s?30,00/, { timeout: 8000 });
    });

    test("c) exact/percentage/shares split methods compute the live per-participant preview correctly", async ({
        page,
    }) => {
        test.setTimeout(45000);
        await loginAsTestUser(page, EMAIL_A, PASS_A);
        await gotoSplit(page);

        const groupRow = page
            .locator('[data-testid^="split-group-row-"]')
            .filter({ hasText: groupName });
        await expect(groupRow).toBeVisible({ timeout: 8000 });
        await groupRow.click();
        await expect(
            page.locator('[data-testid="split-group-new-expense"]'),
        ).toBeVisible({ timeout: 8000 });

        await page.click('[data-testid="split-group-new-expense"]');
        const sheet = page.locator('[role="dialog"]');
        await expect(
            sheet.locator('[data-testid="split-expense-amount"]'),
        ).toBeVisible({ timeout: 8000 });
        // Opening "new expense" on a group auto-adds all its active members —
        // no manual participant-adding needed here.
        await sheet
            .locator('[data-testid="split-expense-amount"]')
            .fill("100,00");
        await blurAmountField(page);

        const rowA = sheet.locator(
            `[data-testid="split-expense-participant-user:${userAId}"]`,
        );
        const rowB = sheet.locator(
            `[data-testid="split-expense-participant-user:${userBId}"]`,
        );
        const rowLocal = sheet.locator(
            `[data-testid="split-expense-participant-contact:${localContactId}"]`,
        );
        await expect(rowA).toBeVisible({ timeout: 8000 });
        await expect(rowB).toBeVisible({ timeout: 8000 });
        await expect(rowLocal).toBeVisible({ timeout: 8000 });

        const fillRawInputs = async (a: string, b: string, local: string) => {
            await rowA
                .locator(
                    `[data-testid="split-expense-raw-input-user:${userAId}"]`,
                )
                .fill(a);
            await rowB
                .locator(
                    `[data-testid="split-expense-raw-input-user:${userBId}"]`,
                )
                .fill(b);
            await rowLocal
                .locator(
                    `[data-testid="split-expense-raw-input-contact:${localContactId}"]`,
                )
                .fill(local);
        };

        // Exact amounts: 50 + 30 + 20 == 100.
        await sheet.locator('[data-testid="split-expense-method"]').click();
        await sheet
            .locator('[data-testid="split-expense-method-option-exact"]')
            .click();
        await fillRawInputs("50,00", "30,00", "20,00");
        await expect(async () => {
            expect(await computedShareText(rowA)).toContain("50,00");
            expect(await computedShareText(rowB)).toContain("30,00");
            expect(await computedShareText(rowLocal)).toContain("20,00");
        }).toPass({ timeout: 8000 });

        // Percentages: same 50/30/20 numbers, now meaning % of 100 — same
        // resulting amounts.
        await sheet.locator('[data-testid="split-expense-method"]').click();
        await sheet
            .locator('[data-testid="split-expense-method-option-percentage"]')
            .click();
        await expect(async () => {
            expect(await computedShareText(rowA)).toContain("50,00");
            expect(await computedShareText(rowB)).toContain("30,00");
            expect(await computedShareText(rowLocal)).toContain("20,00");
        }).toPass({ timeout: 8000 });

        // Shares/weights: 1 / 1 / 2 (total 4) of 100 == 25 / 25 / 50.
        await sheet.locator('[data-testid="split-expense-method"]').click();
        await sheet
            .locator('[data-testid="split-expense-method-option-shares"]')
            .click();
        await fillRawInputs("1", "1", "2");
        await expect(async () => {
            expect(await computedShareText(rowA)).toContain("25,00");
            expect(await computedShareText(rowB)).toContain("25,00");
            expect(await computedShareText(rowLocal)).toContain("50,00");
        }).toPass({ timeout: 8000 });

        // Discard — this is a pure live-preview check, no expense should be
        // created (it would double up the balances test (b) just asserted).
        await sheet.getByRole("button", { name: /Cancel|Annulla/ }).click();
        await expect(sheet).toHaveCount(0);
    });

    test("d) Simplify debts on the 3-person group nets cross-debts into at most n-1 transactions", async ({
        page,
    }) => {
        test.setTimeout(45000);
        await loginAsTestUser(page, EMAIL_A, PASS_A);

        // Second expense via API (fast, exact split), paid by the LOCAL
        // contact this time — any group member can log an expense someone
        // else paid, as long as no category/account is attached (those are
        // scoped to the payer). This creates genuine cross-debts: combined
        // with expense (b) (A +60 / B -30 / Local -30), this expense
        // (Local +10 / A -5 / B -5) nets to A +55, B -35, Local -20.
        await apiPost(page, tokenA, "/split/expenses/", {
            group: groupId,
            description: `E2E split cross-debt ${RUN_ID}`,
            amount: "30.00",
            date: await todayIso(),
            split_method: "exact",
            category: null,
            linked_asset: null,
            notes: "",
            participants: [
                {
                    contact_id: localContactId,
                    raw_input: "20.00",
                    is_payer: true,
                },
                { user_id: userAId, raw_input: "5.00", is_payer: false },
                { user_id: userBId, raw_input: "5.00", is_payer: false },
            ],
        });

        await gotoSplit(page);
        const groupRow = page
            .locator('[data-testid^="split-group-row-"]')
            .filter({ hasText: groupName });
        await expect(groupRow).toBeVisible({ timeout: 8000 });
        await groupRow.click();

        const aRow = page.locator(
            `[data-testid="split-group-balance-row-user:${userAId}"]`,
        );
        await expect(aRow).toContainText(/\+\s?55,00/, { timeout: 8000 });

        await waitForApi(
            page,
            "GET",
            `/split/groups/${groupId}/simplify/`,
            () => page.click('[data-testid="split-simplify-btn"]'),
        );

        const transactions = page.locator(
            '[data-testid^="split-simplify-tx-"]',
        );
        await expect(transactions).toHaveCount(2, { timeout: 8000 });

        // Greedy debtor/creditor: sole creditor A(55) is paid first by the
        // larger debtor B(35), then by Local(20) — in that order.
        await expect(
            page.locator('[data-testid="split-simplify-tx-0"]'),
        ).toContainText(/35,00/);
        await expect(
            page.locator('[data-testid="split-simplify-tx-1"]'),
        ).toContainText(/20,00/);
        // Both legs pay *me* (A is the only creditor), so both offer a
        // "Settle up" shortcut.
        await expect(
            page.locator('[data-testid="split-simplify-settle-0"]'),
        ).toBeVisible();
        await expect(
            page.locator('[data-testid="split-simplify-settle-1"]'),
        ).toBeVisible();
    });

    test("e) Settle up zeroes the balance and shows up in CashFlow as a split_reimbursement excluded from the totals", async ({
        page,
    }) => {
        test.setTimeout(45000);
        await loginAsTestUser(page, EMAIL_A, PASS_A);

        await gotoSplit(page);
        const groupRow = page
            .locator('[data-testid^="split-group-row-"]')
            .filter({ hasText: groupName });
        await expect(groupRow).toBeVisible({ timeout: 8000 });
        await groupRow.click();

        await waitForApi(
            page,
            "GET",
            `/split/groups/${groupId}/simplify/`,
            () => page.click('[data-testid="split-simplify-btn"]'),
        );
        // tx-0 is B → A 35.00 (see test d) — settle it in full.
        await page.click('[data-testid="split-simplify-settle-0"]');

        const sheet = page.locator('[role="dialog"]');
        await expect(
            sheet.locator('[data-testid="split-settle-amount"]'),
        ).toBeVisible({ timeout: 8000 });
        await expect(
            sheet.locator('[data-testid="split-settle-amount"]'),
        ).toHaveValue(/35,00/);

        settleNote = `E2E split settle ${RUN_ID}`;
        await sheet
            .locator('[data-testid="split-settle-notes"]')
            .fill(settleNote);

        const dateRange = await todayIso();
        // `/expenses/cashflow/` nests the totals under `summary` (alongside
        // `results`/`count`/`next_page`) — not top-level `income`/`outcome`.
        const summaryBefore = await apiGet<{
            summary: { income: string; outcome: string };
        }>(
            page,
            tokenA,
            `/expenses/cashflow/?date_from=${dateRange}&date_to=${dateRange}`,
        );

        await waitForApi(page, "POST", "/split/settlements/", () =>
            sheet.locator('[data-testid="split-settle-submit"]').click(),
        );
        await expect(sheet).toHaveCount(0);

        // B's balance in the group is now fully settled (row disappears —
        // compute_balances omits zero balances) and A is left owed only by
        // Local's remaining 20.
        await expect(
            page.locator(
                `[data-testid="split-group-balance-row-user:${userBId}"]`,
            ),
        ).toHaveCount(0, { timeout: 8000 });
        await expect(
            page.locator(
                `[data-testid="split-group-balance-row-user:${userAId}"]`,
            ),
        ).toContainText(/\+\s?20,00/, { timeout: 8000 });

        // The settlement is not income/outcome money — the summary totals
        // must be byte-for-byte unchanged.
        const summaryAfter = await apiGet<{
            summary: { income: string; outcome: string };
        }>(
            page,
            tokenA,
            `/expenses/cashflow/?date_from=${dateRange}&date_to=${dateRange}`,
        );
        expect(summaryAfter.summary.income).toBe(summaryBefore.summary.income);
        expect(summaryAfter.summary.outcome).toBe(
            summaryBefore.summary.outcome,
        );

        // ...yet it IS visible in the CashFlow feed itself.
        await page.click('nav a[href="/cashflow"]');
        await expect(page).toHaveURL(/\/cashflow$/);
        await expect(page.locator(`text=${settleNote}`)).toBeVisible({
            timeout: 10000,
        });
    });

    test("f) an expense with a linked account drains the account's full amount but CashFlow 'Outcome' only reflects the net share", async ({
        page,
    }) => {
        test.setTimeout(45000);
        await loginAsTestUser(page, EMAIL_A, PASS_A);
        const token = await getToken(page);

        const suffix = String(RUN_ID);
        const categoryName = `E2E Split Category ${suffix}`;
        const categoryRes = await page.request.post(
            "/fininzen/api/expenses/categories/",
            {
                headers: { Authorization: `Bearer ${token}` },
                data: {
                    name: categoryName,
                    color: "#4f7fff",
                    icon: "S",
                    category_type: "expense",
                },
            },
        );
        if (!categoryRes.ok())
            throw new Error(`category create failed: ${categoryRes.status()}`);
        const categoryId = (await categoryRes.json()).id;

        const typeRes = await page.request.post(
            "/fininzen/api/portfolio/investment-types/",
            {
                headers: { Authorization: `Bearer ${token}` },
                data: {
                    name: `E2E Split Bank ${suffix}`,
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
            throw new Error(
                `investment type create failed: ${typeRes.status()}`,
            );
        const typeId = (await typeRes.json()).id;

        // `initial_balance` (not `current_value`/`invested_capital` directly)
        // is what actually persists: it makes create_asset_with_initial_balance
        // (portfolio/services.py) write a real, verified CASH_IN transaction.
        // Setting current_value/invested_capital as plain fields looks like it
        // seeds 1000.00, but that value doesn't survive the asset's first
        // recompute_from_transactions() (triggered by our own shadow CASH_OUT
        // below) — with no opening transaction to recompute from, the balance
        // collapses to 0 minus whatever real transactions exist. Mirrors
        // splitting/tests/conftest.py::account, which seeds the same way (via
        // a real CASH_IN) for exactly this reason.
        const accountRes = await page.request.post("/fininzen/api/portfolio/", {
            headers: { Authorization: `Bearer ${token}` },
            data: {
                name: `E2E Split Account ${suffix}`,
                tracking_type: "MANUAL",
                investment_type: typeId,
                is_liquid: true,
                initial_balance: "1000.00",
            },
        });
        if (!accountRes.ok())
            throw new Error(`account create failed: ${accountRes.status()}`);
        const accountId = (await accountRes.json()).id;

        // AppProvider's bankAccounts/categories load on mount — a reload
        // picks up what was just seeded via the API (same trick
        // recurring.spec.ts uses).
        await page.reload();
        await expect(page.locator(".app-net-worth")).toBeVisible({
            timeout: 15000,
        });

        const dateRange = await todayIso();
        // See test (e): totals live under `summary`, not top-level.
        const summaryBefore = await apiGet<{ summary: { outcome: string } }>(
            page,
            token,
            `/expenses/cashflow/?date_from=${dateRange}&date_to=${dateRange}`,
        );

        // Standalone ("quick") expense: exercises the group=null form path.
        // Default participant is "You" (A); add B so there is a real 2-way
        // equal split — A's net personal quota is exactly half.
        await gotoSplit(page);
        linkedExpenseDesc = `E2E split linked-account ${RUN_ID}`;
        await page.click('[data-testid="split-quick-expense-cta"]');
        const sheet = page.locator('[role="dialog"]');
        await expect(
            sheet.locator('[data-testid="split-expense-description"]'),
        ).toBeVisible({ timeout: 8000 });
        await sheet
            .locator('[data-testid="split-expense-description"]')
            .fill(linkedExpenseDesc);
        await sheet
            .locator('[data-testid="split-expense-amount"]')
            .fill("100,00");
        await blurAmountField(page);

        await sheet
            .locator('[data-testid="split-expense-add-participant"]')
            .click();
        await sheet
            .locator(
                `[data-testid="split-expense-add-participant-option-user:${userBId}"]`,
            )
            .click();

        await sheet.locator('[data-testid="category-select-trigger"]').click();
        await page
            .locator(
                `[data-testid="category-select-dropdown"] button:has-text("${categoryName}")`,
            )
            .first()
            .click();

        await sheet.locator('[data-testid="split-expense-account"]').click();
        await page.click(
            `[data-testid="split-expense-account-option-${accountId}"]`,
        );

        await waitForApi(page, "POST", "/split/expenses/", () =>
            sheet.locator('[data-testid="split-expense-submit"]').click(),
        );
        await expect(sheet).toHaveCount(0);

        // Account balance drops by the FULL 100, not the 50 net quota
        // (splitting/signals.py mirrors the expense shadow-transaction with
        // the whole instance.amount — piano sez. 4/decision #3).
        const account = await apiGet<{ current_value: string }>(
            page,
            token,
            `/portfolio/${accountId}/`,
        );
        expect(Number(account.current_value)).toBeCloseTo(900.0, 2);

        // CashFlow's "Outcome" total only grew by the 50 net personal quota.
        const summaryAfter = await apiGet<{ summary: { outcome: string } }>(
            page,
            token,
            `/expenses/cashflow/?date_from=${dateRange}&date_to=${dateRange}`,
        );
        const delta =
            Number(summaryAfter.summary.outcome) -
            Number(summaryBefore.summary.outcome);
        expect(delta).toBeCloseTo(50.0, 2);

        // The expense is visible in the feed, rendered like a normal outcome
        // (red "-" sign, not the neutral "±" transfer/adjustment styling).
        await page.click('nav a[href="/cashflow"]');
        await expect(page).toHaveURL(/\/cashflow$/);
        const row = page
            .locator(".tx-row")
            .filter({ hasText: linkedExpenseDesc });
        await expect(row).toBeVisible({ timeout: 10000 });
        const rowText = (await row.innerText()).replace(/[\s  ]/g, "");
        expect(rowText).toContain("-50,00");
    });

    // g)/h) — piano QA-fix Batch 2.1/2.2: before this fix, a recorded
    // settlement and a standalone ("quick") expense were both permanently
    // invisible after creation — no list, no edit, no delete, anywhere in
    // the app. Re-visit the state tests (e)/(f) already produced instead of
    // re-seeding, since "does the thing I just created stay reachable" is
    // exactly the gap that was found.
    test("g) the settlement recorded in test e) is visible in the group's settlement history and can be deleted", async ({
        page,
    }) => {
        test.setTimeout(30000);
        await loginAsTestUser(page, EMAIL_A, PASS_A);

        await gotoSplit(page);
        const groupRow = page
            .locator('[data-testid^="split-group-row-"]')
            .filter({ hasText: groupName });
        await expect(groupRow).toBeVisible({ timeout: 8000 });
        await groupRow.click();

        // The row shows payer → payee, date, and amount — not `notes` (not
        // part of the section's spec, piano Batch 2.1), so match on the
        // payer's email (B, unique to this run) instead of `settleNote`.
        const settlementRow = page
            .locator('[data-testid^="split-settlement-row-"]')
            .filter({ hasText: EMAIL_B });
        await expect(settlementRow).toBeVisible({ timeout: 8000 });
        await expect(settlementRow).toContainText(/35,00/);
        const settlementId = await idFromTestId(settlementRow);

        await page.click(
            `[data-testid="split-settlement-delete-${settlementId}"]`,
        );
        await waitForApi(
            page,
            "DELETE",
            `/split/settlements/${settlementId}/`,
            () => page.click('[data-testid="split-settlement-delete-confirm"]'),
        );
        await expect(settlementRow).toHaveCount(0, { timeout: 8000 });
        await expect(
            page.locator('[data-testid="split-group-settlements-empty"]'),
        ).toBeVisible({ timeout: 8000 });
    });

    test("h) the standalone quick expense from test f) is visible, editable, and deletable afterward", async ({
        page,
    }) => {
        test.setTimeout(30000);
        await loginAsTestUser(page, EMAIL_A, PASS_A);

        await gotoSplit(page);
        const expenseRow = page
            .locator('[data-testid^="split-standalone-expense-row-"]')
            .filter({ hasText: linkedExpenseDesc });
        await expect(expenseRow).toBeVisible({ timeout: 8000 });
        const expenseId = await idFromTestId(expenseRow);

        // Edit: change the description, confirm it's reflected in the list.
        await expenseRow.locator("button", { hasText: "Edit" }).click();
        const sheet = page.locator('[role="dialog"]');
        await expect(
            sheet.locator('[data-testid="split-expense-description"]'),
        ).toHaveValue(linkedExpenseDesc, { timeout: 8000 });
        const editedDesc = `${linkedExpenseDesc} (edited)`;
        await sheet
            .locator('[data-testid="split-expense-description"]')
            .fill(editedDesc);
        await waitForApi(page, "PATCH", `/split/expenses/${expenseId}/`, () =>
            sheet.locator('[data-testid="split-expense-submit"]').click(),
        );
        await expect(sheet).toHaveCount(0);
        const editedRow = page
            .locator('[data-testid^="split-standalone-expense-row-"]')
            .filter({ hasText: editedDesc });
        await expect(editedRow).toBeVisible({ timeout: 8000 });

        // Delete: row disappears, empty state shows (only standalone expense
        // A has in this run).
        await page.click(
            `[data-testid="split-standalone-expense-delete-${expenseId}"]`,
        );
        await waitForApi(page, "DELETE", `/split/expenses/${expenseId}/`, () =>
            page.click(
                '[data-testid="split-standalone-expense-delete-confirm"]',
            ),
        );
        await expect(editedRow).toHaveCount(0, { timeout: 8000 });
        await expect(
            page.locator('[data-testid="split-standalone-expenses-empty"]'),
        ).toBeVisible({ timeout: 8000 });
    });
});
