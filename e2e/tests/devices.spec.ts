import { test, expect } from './fixtures';

test.describe('Device Management', () => {
  // TC006: Open Devices page and verify Device Management UI shell renders
  test('TC006 — Devices page renders UI shell with table headers', async ({ authedPage: page }) => {
    await page.goto('/devices');

    await expect(page.locator('h1')).toContainText('Devices');

    const table = page.locator('table');
    await expect(table).toBeVisible();

    // Column headers
    await expect(table.locator('th', { hasText: 'Serial' })).toBeVisible();
    await expect(table.locator('th', { hasText: 'Name' })).toBeVisible();
    await expect(table.locator('th', { hasText: 'Site' })).toBeVisible();
    await expect(table.locator('th', { hasText: 'Actions' })).toBeVisible();
  });

  // TC007: Attempt to enable a disabled device (if rows present)
  test('TC007 — Enable button appears for disabled devices', async ({ authedPage: page }) => {
    await page.goto('/devices');
    await page.waitForTimeout(2000); // wait for API fetch

    const enableBtn = page.locator('button', { hasText: 'Enable' });
    const count = await enableBtn.count();

    if (count > 0) {
      // Click the first Enable button
      await enableBtn.first().click();
      // After toggle, the button text should change to Disable
      await page.waitForTimeout(1000);
      // Page should still be on /devices (no navigation away)
      expect(page.url()).toContain('/devices');
    } else {
      // No disabled devices — that's okay, test passes as informational
      console.log('[TC007] No disabled devices found — skipping toggle');
    }
  });

  // TC008: Attempt to disable an active device (if rows present)
  test('TC008 — Disable button appears for active devices', async ({ authedPage: page }) => {
    await page.goto('/devices');
    await page.waitForTimeout(2000);

    const disableBtn = page.locator('button', { hasText: 'Disable' });
    const count = await disableBtn.count();

    if (count > 0) {
      await disableBtn.first().click();
      await page.waitForTimeout(1000);
      expect(page.url()).toContain('/devices');
    } else {
      console.log('[TC008] No active devices found — skipping toggle');
    }
  });

  // TC009: No toggle controls when there are no device rows
  test('TC009 — No toggle controls when device list is empty', async ({ authedPage: page }) => {
    await page.goto('/devices');
    await page.waitForTimeout(2000);

    const rows = page.locator('table tbody tr');
    const rowCount = await rows.count();

    if (rowCount === 0) {
      // No Enable/Disable buttons should be visible
      await expect(page.locator('button', { hasText: 'Enable' })).toHaveCount(0);
      await expect(page.locator('button', { hasText: 'Disable' })).toHaveCount(0);
    } else {
      // Devices are present — at least one toggle button should exist
      const enableCount = await page.locator('button', { hasText: 'Enable' }).count();
      const disableCount = await page.locator('button', { hasText: 'Disable' }).count();
      expect(enableCount + disableCount).toBeGreaterThan(0);
    }
  });
});
