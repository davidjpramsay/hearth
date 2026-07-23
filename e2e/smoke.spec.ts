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

const openAutomaticSwitchingEditor = async (page: Page): Promise<void> => {
  await page.getByRole("tab", { name: "Automatic switching" }).click();
  await page.getByText("Advanced rule editor").first().click();
  await expect(page.getByRole("button", { name: "Time Gate Node" }).first()).toBeVisible();
};

const hasNodeGateCount = (value: unknown, nodeId: string, expectedCount: number): boolean => {
  if (Array.isArray(value)) {
    return value.some((entry) => hasNodeGateCount(entry, nodeId, expectedCount));
  }
  if (!value || typeof value !== "object") {
    return false;
  }

  const record = value as Record<string, unknown>;
  if (
    record.id === nodeId &&
    Array.isArray(record.gates) &&
    record.gates.length === expectedCount
  ) {
    return true;
  }
  return Object.values(record).some((entry) => hasNodeGateCount(entry, nodeId, expectedCount));
};

const buildChoresBoard = (completed: boolean) => ({
  generatedAt: new Date().toISOString(),
  startDate: "2026-07-23",
  days: 1,
  payoutConfig: {
    mode: "all-or-nothing",
    oneOffBonusEnabled: true,
    paydayDayOfWeek: 6,
    siteTimezone: "Australia/Perth",
  },
  members: [
    {
      id: 1,
      name: "Alex",
      avatarUrl: null,
      weeklyAllowance: 5,
      createdAt: "2026-07-23T00:00:00.000Z",
      updatedAt: "2026-07-23T00:00:00.000Z",
    },
  ],
  chores: [
    {
      id: 1,
      name: "Make bed",
      memberId: 1,
      schedule: { type: "daily" },
      startsOn: "2026-07-23",
      valueAmount: 1,
      active: true,
      createdAt: "2026-07-23T00:00:00.000Z",
      updatedAt: "2026-07-23T00:00:00.000Z",
    },
  ],
  board: [
    {
      date: "2026-07-23",
      items: [
        {
          date: "2026-07-23",
          choreId: 1,
          choreName: "Make bed",
          memberId: 1,
          memberName: "Alex",
          memberAvatarUrl: null,
          schedule: { type: "daily" },
          valueAmount: 1,
          completed,
        },
      ],
    },
  ],
  stats: {
    dailyCompletionRate: completed ? 1 : 0,
    weeklyCompletedCount: completed ? 1 : 0,
    weeklyTotalValue: completed ? 1 : 0,
    weeklyByMember: [
      {
        memberId: 1,
        memberName: "Alex",
        memberAvatarUrl: null,
        completedCount: completed ? 1 : 0,
        totalValue: completed ? 1 : 0,
        recurringScheduledCount: 1,
        recurringCompletedCount: completed ? 1 : 0,
        completionRatio: completed ? 1 : 0,
        baseAllowance: 5,
        basePayout: completed ? 5 : 0,
        bonusPayout: 0,
        payoutTotal: completed ? 5 : 0,
      },
    ],
  },
});

