import { test, expect, Page } from "@playwright/test";
import { loginAsDemo } from "./helpers/auth";

// The in-field amount calculator: an expression typed inline ("12,50+8,30")
// and the on-screen keypad. Every case here is client-side only — nothing is
// submitted — so the read-only demo account is enough.
//
// Selectors are data-testid only: the UI language follows the account's
// profile and is not deterministic across runs. No waitForLoadState
// ("networkidle") either — the dev server's HMR websocket never lets it settle.

const AMOUNT = '[data-testid="exp-amount"]';
const EQUALS = '[data-testid="amount-equals"]';
const ERROR = '[data-testid="amount-error"]';
const TRIGGER = '[data-testid="amount-calc-trigger"]';
const PAD = '[data-testid="amount-calculator-pad"]';
const DISPLAY = '[data-testid="calc-display"]';
const APPLY = '[data-testid="calc-apply"]';
const SHEET = ".bottom-sheet__panel";

const key = (id: string) => `[data-testid="calc-key-${id}"]`;

async function openMovementSheet(page: Page): Promise<void> {
    await page.goto("/cashflow");
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
    // One login for the whole file: the demo endpoint throttles, and a
    // per-test loginAsDemo trips it around the twentieth case. Nothing here
    // writes, so a single session is safe to share; each test still starts
    // from a freshly loaded page and a freshly opened sheet.
    test.describe.configure({ mode: "serial" });

    let page: Page;

    test.beforeAll(async ({ browser }) => {
        page = await browser.newPage();
        await loginAsDemo(page);
    });

    test.afterAll(async () => {
        await page.close();
    });

    test.beforeEach(async () => {
        await openMovementSheet(page);
    });

    // ── Non-regression: a plain number must behave exactly as before ────────

    test("plain number is untouched and shows no = button", async () => {
        await page.fill(AMOUNT, "42.50");
        await expect(page.locator(AMOUNT)).toHaveValue("42.50");
        await expect(page.locator(EQUALS)).toBeHidden();
    });

    // expenses.spec.ts drives this field as `input[inputmode="decimal"]`, and
    // the pad flips inputMode to "none" while it is open. Pin the resting
    // state so that selector keeps resolving to exactly this one input.
    test("field is still the sheet's only inputmode=decimal input", async () => {
        const decimals = page.locator(`${SHEET} input[inputmode="decimal"]`);
        await expect(decimals).toHaveCount(1);
        await expect(decimals).toHaveAttribute("data-testid", "exp-amount");
    });

    test("plain number still clamps to two decimals", async () => {
        const sep = await separator(page);
        await page.fill(AMOUNT, `12${sep}345`);
        await expect(page.locator(AMOUNT)).toHaveValue(`12${sep}34`);
    });

    // ── Inline expressions ─────────────────────────────────────────────────

    test("sum resolves on Enter", async () => {
        const sep = await separator(page);
        await page.fill(AMOUNT, `12${sep}50+8${sep}30`);
        await page.locator(AMOUNT).press("Enter");
        await expect(page.locator(AMOUNT)).toHaveValue(`20${sep}80`);
    });

    test("= button appears once an operator is typed", async () => {
        await expect(page.locator(EQUALS)).toBeHidden();
        await page.fill(AMOUNT, "12+8");
        await expect(page.locator(EQUALS)).toBeVisible();
    });

    test("sum resolves on = click", async () => {
        const sep = await separator(page);
        await page.fill(AMOUNT, "10*3");
        await page.click(EQUALS);
        await expect(page.locator(AMOUNT)).toHaveValue(`30${sep}00`);
    });

    test("multiplication binds tighter than addition", async () => {
        const sep = await separator(page);
        await page.fill(AMOUNT, "2+3*4");
        await page.locator(AMOUNT).press("Enter");
        await expect(page.locator(AMOUNT)).toHaveValue(`14${sep}00`);
    });

    test("unicode operator glyphs are accepted", async () => {
        const sep = await separator(page);
        await page.fill(AMOUNT, "10×3");
        await page.locator(AMOUNT).press("Enter");
        await expect(page.locator(AMOUNT)).toHaveValue(`30${sep}00`);
    });

    test("expression resolves on blur", async () => {
        const sep = await separator(page);
        await page.fill(AMOUNT, "5+5");
        await page.locator(AMOUNT).blur();
        await expect(page.locator(AMOUNT)).toHaveValue(`10${sep}00`);
    });

    test("a trailing operator is forgiven, not an error", async () => {
        const sep = await separator(page);
        await page.fill(AMOUNT, `12${sep}50+`);
        await page.locator(AMOUNT).press("Enter");
        await expect(page.locator(AMOUNT)).toHaveValue(`12${sep}50`);
        await expect(page.locator(ERROR)).toBeHidden();
    });

    // ── Errors: the text is left exactly as typed, never rewritten ──────────

    test("negative result is refused and the sign is never dropped", async () => {
        await page.fill(AMOUNT, "10-15");
        await page.locator(AMOUNT).press("Enter");
        // The dangerous outcome would be "5,00": filterAmountInput strips "-",
        // so a written-through result would submit as a positive amount.
        await expect(page.locator(AMOUNT)).toHaveValue("10-15");
        await expect(page.locator(ERROR)).toBeVisible();
    });

    test("division by zero is refused", async () => {
        await page.fill(AMOUNT, "10/0");
        await page.locator(AMOUNT).press("Enter");
        await expect(page.locator(AMOUNT)).toHaveValue("10/0");
        await expect(page.locator(ERROR)).toBeVisible();
    });

    // ── Keypad ─────────────────────────────────────────────────────────────

    test("trigger opens the pad", async () => {
        await page.click(TRIGGER);
        await expect(page.locator(PAD)).toBeVisible();
    });

    test("pad seeds from the current field value", async () => {
        const sep = await separator(page);
        await page.fill(AMOUNT, `12${sep}50`);
        await page.click(TRIGGER);
        await expect(page.locator(DISPLAY)).toHaveText(`12${sep}50`);
    });

    test("compose a sum on the pad and apply it", async () => {
        const sep = await separator(page);
        await page.fill(AMOUNT, `12${sep}50`);
        await page.click(TRIGGER);
        await page.click(key("plus"));
        await page.click(key("8"));
        await page.click(key("sep"));
        await page.click(key("3"));
        await page.click(key("0"));
        await page.click(APPLY);
        await expect(page.locator(PAD)).toBeHidden();
        await expect(page.locator(AMOUNT)).toHaveValue(`20${sep}80`);
    });

    test("= inside the pad shows the result", async () => {
        const sep = await separator(page);
        await page.click(TRIGGER);
        await page.click(key("7"));
        await page.click(key("mul"));
        await page.click(key("6"));
        await page.click(key("equals"));
        await expect(page.locator(DISPLAY)).toHaveText(`42${sep}00`);
        await expect(page.locator(APPLY)).toBeEnabled();
    });

    test("Apply is disabled while the expression cannot be evaluated", async () => {
        await page.click(TRIGGER);
        await page.click(key("5"));
        await page.click(key("div"));
        await page.click(key("0"));
        await expect(page.locator(APPLY)).toBeDisabled();
    });

    test("backspace and AC edit the display", async () => {
        await page.click(TRIGGER);
        await page.click(key("1"));
        await page.click(key("2"));
        await page.click(key("3"));
        await page.click(key("back"));
        await expect(page.locator(DISPLAY)).toHaveText("12");
        await page.click(key("ac"));
        await expect(page.locator(DISPLAY)).toHaveText("0");
    });

    // ── Scoping: the pad lives inside a BottomSheet and must not take it
    //    down with it. Both of these regress loudly if the capture-phase
    //    Escape handler or the pad's own backdrop is removed.

    test("Escape closes the pad and leaves the sheet open", async () => {
        await page.click(TRIGGER);
        await expect(page.locator(PAD)).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(page.locator(PAD)).toBeHidden();
        await expect(page.locator(SHEET)).toBeVisible();
    });

    test("clicking outside the pad leaves the sheet open", async () => {
        await page.click(TRIGGER);
        await expect(page.locator(PAD)).toBeVisible();
        await page.mouse.click(20, 20);
        await expect(page.locator(PAD)).toBeHidden();
        await expect(page.locator(SHEET)).toBeVisible();
    });

    test("focus returns to the trigger after closing", async () => {
        await page.click(TRIGGER);
        await page.keyboard.press("Escape");
        await expect(page.locator(TRIGGER)).toBeFocused();
    });

    // ── Transfer form ──────────────────────────────────────────────────────

    test("transfer amount takes an expression too", async () => {
        const sep = await separator(page);
        await page.click('[data-testid="movement-type-transfer"]');
        const transfer = page.locator('[data-testid="transfer-amount"]');
        await expect(transfer).toBeVisible();
        await transfer.fill(`20+22${sep}50`);
        await transfer.press("Enter");
        await expect(transfer).toHaveValue(`42${sep}50`);
    });
});
