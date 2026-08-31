import { test, expect } from "@playwright/test";
import {
  connectAndKey,
  freshSession,
  runSyncFromDashboard,
  seed,
} from "./helpers";

test.describe.configure({ mode: "serial", timeout: 180_000 });

test("sign in → connect Gmail (stubbed) → sync → applications appear", async ({
  page,
  request,
}) => {
  await freshSession(page, request);

  // Onboarding shows the 3-step checklist; sync is gated until all steps done.
  await page.goto("/onboarding");
  await expect(page.getByTestId("onboarding-step-2")).toBeVisible();
  await expect(page.getByTestId("connect-gmail")).toBeVisible();

  await connectAndKey(page, request);
  await runSyncFromDashboard(page);

  await page.goto("/applications");
  const table = page.getByTestId("applications-table");
  await expect(table).toContainText("AlphaCo");
  await expect(table).toContainText("BetaCorp");
  await expect(table).toContainText("GammaSoft");
  await expect(table).not.toContainText("Lunch tomorrow");
});

test("date range preset updates the URL and back restores the previous view", async ({
  page,
  request,
}) => {
  await freshSession(page, request);
  await connectAndKey(page, request);
  await seed(request, "seed-applications", { count: 5 });

  await page.goto("/applications");
  await expect(page.getByTestId("app-row-0")).toBeVisible();

  await page.getByTestId("range-filter").selectOption("last_week");
  await expect(page).toHaveURL(/range=last_week/);

  await page.getByTestId("status-filter").selectOption("needs_follow_up");
  await expect(page).toHaveURL(/status=needs_follow_up/);
  await expect(page).toHaveURL(/range=last_week/);

  await page.goBack();
  await expect(page).toHaveURL(/range=last_week/);
  await expect(page).not.toHaveURL(/status=needs_follow_up/);

  await page.goBack();
  await expect(page).not.toHaveURL(/range=last_week/);
});

test("sorting by applied date works in both directions", async ({ page, request }) => {
  await freshSession(page, request);
  await connectAndKey(page, request);
  await seed(request, "seed-applications", { count: 4 });

  await page.goto("/applications?sortBy=appliedAt&sortDir=asc");
  const firstAsc = await page.getByTestId("applied-at-0").innerText();
  const lastAsc = await page.getByTestId("applied-at-3").innerText();
  expect(new Date(firstAsc).getTime()).toBeLessThanOrEqual(new Date(lastAsc).getTime());

  await page.getByTestId("sort-applied").click();
  await expect(page).toHaveURL(/sortDir=desc/);
  const firstDesc = await page.getByTestId("applied-at-0").innerText();
  expect(new Date(firstDesc).getTime()).toBeGreaterThanOrEqual(
    new Date(firstAsc).getTime()
  );
});

test("select three rows → generate drafts → review → confirm → three drafts recorded", async ({
  page,
  request,
}) => {
  await freshSession(page, request);
  await connectAndKey(page, request);
  await seed(request, "seed-applications", { count: 3 });

  await page.goto("/applications");
  for (let i = 0; i < 3; i++) {
    await page.getByTestId(`select-row-${i}`).check();
  }
  await expect(page.getByTestId("bulk-bar")).toContainText("3 selected");
  await page.getByTestId("bulk-generate").click();

  await expect(page.getByTestId("bulk-review-modal")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("bulk-row-2")).toBeVisible();

  await page.getByTestId("bulk-confirm").click();
  for (let i = 0; i < 3; i++) {
    await expect(page.getByTestId(`bulk-row-state-${i}`)).toHaveText(
      "created in Gmail",
      { timeout: 60_000 }
    );
  }
});

test("needs_reconnect shows the banner and disables sync", async ({ page, request }) => {
  await freshSession(page, request);
  await connectAndKey(page, request);
  await seed(request, "set-account-status", { status: "needs_reconnect" });

  await page.goto("/dashboard");
  await expect(page.getByTestId("reconnect-banner")).toBeVisible();
  await expect(page.getByTestId("reconnect-banner")).toContainText("expired");
  await expect(page.getByTestId("start-sync")).toBeDisabled();
});

test("an inline company edit survives a subsequent sync", async ({ page, request }) => {
  await freshSession(page, request);
  await connectAndKey(page, request);
  await runSyncFromDashboard(page);

  await page.goto("/applications?sortBy=company&sortDir=asc");
  const firstRow = page.getByTestId("app-row-0");
  await expect(firstRow).toContainText("AlphaCo");

  // Inline edit: click the company cell, type, commit with Enter.
  await firstRow.locator("button[data-testid^='cell-company-']").click();
  const input = page.locator("input[data-testid^='edit-company-']");
  await input.fill("Alpha Cooperative (edited)");
  await input.press("Enter");
  await expect(page.getByTestId("applications-table")).toContainText(
    "Alpha Cooperative (edited)"
  );

  // Sync again , the edit must survive (userEditedFields).
  await runSyncFromDashboard(page);
  await page.goto("/applications");
  await expect(page.getByTestId("applications-table")).toContainText(
    "Alpha Cooperative (edited)"
  );
  await expect(page.getByTestId("applications-table")).not.toContainText(/^AlphaCo$/);
});
