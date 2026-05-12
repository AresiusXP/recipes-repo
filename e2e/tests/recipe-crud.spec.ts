import { test, expect, Page } from "@playwright/test";

/**
 * Recipe CRUD E2E tests.
 *
 * These tests require an authenticated session.
 * Set E2E_SESSION_COOKIE to a valid session token to run these tests.
 */

test.describe("Recipe CRUD", () => {
  test.beforeEach(async ({ context }) => {
    test.skip(!process.env.E2E_SESSION_COOKIE, "No test session cookie — skipping authenticated tests");

    await context.addCookies([
      {
        name: "authjs.session-token",
        value: process.env.E2E_SESSION_COOKIE!,
        domain: new URL(process.env.BASE_URL || "http://localhost:3000").hostname,
        path: "/",
        httpOnly: true,
        secure: false,
      },
    ]);
  });

  test("can view the recipes list", async ({ page }) => {
    await page.goto("/recipes");
    await expect(page).toHaveURL(/\/recipes/);
    // Should show the recipes page (not redirect to login)
    await expect(page.locator("h1, h2").first()).toBeVisible();
  });

  test("can create a new recipe manually", async ({ page }) => {
    await page.goto("/recipes/new");

    // Fill in the recipe form
    await page.fill('[name="title"], input[placeholder*="title" i]', "E2E Test Recipe");
    await page.fill('[name="description"], textarea[placeholder*="description" i]', "A test recipe created by E2E");

    // Submit
    await page.click('button[type="submit"], button:has-text("Save"), button:has-text("Create")');

    // Should redirect to the recipe detail page
    await expect(page).toHaveURL(/\/recipes\/[a-z0-9]+/);
    await expect(page.locator("text=E2E Test Recipe")).toBeVisible();
  });

  test("can edit a recipe", async ({ page }) => {
    // Navigate to recipes list and find the test recipe
    await page.goto("/recipes");

    const recipeLink = page.locator("a, [role='link']").filter({ hasText: "E2E Test Recipe" }).first();
    await expect(recipeLink).toBeVisible({ timeout: 10000 });
    await recipeLink.click();

    // Click edit
    await page.click('a:has-text("Edit"), button:has-text("Edit")');
    await expect(page).toHaveURL(/\/recipes\/[a-z0-9]+\/edit/);

    // Update title
    const titleInput = page.locator('[name="title"], input[placeholder*="title" i]');
    await titleInput.clear();
    await titleInput.fill("E2E Test Recipe (Updated)");

    await page.click('button[type="submit"], button:has-text("Save")');

    await expect(page.locator("text=E2E Test Recipe (Updated)")).toBeVisible();
  });

  test("can delete a recipe", async ({ page }) => {
    await page.goto("/recipes");

    const recipeLink = page.locator("a, [role='link']").filter({ hasText: /E2E Test Recipe/ }).first();
    await expect(recipeLink).toBeVisible({ timeout: 10000 });
    await recipeLink.click();

    // Click delete
    await page.click('button:has-text("Delete")');

    // Confirm deletion if a dialog appears
    const confirmButton = page.locator('button:has-text("Confirm"), button:has-text("Yes"), button:has-text("Delete")').last();
    if (await confirmButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await confirmButton.click();
    }

    // Should redirect to recipes list
    await expect(page).toHaveURL(/\/recipes$/);
    await expect(page.locator("text=E2E Test Recipe (Updated)")).not.toBeVisible();
  });
});
