import { expect, test, type Page } from "@playwright/test";

const adminPassword = "hearth-e2e";

const loginAsAdmin = async (page: Page, pathname = "/admin/login"): Promise<void> => {
  await page.goto(pathname);
  await expect(page.getByRole("heading", { name: "Hearth Admin" })).toBeVisible();
  await page.getByLabel("Admin password").fill(adminPassword);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/admin/layouts");
  await expect(page.getByRole("heading", { name: "Layouts" })).toBeVisible();
};

test.describe("Hearth smoke", () => {
  test("admin login survives logout and re-login", async ({ page }) => {
    await loginAsAdmin(page);

    await page.getByRole("button", { name: "Logout" }).click();
    await page.waitForURL("**/admin/login");
    await expect(page.getByRole("heading", { name: "Hearth Admin" })).toBeVisible();

    await page.getByLabel("Admin password").fill(adminPassword);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL("**/admin/layouts");
    await expect(page.getByRole("heading", { name: "Layouts" })).toBeVisible();
  });

  test("display registration appears in admin devices", async ({ page }) => {
    const registration = page.waitForResponse(
      (response) =>
        response.url().includes("/api/display/screen-profile/report") &&
        response.request().method() === "POST" &&
        response.ok(),
    );

    await page.goto("/");
    await registration;

    await expect
      .poll(async () => {
        const bodyText = await page.locator("body").innerText();
        return (
          bodyText.includes("Today's Chores") ||
          bodyText.includes("No display layout is configured for this screen")
        );
      })
      .toBe(true);

    await loginAsAdmin(page);
    await page.getByRole("button", { name: "Devices" }).click();
    await page.waitForURL("**/devices");
    await expect(page.getByRole("heading", { name: "Connected displays" })).toBeVisible();

    const deviceCard = page.locator("article").filter({ hasText: "Last seen:" }).first();
    await expect(deviceCard).toContainText("ID:");
    await expect(deviceCard).toContainText("Last seen:");
    await expect(deviceCard).toContainText("Remove device");
  });

  test("admin shows a reload prompt when a newer build is detected", async ({ page }) => {
    await loginAsAdmin(page);

    await page.route("**/", async (route) => {
      const isBuildCheckRequest = route.request().headers()["x-hearth-build-check"] === "1";
      if (!isBuildCheckRequest) {
        await route.fallback();
        return;
      }

      await route.fulfill({
        contentType: "text/html",
        body: `<!doctype html>
<html lang="en">
  <head>
    <link rel="stylesheet" href="/assets/index-updated.css" />
  </head>
  <body>
    <script type="module" src="/assets/index-updated.js"></script>
  </body>
</html>`,
      });
    });

    await page.evaluate(() => {
      window.dispatchEvent(new Event("hearth:check-for-update"));
    });

    await expect(page.getByText("A newer build is available.")).toBeVisible();
    await page.getByRole("button", { name: "Reload now" }).click();
    await page.waitForLoadState("load");
    await expect(page.getByRole("heading", { name: "Layouts" })).toBeVisible();
  });

  test("admin can create a layout", async ({ page }) => {
    const layoutName = `Smoke Layout ${Date.now()}`;

    await loginAsAdmin(page);
    await page.getByLabel("New layout name").fill(layoutName);
    await page.getByRole("button", { name: "Create layout" }).click();

    await expect
      .poll(async () =>
        page
          .locator("article input")
          .evaluateAll(
            (inputs, expectedName) =>
              inputs.some(
                (input) => input instanceof HTMLInputElement && input.value === expectedName,
              ),
            layoutName,
          ),
      )
      .toBe(true);
  });
});
