import { test, expect } from "@playwright/test";

test("home page loads", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByText("Statement generation for The Magnus Archives")
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /Start generating/i })
  ).toBeVisible();
});

test("login page loads", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: /Welcome back/i })).toBeVisible();
});
