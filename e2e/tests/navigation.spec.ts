import { test, expect } from './fixtures';

test.describe('Navigation', () => {
  test('Root URL redirects to /dashboard', async ({ authedPage: page }) => {
    await page.goto('/');
    await page.waitForURL('**/dashboard');
    expect(page.url()).toContain('/dashboard');
  });

  test('Sidebar nav links lead to correct pages', async ({ authedPage: page }) => {
    await page.goto('/dashboard');

    // Sidebar is visible
    await expect(page.locator('nav')).toBeVisible();
    await expect(page.getByText('ForbiddenLAN Admin')).toBeVisible();

    // Navigate via sidebar links
    await page.locator('nav a[href="/talkgroups"]').click();
    await page.waitForURL('**/talkgroups');
    await expect(page.locator('h1')).toContainText('Talkgroups');

    await page.locator('nav a[href="/users"]').click();
    await page.waitForURL('**/users');
    await expect(page.locator('h1')).toContainText('Users');

    await page.locator('nav a[href="/dashboard"]').click();
    await page.waitForURL('**/dashboard');
    await expect(page.locator('h1')).toContainText('Dashboard');
  });

  test('Removed /devices route redirects to /dashboard', async ({ authedPage: page }) => {
    await page.goto('/devices');
    await page.waitForURL('**/dashboard');
    await expect(page.locator('h1')).toContainText('Dashboard');
  });

  test('Sidebar is present on all pages', async ({ authedPage: page }) => {
    for (const path of ['/dashboard', '/talkgroups', '/users']) {
      await page.goto(path);
      await expect(page.locator('nav')).toBeVisible();
      await expect(page.getByText('ForbiddenLAN Admin')).toBeVisible();
    }
  });
});
