import { expect, test } from "@playwright/test";

/**
 * End-to-end smoke flow against a running instance with a real database.
 * Never connects real social accounts or publishes anything.
 */
test("landing page renders the hero and CTA", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Say it once.");
  await expect(page.getByRole("link", { name: /get started/i }).first()).toBeVisible();
});

test("protected pages redirect to sign-in", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fdashboard/);
});

test("API rejects unauthenticated and cross-origin requests", async ({ request }) => {
  const unauth = await request.get("/api/v1/content");
  expect(unauth.status()).toBe(401);
  const cross = await request.post("/api/v1/content", { headers: { Origin: "https://evil.example" }, data: {} });
  expect([401, 403]).toContain(cross.status());
});

test("health endpoint reports database status", async ({ request }) => {
  const res = await request.get("/api/health");
  const body = await res.json();
  expect(body.checks.database).toBe("ok");
});

// Onboarding saves workspace, brand voice and profile in sequence; a cold dev server compiles pages on first visit.
test("sign up → onboarding → Get started → save a draft → find it in history", async ({ page }) => {
  test.setTimeout(120_000);
  const email = `e2e-${Date.now()}@example.test`;
  await page.goto("/sign-up");
  await page.getByLabel("Your name").fill("E2E Tester");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("correct-horse-battery");
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page).toHaveURL(/\/onboarding/, { timeout: 30_000 });
  await page.getByRole("button", { name: /continue/i }).click();
  await page.getByRole("button", { name: /continue/i }).click();
  await page.getByRole("button", { name: /enter flowt/i }).click();
  await expect(page).toHaveURL(/\/setup/, { timeout: 30_000 });
  await expect(page.getByRole("heading", { name: /get you posting/i })).toBeVisible();

  await page.goto("/compose");
  await page.getByLabel("Internal label").fill("E2E draft");
  await page.getByLabel(/main content/i).fill("Testing the composer end to end.");
  await page.getByRole("button", { name: /save draft/i }).click();
  await expect(page.getByText("Draft saved")).toBeVisible({ timeout: 30_000 });

  await page.goto("/history?q=E2E");
  await expect(page.getByRole("link", { name: "E2E draft" })).toBeVisible({ timeout: 30_000 });
});
