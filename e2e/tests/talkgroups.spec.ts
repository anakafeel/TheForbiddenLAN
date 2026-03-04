import { test, expect } from './fixtures';

test.describe('Talkgroup Management', () => {
  // TC010: Open Talkgroups page shows UI even when list is empty
  test('TC010 — Talkgroups page renders even when list is empty', async ({ authedPage: page }) => {
    await page.goto('/talkgroups');

    await expect(page.locator('h1')).toContainText('Talkgroups');

    // Create input and button are always visible
    await expect(page.locator('input[placeholder*="talkgroup"]')).toBeVisible();
    await expect(page.locator('button', { hasText: 'Create' })).toBeVisible();
  });

  // TC011: Create talkgroup with a valid name (happy path)
  test('TC011 — Create talkgroup with a valid name', async ({ authedPage: page }) => {
    await page.goto('/talkgroups');

    const uniqueName = `e2e-test-${Date.now()}`;
    const input = page.locator('input[placeholder*="talkgroup"]');
    const createBtn = page.locator('button', { hasText: 'Create' });

    await input.fill(uniqueName);
    await createBtn.click();

    // Wait for the list to update
    await page.waitForTimeout(2000);

    // The new talkgroup should appear in the list
    await expect(page.getByText(uniqueName)).toBeVisible();

    // Input should be cleared after creation
    await expect(input).toHaveValue('');
  });

  // TC012: Empty name is rejected when creating a talkgroup
  test('TC012 — Empty name is rejected', async ({ authedPage: page }) => {
    await page.goto('/talkgroups');
    await page.waitForTimeout(1000);

    // Count existing talkgroups
    const beforeCount = await page.locator('h3').count();

    const input = page.locator('input[placeholder*="talkgroup"]');
    const createBtn = page.locator('button', { hasText: 'Create' });

    // Leave input empty and click Create
    await input.fill('');
    await createBtn.click();
    await page.waitForTimeout(1000);

    // No new talkgroup should have been added
    const afterCount = await page.locator('h3').count();
    expect(afterCount).toBe(beforeCount);
  });

  // TC013: Whitespace-only name is rejected (edge validation)
  test('TC013 — Whitespace-only name is rejected', async ({ authedPage: page }) => {
    await page.goto('/talkgroups');
    await page.waitForTimeout(1000);

    const beforeCount = await page.locator('h3').count();

    const input = page.locator('input[placeholder*="talkgroup"]');
    const createBtn = page.locator('button', { hasText: 'Create' });

    // Fill with spaces only
    await input.fill('   ');
    await createBtn.click();
    await page.waitForTimeout(1000);

    // No new talkgroup created
    const afterCount = await page.locator('h3').count();
    expect(afterCount).toBe(beforeCount);
  });

  // TC014: Create button does not navigate away from Talkgroups page
  test('TC014 — Create button stays on Talkgroups page', async ({ authedPage: page }) => {
    await page.goto('/talkgroups');

    const createBtn = page.locator('button', { hasText: 'Create' });
    await createBtn.click();

    // Still on talkgroups page
    expect(page.url()).toContain('/talkgroups');
    await expect(page.locator('h1')).toContainText('Talkgroups');
  });
});
