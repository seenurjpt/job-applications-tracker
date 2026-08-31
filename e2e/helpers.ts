import { expect, type APIRequestContext, type Page } from "@playwright/test";

export const E2E_EMAIL = "e2e@example.com";

export async function seed(
  request: APIRequestContext,
  op: string,
  extra: Record<string, unknown> = {}
): Promise<Record<string, unknown>> {
  const res = await request.post("/api/test/seed", {
    data: { op, email: E2E_EMAIL, ...extra },
  });
  expect(res.ok()).toBeTruthy();
  return (await res.json()) as Record<string, unknown>;
}

export async function stubControl(
  request: APIRequestContext,
  body: Record<string, unknown>
): Promise<void> {
  const res = await request.post("http://localhost:3101/__control", { data: body });
  expect(res.ok()).toBeTruthy();
}

export async function signInE2E(page: Page): Promise<void> {
  await page.goto("/signin");
  await page.getByTestId("e2e-email").fill(E2E_EMAIL);
  await page.getByTestId("e2e-signin").click();
  await page.waitForURL(/\/(onboarding|dashboard)/, { timeout: 60_000 });
}

/** Fresh state for a test: wipe DB, reset stub, sign in. */
export async function freshSession(page: Page, request: APIRequestContext) {
  await stubControl(request, { anthropicMode: "ok", reseed: true });
  await seed(request, "reset");
  await signInE2E(page);
}

export async function connectAndKey(page: Page, request: APIRequestContext) {
  await seed(request, "connect-gmail");
  await seed(request, "seed-key");
}

export async function runSyncFromDashboard(page: Page): Promise<void> {
  await page.goto("/dashboard");
  const button = page.getByTestId("start-sync");
  await expect(button).toBeEnabled({ timeout: 30_000 });
  await button.click();
  // E2E mode runs the backfill inline inside the action , when the page
  // settles the sync is done.
  await expect(page.getByTestId("start-sync")).toBeEnabled({ timeout: 60_000 });
}
