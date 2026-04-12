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

  test("display registration appears in admin settings", async ({ page }) => {
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
    await page.getByRole("button", { name: "Settings" }).click();
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

  test("set logic editor connects start into a time gate and selects it", async ({ page }) => {
    await loginAsAdmin(page);

    const edgeCountBefore = await page.locator(".react-flow__edge").count();
    await page.getByRole("button", { name: "Time Gate Node" }).click();
    await page.waitForTimeout(300);

    const startHandle = page.locator('[data-nodeid="__start__"][data-handlepos="bottom"]');
    const latestTimeGateTarget = page
      .locator('[data-nodeid^="action-"][data-handlepos="top"]')
      .last();

    const startBox = await startHandle.boundingBox();
    const targetBox = await latestTimeGateTarget.boundingBox();

    expect(startBox).not.toBeNull();
    expect(targetBox).not.toBeNull();

    await page.mouse.move(startBox!.x + startBox!.width / 2, startBox!.y + startBox!.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      targetBox!.x + targetBox!.width / 2,
      targetBox!.y + targetBox!.height / 2,
      { steps: 18 },
    );
    await page.mouse.up();

    await expect
      .poll(async () => page.locator(".react-flow__edge").count())
      .toBeGreaterThan(edgeCountBefore);

    const latestTimeGateNode = page
      .locator(".react-flow__node")
      .filter({ hasText: "Time Gate Node" })
      .last();
    await latestTimeGateNode.click();
    await expect(page.getByText("Edit the selected time gate node settings.")).toBeVisible();
  });

  test("set logic editor keeps the graph visible after dragging a node across another node", async ({
    page,
  }) => {
    await loginAsAdmin(page);

    await page.getByRole("button", { name: "Time Gate Node" }).click();
    await page.getByRole("button", { name: "Layout Node" }).click();
    const nodeCountAfterAdd = await page.locator(".react-flow__node").count();

    const latestTimeGateNode = page
      .locator(".react-flow__node")
      .filter({ hasText: "Time Gate Node" })
      .last();
    const latestLayoutNode = page.locator(".react-flow__node").filter({ hasText: "Layout" }).last();

    const timeGateBox = await latestTimeGateNode.boundingBox();
    const layoutBox = await latestLayoutNode.boundingBox();

    expect(timeGateBox).not.toBeNull();
    expect(layoutBox).not.toBeNull();

    await page.mouse.move(layoutBox!.x + layoutBox!.width / 2, layoutBox!.y + 24);
    await page.mouse.down();
    await page.mouse.move(
      timeGateBox!.x + timeGateBox!.width / 2,
      timeGateBox!.y + timeGateBox!.height / 2,
      { steps: 20 },
    );
    await page.mouse.up();

    await expect(page.locator(".react-flow__node")).toHaveCount(nodeCountAfterAdd);

    await page.reload();
    await expect(page.locator(".react-flow__node")).toHaveCount(nodeCountAfterAdd);
  });

  test("set logic editor persists time gate windows after reload", async ({ page }) => {
    await loginAsAdmin(page);

    await page.getByRole("button", { name: "Time Gate Node" }).click();
    const latestTimeGateNode = page
      .locator(".react-flow__node")
      .filter({ hasText: "Time Gate Node" })
      .last();
    await latestTimeGateNode.click();
    await expect(page.getByText("Edit the selected time gate node settings.")).toBeVisible();

    const gateCountBefore = await page.locator("text=/Gate \\d+/").count();
    await page.getByRole("button", { name: "Add window" }).click();
    await expect(page.locator("text=/Gate \\d+/")).toHaveCount(gateCountBefore + 1);

    await page.reload();
    const latestTimeGateNodeAfterReload = page
      .locator(".react-flow__node")
      .filter({ hasText: "Time Gate Node" })
      .last();
    await latestTimeGateNodeAfterReload.click();
    await expect(page.locator("text=/Gate \\d+/")).toHaveCount(gateCountBefore + 1);
  });
});
