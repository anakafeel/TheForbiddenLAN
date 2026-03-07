import { test, expect } from './fixtures';

test.describe('Device Status Dashboard', () => {
  // TC006: Dashboard includes the device status table shell.
  test('TC006 — Dashboard renders device status table headers', async ({ authedPage: page }) => {
    await page.goto('/dashboard');

    await expect(page.locator('h1')).toContainText('Dashboard');

    const table = page.locator('table');
    await expect(table).toBeVisible();
    await expect(table.locator('th', { hasText: 'Name' })).toBeVisible();
    await expect(table.locator('th', { hasText: 'Site' })).toBeVisible();
    await expect(table.locator('th', { hasText: 'Status' })).toBeVisible();
  });

  // TC007: Device status values are displayed in the dashboard table.
  test('TC007 — Dashboard shows Online/Offline status values when rows exist', async ({ authedPage: page }) => {
    await page.goto('/dashboard');
    await page.waitForTimeout(2000);

    const rows = page.locator('table tbody tr');
    const rowCount = await rows.count();

    if (rowCount > 0) {
      const statusCells = page.locator('table tbody td:nth-child(3)');
      const statuses = await statusCells.allTextContents();
      expect(statuses.some((status) => status.includes('Online') || status.includes('Offline'))).toBeTruthy();
    } else {
      console.log('[TC007] No devices found in status table');
    }
  });

  // TC008: Device controls are removed with the Devices page.
  test('TC008 — Dashboard does not expose device enable/disable controls', async ({ authedPage: page }) => {
    await page.goto('/dashboard');

    await expect(page.locator('button', { hasText: 'Enable' })).toHaveCount(0);
    await expect(page.locator('button', { hasText: 'Disable' })).toHaveCount(0);
  });

  // TC009: /devices should no longer exist as a dedicated page.
  test('TC009 — /devices redirects to dashboard', async ({ authedPage: page }) => {
    await page.goto('/devices');
    await page.waitForURL('**/dashboard');
    expect(page.url()).toContain('/dashboard');
  });
});
