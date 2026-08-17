import { expect, test } from "@playwright/test";
import { loginAsDemo } from "./helpers/auth";

test.describe("Settings contact link", () => {
    test("opens the configured recipient in the user's email client", async ({
        page,
    }) => {
        await loginAsDemo(page);
        await page.goto("/settings/about");

        const contactLink = page.getByTestId("about-contact");
        await expect(contactLink).toBeVisible();
        await expect(contactLink).toHaveAttribute(
            "href",
            /^mailto:support@example\.test\?subject=.+&body=.+$/,
        );
    });
});
