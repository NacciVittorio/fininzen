import { test, expect, Page } from "@playwright/test";
import { loginAsDemo } from "./helpers/auth";

// The in-field amount calculator: an expression typed inline ("12,50+8,30")
// and the operator bar that docks above the OS keyboard. Every case here is
// client-side only — nothing is submitted — so the read-only demo account is
// enough.
//
// Selectors are data-testid only: the UI language follows the account's
// profile and is not deterministic across runs. No waitForLoadState
// ("networkidle") either — the dev server's HMR websocket never lets it settle.
//
// The bar is gated on a viewport narrower than 640px; playwright.config.ts runs
// at 390×844, so it is in range for every test in this file.

const AMOUNT = '[data-testid="exp-amount"]';
const ERROR = '[data-testid="amount-error"]';
const BAR = '[data-testid="amount-operator-bar"]';
const SHEET = ".bottom-sheet__panel";

const barKey = (id: string) => `[data-testid="calc-bar-${id}"]`;

async function openMovementSheet(page: Page): Promise<void> {
    await page.goto("/cashflow");
    // next dev injects <nextjs-portal>, whose error badge lands in the
    // bottom-left corner — exactly on top of the bar's first key, which then
    // swallows the click. next.config.ts already turns off the dev-tools
    // indicator under E2E=1 for the same reason (it overlapped the bottom nav);
    // the error badge is separate and cannot be configured away, so hide the
    // whole portal. It is dev-server furniture, never part of a build.
    await page.addStyleTag({
        content: "nextjs-portal { display: none !important; }",
    });
    await expect(page.locator('[data-testid="expenses-add-fab"]')).toBeVisible({
        timeout: 15_000,
    });
    await page.click('[data-testid="expenses-add-fab"]');
    await expect(page.locator(AMOUNT)).toBeVisible({ timeout: 10_000 });
}

// The demo profile decides "," vs "." — read it off the field rather than
// assuming, so the expectations hold either way.
async function separator(page: Page): Promise<string> {
    const placeholder = await page.locator(AMOUNT).getAttribute("placeholder");
    return placeholder?.includes(",") ? "," : ".";
}

