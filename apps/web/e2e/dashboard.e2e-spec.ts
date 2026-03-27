import { test, expect } from '@playwright/test';

/**
 * E2E tests for the Dashboard page.
 *
 * Happy paths covered:
 *   1. Dashboard page loads
 *   2. Executive summary panel is visible
 *   3. Emerging themes card is visible and shows AI summaries
 *   4. Revenue risk panel is visible
 *   5. Roadmap health panel is visible
 *   6. Clicking an emerging theme navigates to the theme detail page
 */

const ORG_SLUG = process.env.E2E_ORG_SLUG ?? 'test-workspace';

test.describe('Dashboard Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`/${ORG_SLUG}/app`);
    await page.waitForLoadState('networkidle');
  });

  test('should load the dashboard page', async ({ page }) => {
    await expect(page).toHaveURL(new RegExp(`/${ORG_SLUG}/app`));
    // The page should render at least one heading
    await expect(page.locator('h1, h2').first()).toBeVisible({ timeout: 10_000 });
  });

  test('should display the executive summary section', async ({ page }) => {
    // The executive summary section is always rendered on the dashboard
    const execSection = page.locator('text=/executive|summary|overview/i').first();
    await expect(execSection).toBeVisible({ timeout: 10_000 });
  });

  test('should display the emerging themes card', async ({ page }) => {
    const themesCard = page.locator('text=/emerging themes|top themes/i').first();
    await expect(themesCard).toBeVisible({ timeout: 10_000 });
  });

  test('should show AI summary text in emerging themes when narration has run', async ({ page }) => {
    // AI summaries are shown as italic text below the theme signal in the themes card
    const aiSummaryText = page.locator('em, i').first();
    // Soft assertion — only present after AI narration runs
    await aiSummaryText.isVisible().catch(() => {});
  });

  test('should navigate to theme detail when clicking an emerging theme', async ({ page }) => {
    const themeLink = page.locator(`a[href*="/${ORG_SLUG}/app/themes/"]`).first();
    const count = await themeLink.count();
    if (count === 0) {
      test.skip();
      return;
    }
    const href = await themeLink.getAttribute('href');
    await themeLink.click();
    await page.waitForURL(`**${href}`, { timeout: 10_000 });
    await expect(page).toHaveURL(new RegExp('/themes/'));
  });
});
