import { test, expect } from "@playwright/test";
import {
  connectAndKey,
  freshSession,
  runSyncFromDashboard,
  seed,
  stubControl,
} from "./helpers";

test.describe.configure({ mode: "serial", timeout: 180_000 });

test("onboarding gates sync until Gmail AND a valid key exist; key is masked with no reveal control", async ({
  page,
  request,
}) => {
  await freshSession(page, request);

  // No Gmail, no key: dashboard redirects to onboarding.
  await page.goto("/dashboard");
  await page.waitForURL(/onboarding/);

  // Connect Gmail only , sync must still be disabled.
  await seed(request, "connect-gmail");
  await page.goto("/dashboard");
  await expect(page.getByTestId("start-sync")).toBeDisabled();
  await expect(page.getByTestId("sync-disabled-reason")).toContainText(/API key/i);

  // Add the key through the real settings form (verified against the stub).
  const rawKey = "sk-ant-e2e-entered-key-9f21";
  await page.goto("/settings/api-key");
  await page.getByTestId("api-key-input").fill(rawKey);
  await page.getByTestId("save-api-key").click();
  await expect(page.getByTestId("key-status")).toContainText("Valid", {
    timeout: 60_000,
  });

  // Masked display, and the raw key appears NOWHERE in the DOM.
  await expect(page.getByTestId("masked-key")).toHaveText("sk-ant-••••••••9f21");
  const html = await page.content();
  expect(html).not.toContain("sk-ant-e2e-entered-key");

  // Now sync unlocks.
  await page.goto("/dashboard");
  await expect(page.getByTestId("start-sync")).toBeEnabled();
});

test("a stubbed 401 mid-sync pauses the job, shows the invalid-key banner, and Resume continues after a fixed key", async ({
  page,
  request,
}) => {
  await freshSession(page, request);
  await connectAndKey(page, request);

  // The key dies at classification time.
  await stubControl(request, { anthropicMode: "401" });
  await page.goto("/dashboard");
  await page.getByTestId("start-sync").click();

  await expect(page.getByTestId("key-problem-banner")).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByTestId("key-problem-banner")).toContainText("rejected");
  await expect(page.getByTestId("sync-paused")).toBeVisible();

  // Fix the key (stub back to ok; save a DIFFERENT key so it re-verifies).
  await stubControl(request, { anthropicMode: "ok" });
  await page.goto("/settings/api-key");
  await page.getByTestId("api-key-input").fill("sk-ant-e2e-replacement-77aa");
  await page.getByTestId("save-api-key").click();
  await expect(page.getByTestId("key-status")).toContainText("Valid", {
    timeout: 60_000,
  });

  // Resume picks up from the cursor and completes.
  await page.goto("/dashboard");
  await page.getByTestId("resume-sync").click();
  await expect(page.getByTestId("start-sync")).toBeEnabled({ timeout: 60_000 });

  await page.goto("/applications");
  await expect(page.getByTestId("applications-table")).toContainText("AlphaCo");
});

test("deleting the key keeps extracted applications", async ({ page, request }) => {
  await freshSession(page, request);
  await connectAndKey(page, request);
  await runSyncFromDashboard(page);

  await page.goto("/settings/api-key");
  await page.getByTestId("delete-api-key").click();
  await expect(page.getByTestId("key-message")).toContainText("deleted", {
    timeout: 30_000,
  });

  await page.goto("/applications");
  await expect(page.getByTestId("applications-table")).toContainText("AlphaCo");
  await page.goto("/dashboard");
  await expect(page.getByTestId("start-sync")).toBeDisabled();
});