test.describe("Hearth smoke", () => {
  test("dashboard opens focused chores and persists a completion", async ({ page }) => {
    let completed = false;
    await page.route("**/api/modules/chores/*/summary*", async (route) => {
      await route.fulfill({ json: buildChoresBoard(completed) });
    });
    await page.route("**/api/modules/chores/*/completions", async (route) => {
      completed = true;
      await route.fulfill({ json: buildChoresBoard(true) });
    });

    await page.goto("/");
    const viewDock = page.getByRole("navigation", { name: "Dashboard views" });
    await expect(viewDock).toBeVisible();
    await viewDock.getByRole("button", { name: "Chores" }).click();
    await expect(page.getByRole("region", { name: "Chores view" })).toBeVisible();

    const choreCheckbox = page.getByRole("checkbox", { name: "Make bed" });
    await expect(choreCheckbox).toBeVisible();
    await choreCheckbox.check();
    await expect(choreCheckbox).toBeChecked();
    await expect.poll(() => completed).toBe(true);

    await page.getByRole("button", { name: "Back to Home" }).click();
    await expect(viewDock.getByRole("button", { name: "Home" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  test("dashboard photo fullscreen closes after five seconds", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("navigation", { name: "Dashboard views" })).toBeVisible();
    await page.evaluate(() => {
      window.dispatchEvent(
        new CustomEvent("hearth:open-photo", {
          detail: { imageUrl: "/icons/icon-512.png", alt: "Family memory" },
        }),
      );
    });

    const fullscreenPhoto = page.getByRole("region", { name: "Fullscreen photo" });
    await expect(fullscreenPhoto).toBeVisible();
    await expect(fullscreenPhoto.getByRole("img", { name: "Family memory" })).toBeVisible();
    await expect(fullscreenPhoto).toBeHidden({ timeout: 6_500 });
  });

  test("admin login survives logout and re-login", async ({ page }) => {
    await loginAsAdmin(page);

    await page.getByRole("button", { name: "Log out" }).click();
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
          bodyText.includes("Chores") ||
          bodyText.includes("No display layout is configured for this screen")
        );
      })
      .toBe(true);

    await loginAsAdmin(page);
    await page.getByRole("button", { name: "Displays" }).click();
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

  test("admin navigation recovers when a lazily loaded page asset is stale", async ({ page }) => {
    await loginAsAdmin(page);

    let failedChoresAsset = false;
    await page.route(/\/assets\/AdminChoresPage-[^/]+\.js(?:\?.*)?$/, async (route) => {
      if (!failedChoresAsset) {
        failedChoresAsset = true;
        await route.abort("failed");
        return;
      }
      await route.continue();
    });

    await page.getByRole("button", { name: "Chores", exact: true }).click();

    await expect.poll(() => failedChoresAsset).toBe(true);
    await page.waitForURL("**/chores");
    await expect(page.getByRole("heading", { name: "Chores" })).toBeVisible();
  });

  test("admin menu switches between family and chores without a refresh", async ({ page }) => {
    await loginAsAdmin(page);

    await page.getByRole("button", { name: "Family", exact: true }).click();
    await page.waitForURL("**/children");
    await expect(page.getByRole("heading", { name: "Family", exact: true })).toBeVisible();

    await page.setViewportSize({ width: 800, height: 900 });
    const sectionMenu = page.locator("select#admin-section-nav");
    await sectionMenu.selectOption("chores");
    await page.waitForURL("**/chores");
    await expect(page.getByRole("heading", { name: "Chores" })).toBeVisible();

    await sectionMenu.selectOption("children");
    await page.waitForURL("**/children");
    await expect(page.getByRole("heading", { name: "Family", exact: true })).toBeVisible();
  });

  test("admin can create a layout", async ({ page }) => {
    const layoutName = `Smoke Layout ${Date.now()}`;

    await loginAsAdmin(page);
    await page.getByRole("button", { name: "+ New layout" }).click();
    await page.getByRole("textbox", { name: "Layout name", exact: true }).fill(layoutName);
    await page.getByRole("button", { name: "Create layout" }).click();

    await expect(page.getByRole("textbox", { name: `Layout name: ${layoutName}` })).toHaveValue(
      layoutName,
    );
  });

  test("admin exposes smart starter designs and clearly grouped settings", async ({ page }) => {
    await loginAsAdmin(page);

    await expect(page.getByRole("heading", { name: "Starter designs" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Edit home view" }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Edit photo view" }).first()).toBeVisible();

    await page.getByRole("button", { name: "Settings" }).click();
    await page.waitForURL("**/connections");
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Household time" })).toBeVisible();

    await page.getByRole("button", { name: "Calendars" }).click();
    await expect(page.getByRole("heading", { name: "Calendar feeds" })).toBeVisible();

    await page.getByRole("button", { name: "Photos" }).click();
    await page.waitForURL("**/admin/layouts?tab=photos");
    await expect(page.getByRole("tab", { name: "Photo sources" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  test("set logic editor connects a time gate to a layout and selects it", async ({ page }) => {
    await loginAsAdmin(page);
    await openAutomaticSwitchingEditor(page);

    const activeEditor = page.locator("details[open]").first();
    await activeEditor.getByRole("button", { name: "Time Gate Node" }).click();
    await activeEditor.getByRole("button", { name: "Layout Node" }).click();
    await activeEditor.getByRole("button", { name: "Fit canvas" }).click();

    const latestTimeGateNode = activeEditor
      .locator(".react-flow__node")
      .filter({ hasText: "Time Gate Node" })
      .last();
    const latestLayoutNode = activeEditor
      .locator(".react-flow__node")
      .filter({ hasText: "Layout" })
      .last();
    const timeGateSource = latestTimeGateNode.locator('[data-handlepos="bottom"]').first();
    const layoutTarget = latestLayoutNode.locator('[data-handlepos="top"]');

    await expect(timeGateSource).toBeInViewport();
    await expect(layoutTarget).toBeInViewport();

    const sourceNodeId = await timeGateSource.getAttribute("data-nodeid");
    const targetNodeId = await layoutTarget.getAttribute("data-nodeid");

    expect(sourceNodeId).not.toBeNull();
    expect(targetNodeId).not.toBeNull();

    const createdEdge = activeEditor.getByRole("group", {
      name: `Edge from ${sourceNodeId} to ${targetNodeId}`,
    });

    // React Flow can miss the first pointer move on a busy CI runner. Retry the
    // real gesture instead of weakening the assertion that an edge was created.
    for (let attempt = 0; attempt < 3 && (await createdEdge.count()) === 0; attempt += 1) {
      const currentSourceBox = await timeGateSource.boundingBox();
      const currentTargetBox = await layoutTarget.boundingBox();
      expect(currentSourceBox).not.toBeNull();
      expect(currentTargetBox).not.toBeNull();

      await page.mouse.move(
        currentSourceBox!.x + currentSourceBox!.width / 2,
        currentSourceBox!.y + currentSourceBox!.height / 2,
      );
      await page.mouse.down();
      await page.mouse.move(
        currentTargetBox!.x + currentTargetBox!.width / 2,
        currentTargetBox!.y + currentTargetBox!.height / 2,
        { steps: 24 },
      );
      await page.mouse.up();
      await page.waitForTimeout(250);
    }

    await expect(createdEdge).toBeAttached();

    await activeEditor
      .locator(`[data-id="${sourceNodeId}"]`)
      .getByRole("heading")
      .click({ force: true });
    await expect(
      activeEditor.getByText("Edit the selected time gate node settings."),
    ).toBeVisible();
  });

  test("set logic editor keeps the graph visible after dragging a node across another node", async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await openAutomaticSwitchingEditor(page);

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
    await openAutomaticSwitchingEditor(page);
    await expect(page.locator(".react-flow__node")).toHaveCount(nodeCountAfterAdd);
  });

  test("set logic editor persists time gate windows after reload", async ({ page }) => {
    await loginAsAdmin(page);
    await openAutomaticSwitchingEditor(page);

    await page.getByRole("button", { name: "Time Gate Node" }).click();
    const activeEditor = page.locator("details[open]").first();
    const latestTimeGateNode = activeEditor
      .locator(".react-flow__node")
      .filter({ hasText: "Time Gate Node" })
      .last();
    const selectedTimeGateNodeId = await latestTimeGateNode.getAttribute("data-id");
    expect(selectedTimeGateNodeId).not.toBeNull();
    await latestTimeGateNode.click({ force: true });
    await expect(page.getByText("Edit the selected time gate node settings.")).toBeVisible();

    const gateCountBefore = await activeEditor.locator("text=/Gate \\d+/").count();
    const settingsSaved = page.waitForResponse((response) => {
      if (
        !response.url().includes("/api/display/screen-profiles") ||
        response.request().method() !== "PUT" ||
        !response.ok()
      ) {
        return false;
      }
      try {
        return hasNodeGateCount(
          response.request().postDataJSON(),
          selectedTimeGateNodeId!,
          gateCountBefore + 1,
        );
      } catch {
        return false;
      }
    });
    await activeEditor.getByRole("button", { name: "Add window" }).click();
    await expect(activeEditor.locator("text=/Gate \\d+/")).toHaveCount(gateCountBefore + 1);
    await settingsSaved;

    await page.reload();
    await openAutomaticSwitchingEditor(page);
    const reloadedEditor = page.locator("details[open]").first();
    const latestTimeGateNodeAfterReload = reloadedEditor.locator(
      `[data-id="${selectedTimeGateNodeId}"]`,
    );
    await expect(latestTimeGateNodeAfterReload).toBeVisible();
    await expect(
      latestTimeGateNodeAfterReload
        .locator("span")
        .filter({ hasText: /^\d{2}:\d{2} - \d{2}:\d{2}$/ }),
    ).toHaveCount(gateCountBefore + 1);
  });
});
