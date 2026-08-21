import { expect, test, type Locator } from "@playwright/test";
import { loginAsTestUser } from "./helpers/auth";

const TEST_EMAIL = "playwright_control_geometry@test.com";
const TEST_PASS = "PlControl!888xyz";

test.use({ viewport: { width: 1280, height: 900 } });

async function expectStandardHeight(control: Locator): Promise<void> {
    await expect(control).toBeVisible();
    await expect(control).toHaveCSS("min-height", "44px");
    await expect
        .poll(() =>
            control.evaluate((element) =>
                Math.round(element.getBoundingClientRect().height),
            ),
        )
        .toBe(44);
}

test.describe("Shared control geometry", () => {
    test.beforeEach(async ({ page }) => {
        await loginAsTestUser(page, TEST_EMAIL, TEST_PASS);
    });

    test("aligns Cash Flow selector, filters, and primary CTA", async ({
        page,
    }) => {
        await page.goto("/cashflow");

        const segmented = page
            .getByTestId("cf-view-toggle")
            .locator(".segmented");
        const filters = page.getByTestId("cf-filters-open");
        const select = page.getByTestId("cf-select-mode");
        const addTransaction = page.getByTestId("cf-add-transaction-desktop");

        await expectStandardHeight(segmented);
        await expectStandardHeight(filters);
        await expectStandardHeight(select);
        await expectStandardHeight(addTransaction);

        const firstOption = segmented.getByRole("tab").first();
        await firstOption.click();
        await expect(firstOption).toHaveAttribute("aria-selected", "true");
    });

    test("keeps Settings actions on the shared standard geometry", async ({
        page,
    }) => {
        await page.goto("/settings/data");

        await expectStandardHeight(
            page.getByRole("button", { name: "Load Demo Data" }),
        );
    });
});
