import { test as base, expect, Page } from '@playwright/test';

/**
 * Custom fixtures for ForbiddenLAN E2E tests.
 *
 * - `authedPage`: a Page with a JWT already stored in localStorage
 *   so API calls from the portal don't fail with 401.
 * - `apiUrl`: the backend URL (pulled from env or default).
 */

const API_URL = process.env.E2E_API_URL ?? 'http://134.122.32.45:3000';
const TEST_USER = process.env.E2E_USERNAME ?? 'admin';
const TEST_PASS = process.env.E2E_PASSWORD ?? 'admin';

type Fixtures = {
  authedPage: Page;
  apiUrl: string;
};

export const test = base.extend<Fixtures>({
  apiUrl: [API_URL, { option: true }],

  authedPage: async ({ page, apiUrl }, use) => {
    // Get a real JWT from the backend
    let jwt = 'fake-jwt';
    try {
      const res = await page.request.post(`${apiUrl}/auth/login`, {
        data: { username: TEST_USER, password: TEST_PASS },
      });
      if (res.ok()) {
        const body = await res.json();
        jwt = body.jwt;
      }
    } catch {
      // Backend unreachable — tests that need real data will fail naturally
      console.warn('[e2e] Could not reach backend for JWT — using fake token');
    }

    // Inject JWT into localStorage before navigating
    await page.goto('/');
    await page.evaluate((token) => {
      localStorage.setItem('jwt', token);
    }, jwt);

    await use(page);
  },
});

export { expect };