test.describe("Amount calculator", () => {
    // Each test gets its own fresh page and login (the standard fixture),
    // rather than 18 tests sharing one page/browser instance for the whole
    // file: that shared page reliably went unresponsive ("Target page,
    // context or browser has been closed") partway through when run as part
    // of the full suite — on both macOS and GitHub's Linux runners — never
    // when this file ran alone. Per-test demo logins are safe now that CI
    // (ci-tools/test-e2e.sh) sets E2E_RELAX_THROTTLES=1; a bare local
    // Django dev server needs the same env var for the same reason every
    // other spec file in this suite already does.
    test.beforeEach(async ({ page }) => {
        // Login + navigation now happen inside every test's own budget (one
        // shared page/login for the whole file used to absorb this cost
        // once). Under full-suite load the combined wait can outrun the
        // global 15s test timeout before the fab-visibility wait even gets
        // there — same fix as compare-mode.spec.ts's beforeEach.
        test.setTimeout(30_000);
        await loginAsDemo(page);
        await openMovementSheet(page);
    });

    // ── Non-regression: a plain number must behave exactly as before ────────

    test("plain number is untouched", async ({ page }) => {
        await page.fill(AMOUNT, "42.50");
        await expect(page.locator(AMOUNT)).toHaveValue("42.50");
    });

    // expenses.spec.ts drives this field as `input[inputmode="decimal"]`. Pin
    // it so that selector keeps resolving to exactly this one input.
    test("field is still the sheet's only inputmode=decimal input", async ({
        page,
    }) => {
        const decimals = page.locator(`${SHEET} input[inputmode="decimal"]`);
        await expect(decimals).toHaveCount(1);
        await expect(decimals).toHaveAttribute("data-testid", "exp-amount");
    });

    test("plain number still clamps to two decimals", async ({ page }) => {
        const sep = await separator(page);
        await page.fill(AMOUNT, `12${sep}345`);
        await expect(page.locator(AMOUNT)).toHaveValue(`12${sep}34`);
    });

    // The field carries no chrome of its own any more: no calculator icon, no
    // inline "=". Both were removed in favour of the operator bar.
    test("the field has no in-field buttons", async ({ page }) => {
        await expect(
            page.locator('[data-testid="amount-calc-trigger"]'),
        ).toHaveCount(0);
        await expect(page.locator('[data-testid="amount-equals"]')).toHaveCount(
            0,
        );
    });

    // ── Inline expressions ─────────────────────────────────────────────────

    test("sum resolves on Enter", async ({ page }) => {
        const sep = await separator(page);
        await page.fill(AMOUNT, `12${sep}50+8${sep}30`);
        await page.locator(AMOUNT).press("Enter");
        await expect(page.locator(AMOUNT)).toHaveValue(`20${sep}80`);
    });

    test("multiplication binds tighter than addition", async ({ page }) => {
        const sep = await separator(page);
        await page.fill(AMOUNT, "2+3*4");
        await page.locator(AMOUNT).press("Enter");
        await expect(page.locator(AMOUNT)).toHaveValue(`14${sep}00`);
    });

    test("unicode operator glyphs are accepted", async ({ page }) => {
        const sep = await separator(page);
        await page.fill(AMOUNT, "10×3");
        await page.locator(AMOUNT).press("Enter");
        await expect(page.locator(AMOUNT)).toHaveValue(`30${sep}00`);
    });

    test("expression resolves on blur", async ({ page }) => {
        const sep = await separator(page);
        await page.fill(AMOUNT, "5+5");
        await page.locator(AMOUNT).blur();
        await expect(page.locator(AMOUNT)).toHaveValue(`10${sep}00`);
    });

    test("a trailing operator is forgiven, not an error", async ({ page }) => {
        const sep = await separator(page);
        await page.fill(AMOUNT, `12${sep}50+`);
        await page.locator(AMOUNT).press("Enter");
        await expect(page.locator(AMOUNT)).toHaveValue(`12${sep}50`);
        await expect(page.locator(ERROR)).toBeHidden();
    });

    // ── Errors: the text is left exactly as typed, never rewritten ──────────

    test("negative result is refused and the sign is never dropped", async ({
        page,
    }) => {
        await page.fill(AMOUNT, "10-15");
        await page.locator(AMOUNT).press("Enter");
        // The dangerous outcome would be "5,00": filterAmountInput strips "-",
        // so a written-through result would submit as a positive amount.
        await expect(page.locator(AMOUNT)).toHaveValue("10-15");
        await expect(page.locator(ERROR)).toBeVisible();
    });

    test("division by zero is refused", async ({ page }) => {
        await page.fill(AMOUNT, "10/0");
        await page.locator(AMOUNT).press("Enter");
        await expect(page.locator(AMOUNT)).toHaveValue("10/0");
        await expect(page.locator(ERROR)).toBeVisible();
    });

    // ── Operator bar ───────────────────────────────────────────────────────

    test("the bar follows the field's focus", async ({ page }) => {
        await expect(page.locator(BAR)).toBeHidden();
        await page.locator(AMOUNT).focus();
        await expect(page.locator(BAR)).toBeVisible();
        await page.locator(AMOUNT).blur();
        await expect(page.locator(BAR)).toBeHidden();
    });

    // The regression this guards: without preventDefault on the keys' mousedown
    // the input blurs on every tap, which on a phone drops the OS keyboard and
    // takes the bar down with it.
    test("an operator key inserts without stealing focus", async ({ page }) => {
        const sep = await separator(page);
        await page.fill(AMOUNT, `12${sep}50`);
        await page.click(barKey("plus"));
        await expect(page.locator(AMOUNT)).toHaveValue(`12${sep}50+`);
        await expect(page.locator(AMOUNT)).toBeFocused();
        await expect(page.locator(BAR)).toBeVisible();
    });

    test("compose a sum from the bar and resolve it with =", async ({
        page,
    }) => {
        const sep = await separator(page);
        await page.fill(AMOUNT, `12${sep}50`);
        await page.click(barKey("plus"));
        await page.locator(AMOUNT).pressSequentially(`8${sep}30`);
        await page.click(barKey("equals"));
        await expect(page.locator(AMOUNT)).toHaveValue(`20${sep}80`);
    });

    test("every operator key reaches the field", async ({ page }) => {
        await page.fill(AMOUNT, "10");
        await page.click(barKey("mul"));
        await expect(page.locator(AMOUNT)).toHaveValue("10*");
        await page.click(barKey("div"));
        // filterAmountExpression collapses a run of operators to the last one.
        await expect(page.locator(AMOUNT)).toHaveValue("10/");
        await page.click(barKey("minus"));
        await expect(page.locator(AMOUNT)).toHaveValue("10-");
    });

    test("backspace deletes the character before the caret", async ({
        page,
    }) => {
        await page.fill(AMOUNT, "123");
        await page.click(barKey("back"));
        await expect(page.locator(AMOUNT)).toHaveValue("12");
    });

    // ── The bar lives outside the sheet and must not take it down ───────────

    test("using the bar leaves the sheet open", async ({ page }) => {
        await page.locator(AMOUNT).focus();
        await page.click(barKey("plus"));
        await expect(page.locator(SHEET)).toBeVisible();
    });

    // ── Transfer form ──────────────────────────────────────────────────────

    test("transfer amount takes an expression too", async ({ page }) => {
        const sep = await separator(page);
        await page.click('[data-testid="movement-type-transfer"]');
        const transfer = page.locator('[data-testid="transfer-amount"]');
        await expect(transfer).toBeVisible();
        await transfer.fill(`20+22${sep}50`);
        await transfer.press("Enter");
        await expect(transfer).toHaveValue(`42${sep}50`);
    });
});
