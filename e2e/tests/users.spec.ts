import { test, expect } from './fixtures';

test.describe('User Management', () => {
  // TC016: Open Users page and verify Users view renders
  test('TC016 — Users page renders shell and table area', async ({ authedPage: page }) => {
    await page.goto('/users');

    await expect(page.locator('h1')).toContainText('Users');

    const table = page.locator('table');
    await expect(table).toBeVisible();

    // Column headers
    await expect(table.locator('th', { hasText: 'Username' })).toBeVisible();
    await expect(table.locator('th', { hasText: 'Role' })).toBeVisible();
  });

  // TC017: Users page does not show placeholder/mock user entries by default
  test('TC017 — No placeholder mock entries by default', async ({ authedPage: page }) => {
    await page.goto('/users');
    await page.waitForTimeout(2000);

    // The user list comes from the real backend.
    // We verify the table exists and doesn't contain known mock names
    // like "Alice", "Bob", "Charlie" from the mock presence system.
    const tableText = await page.locator('table tbody').textContent() ?? '';

    // These are the mock user names from socket.js _simulatePresence
    expect(tableText).not.toContain('Alice');
    expect(tableText).not.toContain('Bob');
    expect(tableText).not.toContain('Charlie');
  });
});
