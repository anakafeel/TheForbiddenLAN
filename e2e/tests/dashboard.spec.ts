import { test, expect } from './fixtures';

test.describe('Dashboard Overview', () => {
  // TC001: Dashboard loads and shows all overview stat cards
  test('TC001 — Dashboard loads and shows all overview stat cards', async ({ authedPage: page }) => {
    await page.goto('/dashboard');

    // Page title
    await expect(page.locator('h1')).toContainText('Dashboard');

    // Three stat cards
    await expect(page.getByText('Devices Online')).toBeVisible();
    await expect(page.getByText('Total Devices')).toBeVisible();
    await expect(page.getByText('Active Talkgroups')).toBeVisible();

    // Device status table header
    await expect(page.locator('table')).toBeVisible();
  });

  // TC002: Active Talkgroups stat shows the hardcoded placeholder value
  test('TC002 — Active Talkgroups stat shows hardcoded placeholder', async ({ authedPage: page }) => {
    await page.goto('/dashboard');

    await expect(page.getByText('Active Talkgroups')).toBeVisible();
    // The "—" dash placeholder value
    await expect(page.getByText('—')).toBeVisible();
    // Other cards still present
    await expect(page.getByText('Devices Online')).toBeVisible();
    await expect(page.getByText('Total Devices')).toBeVisible();
  });

  // TC003: Device status table shows expected column headers
  test('TC003 — Device status table shows expected column headers', async ({ authedPage: page }) => {
    await page.goto('/dashboard');

    const table = page.locator('table');
    await expect(table).toBeVisible();

    // Column headers
    await expect(table.locator('th', { hasText: 'Name' })).toBeVisible();
    await expect(table.locator('th', { hasText: 'Site' })).toBeVisible();
    await expect(table.locator('th', { hasText: 'Status' })).toBeVisible();
  });

  // TC004: Dashboard remains usable when device data is empty
  test('TC004 — Dashboard remains usable when device data is empty', async ({ authedPage: page }) => {
    await page.goto('/dashboard');

    // Stat cards still render even without backend data
    await expect(page.getByText('Devices Online')).toBeVisible();
    await expect(page.getByText('Total Devices')).toBeVisible();
    await expect(page.getByText('Active Talkgroups')).toBeVisible();
    await expect(page.locator('table')).toBeVisible();

    // Still on the dashboard URL
    expect(page.url()).toContain('/dashboard');
  });
});
