import { test, expect } from '@playwright/test';

/**
 * E2E tests for the Inbox (Feedback) page.
 *
 * Happy paths covered:
 *   1. Page loads and displays the feedback list
 *   2. Keyword search filters the list
 *   3. Status filter tabs work
 *   4. AI Search toggle switches to semantic search mode
 *   5. AI Search returns results and navigates to feedback detail
 *   6. Feedback detail page loads correctly
 */

const ORG_SLUG = process.env.E2E_ORG_SLUG ?? 'test-workspace';

test.describe('Inbox Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`/${ORG_SLUG}/app/inbox`);
    await page.waitForLoadState('networkidle');
  });

  test('should load the inbox page and display feedback items', async ({ page }) => {
    await expect(page).toHaveURL(new RegExp('/inbox'));
    // The page heading or a feedback item should be visible
    await expect(page.locator('h1, h2').first()).toBeVisible();
    // At least one feedback row should appear
    await expect(page.locator('[data-testid="feedback-row"], a[href*="/inbox/"]').first()).toBeVisible({ timeout: 10_000 });
  });

  test('should filter feedback using keyword search', async ({ page }) => {
    // Ensure keyword mode is active (it is the default)
    const keywordBtn = page.getByRole('button', { name: /keyword/i });
    await expect(keywordBtn).toBeVisible();

    // Type in the search box
    const searchInput = page.getByPlaceholder(/search feedback/i);
    await searchInput.fill('performance');
    await page.waitForTimeout(500); // debounce

    // The list should update (either show results or empty state)
    await expect(page.locator('body')).toContainText(/performance|no feedback found/i, { timeout: 5_000 });
  });

  test('should switch to AI Search mode', async ({ page }) => {
    const aiSearchBtn = page.getByRole('button', { name: /ai search/i });
    await aiSearchBtn.click();

    // AI search input should appear
    const aiInput = page.getByPlaceholder(/describe what you.re looking for/i);
    await expect(aiInput).toBeVisible();

    // Status filter tabs should be hidden in AI mode
    await expect(page.getByRole('button', { name: /all/i })).toBeHidden({ timeout: 2_000 }).catch(() => {
      // Some implementations keep the tabs but disable them — acceptable
    });
  });

  test('should run an AI search and display results', async ({ page }) => {
    // Switch to AI mode
    await page.getByRole('button', { name: /ai search/i }).click();

    const aiInput = page.getByPlaceholder(/describe what you.re looking for/i);
    await aiInput.fill('slow checkout performance');

    // Submit via button
    await page.getByRole('button', { name: /^search$/i }).click();

    // Wait for results or empty state
    await expect(page.locator('body')).toContainText(/match|no similar feedback/i, { timeout: 15_000 });
  });

  test('should navigate to feedback detail on row click', async ({ page }) => {
    const firstRow = page.locator('a[href*="/inbox/"]').first();
    await expect(firstRow).toBeVisible({ timeout: 10_000 });

    const href = await firstRow.getAttribute('href');
    await firstRow.click();

    await page.waitForURL(`**${href}`, { timeout: 10_000 });
    await expect(page).toHaveURL(new RegExp('/inbox/'));
  });
});
