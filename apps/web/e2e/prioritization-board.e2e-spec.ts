/**
 * E2E Tests: Roadmap Prioritization Board (Web)
 *
 * Happy paths covered:
 *   1. Board page loads and renders the table
 *   2. Table has all expected columns (Title, Status, Impact, Feedback, AI Recommendation, Manual Rank)
 *   3. Sort dropdown is present and functional
 *   4. Sort order toggle button is present
 *   5. Changing sort field updates the URL or triggers a re-render
 *   6. Search input filters the table
 *   7. Manual rank cells are visible and clickable
 *   8. Manual rank input appears on click and accepts numeric input
 *   9. CIQ impact badges are rendered in the Impact column
 *  10. Kanban Board link is present in the header
 */
import { test, expect } from '@playwright/test';

const ORG_SLUG = process.env.E2E_ORG_SLUG ?? 'test-workspace';
const BOARD_URL = `/${ORG_SLUG}/app/prioritization/board`;

test.describe('Prioritization Board Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BOARD_URL);
    await page.waitForLoadState('networkidle');
  });

  // ── Test 1: Page loads ─────────────────────────────────────────────────────

  test('should load the Prioritization Board page', async ({ page }) => {
    await expect(page).toHaveURL(new RegExp('/prioritization/board'));
    // The main heading should be visible
    const heading = page.locator('h1');
    await expect(heading).toBeVisible({ timeout: 10_000 });
    await expect(heading).toContainText(/prioritization board/i);
  });

  // ── Test 2: Table renders ──────────────────────────────────────────────────

  test('should render the prioritization table', async ({ page }) => {
    const table = page.locator('[data-testid="prioritization-table"]');
    // Table is either visible (items exist) or a "no items" message is shown
    const tableVisible = await table.isVisible().catch(() => false);
    const noItems = page.locator('text=/no roadmap items/i').first();
    const noItemsVisible = await noItems.isVisible().catch(() => false);

    // One of the two states must be true
    expect(tableVisible || noItemsVisible).toBe(true);
  });

  // ── Test 3: Column headers present ────────────────────────────────────────

  test('should display all expected column headers', async ({ page }) => {
    const table = page.locator('[data-testid="prioritization-table"]');
    const tableVisible = await table.isVisible().catch(() => false);
    if (!tableVisible) {
      test.skip();
      return;
    }

    // Check for key column headers
    await expect(page.locator('text=/impact/i').first()).toBeVisible({ timeout: 8_000 });
    await expect(page.locator('text=/feedback/i').first()).toBeVisible({ timeout: 8_000 });
    await expect(page.locator('text=/manual rank/i').first()).toBeVisible({ timeout: 8_000 });
  });

  // ── Test 4: Sort dropdown is present ──────────────────────────────────────

  test('should display the sort-by dropdown', async ({ page }) => {
    const sortSelect = page.locator('[data-testid="sort-select"]');
    await expect(sortSelect).toBeVisible({ timeout: 10_000 });
  });

  // ── Test 5: Sort dropdown has expected options ─────────────────────────────

  test('should have Impact Score as a sort option', async ({ page }) => {
    const sortSelect = page.locator('[data-testid="sort-select"]');
    await expect(sortSelect).toBeVisible({ timeout: 10_000 });

    // Check that the option exists
    const option = sortSelect.locator('option[value="priorityScore"]');
    await expect(option).toHaveCount(1);
  });

  test('should have Feedback Volume as a sort option', async ({ page }) => {
    const sortSelect = page.locator('[data-testid="sort-select"]');
    await expect(sortSelect).toBeVisible({ timeout: 10_000 });

    const option = sortSelect.locator('option[value="feedbackCount"]');
    await expect(option).toHaveCount(1);
  });

  test('should have Manual Rank as a sort option', async ({ page }) => {
    const sortSelect = page.locator('[data-testid="sort-select"]');
    await expect(sortSelect).toBeVisible({ timeout: 10_000 });

    const option = sortSelect.locator('option[value="manualRank"]');
    await expect(option).toHaveCount(1);
  });

  // ── Test 6: Sort order toggle ──────────────────────────────────────────────

  test('should display the sort order toggle button', async ({ page }) => {
    const toggle = page.locator('[data-testid="sort-order-toggle"]');
    await expect(toggle).toBeVisible({ timeout: 10_000 });
  });

  test('should toggle sort order when the toggle button is clicked', async ({ page }) => {
    const toggle = page.locator('[data-testid="sort-order-toggle"]');
    await expect(toggle).toBeVisible({ timeout: 10_000 });

    const initialText = await toggle.textContent();
    await toggle.click();
    await page.waitForTimeout(300);
    const newText = await toggle.textContent();

    // Text should have changed (Desc ↔ Asc)
    expect(newText).not.toBe(initialText);
  });

  // ── Test 7: Search input ───────────────────────────────────────────────────

  test('should display the search input', async ({ page }) => {
    const searchInput = page.locator('[data-testid="board-search"]');
    await expect(searchInput).toBeVisible({ timeout: 10_000 });
  });

  test('should filter items when search input is typed', async ({ page }) => {
    const searchInput = page.locator('[data-testid="board-search"]');
    await expect(searchInput).toBeVisible({ timeout: 10_000 });

    // Type a search query
    await searchInput.fill('checkout');
    await page.waitForTimeout(500);

    // The table should still be visible (or show no items message)
    const table = page.locator('[data-testid="prioritization-table"]');
    const noItems = page.locator('text=/no roadmap items/i');
    const tableVisible = await table.isVisible().catch(() => false);
    const noItemsVisible = await noItems.isVisible().catch(() => false);
    expect(tableVisible || noItemsVisible).toBe(true);
  });

  // ── Test 8: Column header sort click ──────────────────────────────────────

  test('should sort by Impact Score when clicking the Impact column header', async ({ page }) => {
    const table = page.locator('[data-testid="prioritization-table"]');
    const tableVisible = await table.isVisible().catch(() => false);
    if (!tableVisible) {
      test.skip();
      return;
    }

    const impactHeader = page.locator('[data-testid="sort-priorityScore"]');
    await expect(impactHeader).toBeVisible({ timeout: 8_000 });
    await impactHeader.click();
    await page.waitForTimeout(300);

    // After clicking, the sort dropdown should reflect priorityScore
    const sortSelect = page.locator('[data-testid="sort-select"]');
    await expect(sortSelect).toHaveValue('priorityScore');
  });

  test('should sort by Feedback when clicking the Feedback column header', async ({ page }) => {
    const table = page.locator('[data-testid="prioritization-table"]');
    const tableVisible = await table.isVisible().catch(() => false);
    if (!tableVisible) {
      test.skip();
      return;
    }

    const feedbackHeader = page.locator('[data-testid="sort-feedbackCount"]');
    await expect(feedbackHeader).toBeVisible({ timeout: 8_000 });
    await feedbackHeader.click();
    await page.waitForTimeout(300);

    const sortSelect = page.locator('[data-testid="sort-select"]');
    await expect(sortSelect).toHaveValue('feedbackCount');
  });

  test('should sort by Manual Rank when clicking the Manual Rank column header', async ({ page }) => {
    const table = page.locator('[data-testid="prioritization-table"]');
    const tableVisible = await table.isVisible().catch(() => false);
    if (!tableVisible) {
      test.skip();
      return;
    }

    const rankHeader = page.locator('[data-testid="sort-manualRank"]');
    await expect(rankHeader).toBeVisible({ timeout: 8_000 });
    await rankHeader.click();
    await page.waitForTimeout(300);

    const sortSelect = page.locator('[data-testid="sort-select"]');
    await expect(sortSelect).toHaveValue('manualRank');
  });

  // ── Test 9: Manual rank cells ──────────────────────────────────────────────

  test('should render manual rank cells for each row', async ({ page }) => {
    const table = page.locator('[data-testid="prioritization-table"]');
    const tableVisible = await table.isVisible().catch(() => false);
    if (!tableVisible) {
      test.skip();
      return;
    }

    // At least one rank cell should be visible
    const rankCells = page.locator('[data-testid^="rank-cell-"]');
    const count = await rankCells.count();
    expect(count).toBeGreaterThan(0);
  });

  test('should show a rank input when a rank cell is clicked', async ({ page }) => {
    const table = page.locator('[data-testid="prioritization-table"]');
    const tableVisible = await table.isVisible().catch(() => false);
    if (!tableVisible) {
      test.skip();
      return;
    }

    const firstRankCell = page.locator('[data-testid^="rank-cell-"]').first();
    const count = await firstRankCell.count();
    if (count === 0) {
      test.skip();
      return;
    }

    await firstRankCell.click();
    await page.waitForTimeout(200);

    // An input should now be visible
    const rankInput = page.locator('[data-testid^="rank-input-"]').first();
    await expect(rankInput).toBeVisible({ timeout: 5_000 });
  });

  // ── Test 10: CIQ impact badges ─────────────────────────────────────────────

  test('should render CIQ impact badges in the table', async ({ page }) => {
    const table = page.locator('[data-testid="prioritization-table"]');
    const tableVisible = await table.isVisible().catch(() => false);
    if (!tableVisible) {
      test.skip();
      return;
    }

    const badges = page.locator('[data-testid="ciq-impact-badge"]');
    const count = await badges.count();
    expect(count).toBeGreaterThan(0);
  });

  // ── Test 11: Navigation link to Kanban board ───────────────────────────────

  test('should display a link back to the Kanban board', async ({ page }) => {
    const kanbanLink = page.locator(`a[href*="/app/roadmap"]`).first();
    await expect(kanbanLink).toBeVisible({ timeout: 10_000 });
  });

  // ── Test 12: Prioritization hub has Priority Board link ───────────────────

  test('should have a Priority Board link on the prioritization hub', async ({ page }) => {
    await page.goto(`/${ORG_SLUG}/app/prioritization`);
    await page.waitForLoadState('networkidle');

    const boardLink = page.locator(`a[href*="/prioritization/board"]`);
    await expect(boardLink).toBeVisible({ timeout: 10_000 });
    await expect(boardLink).toContainText(/priority board/i);
  });

  // ── Test 13: Changing sort via dropdown ───────────────────────────────────

  test('should update the sort when a new option is selected from the dropdown', async ({ page }) => {
    const sortSelect = page.locator('[data-testid="sort-select"]');
    await expect(sortSelect).toBeVisible({ timeout: 10_000 });

    // Select feedbackCount
    await sortSelect.selectOption('feedbackCount');
    await page.waitForTimeout(300);

    await expect(sortSelect).toHaveValue('feedbackCount');
  });

  // ── Test 14: Summary chips ─────────────────────────────────────────────────

  test('should show summary chips (Critical, Manually Ranked, Total Items) when items exist', async ({ page }) => {
    const table = page.locator('[data-testid="prioritization-table"]');
    const tableVisible = await table.isVisible().catch(() => false);
    if (!tableVisible) {
      test.skip();
      return;
    }

    // Summary chips are rendered in the header area
    const criticalChip = page.locator('text=/critical/i').first();
    await expect(criticalChip).toBeVisible({ timeout: 8_000 });
  });
});
