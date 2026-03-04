import { test, expect } from './fixtures';

test.describe('API Integration (live backend)', () => {
  test('Backend health check — GET /ping returns pong', async ({ request, apiUrl }) => {
    const res = await request.get(`${apiUrl}/ping`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body).toEqual({ pong: true });
  });

  test('Login returns a JWT', async ({ request, apiUrl }) => {
    const username = process.env.E2E_USERNAME ?? 'admin';
    const password = process.env.E2E_PASSWORD ?? 'admin';

    const res = await request.post(`${apiUrl}/auth/login`, {
      data: { username, password },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.jwt).toBeTruthy();
    expect(typeof body.jwt).toBe('string');
  });

  test('GET /devices requires auth (returns 401 without JWT)', async ({ request, apiUrl }) => {
    const res = await request.get(`${apiUrl}/devices`);
    expect(res.status()).toBe(401);
  });

  test('GET /devices returns device list with JWT', async ({ request, apiUrl }) => {
    const username = process.env.E2E_USERNAME ?? 'admin';
    const password = process.env.E2E_PASSWORD ?? 'admin';

    // Login first
    const loginRes = await request.post(`${apiUrl}/auth/login`, {
      data: { username, password },
    });
    const { jwt } = await loginRes.json();

    // Fetch devices
    const res = await request.get(`${apiUrl}/devices`, {
      headers: { Authorization: `Bearer ${jwt}` },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body).toHaveProperty('devices');
    expect(Array.isArray(body.devices)).toBeTruthy();
  });

  test('GET /talkgroups returns talkgroup list with JWT', async ({ request, apiUrl }) => {
    const username = process.env.E2E_USERNAME ?? 'admin';
    const password = process.env.E2E_PASSWORD ?? 'admin';

    const loginRes = await request.post(`${apiUrl}/auth/login`, {
      data: { username, password },
    });
    const { jwt } = await loginRes.json();

    const res = await request.get(`${apiUrl}/talkgroups`, {
      headers: { Authorization: `Bearer ${jwt}` },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body).toHaveProperty('talkgroups');
    expect(Array.isArray(body.talkgroups)).toBeTruthy();
  });

  test('GET /users returns user list with JWT (admin only)', async ({ request, apiUrl }) => {
    const username = process.env.E2E_USERNAME ?? 'admin';
    const password = process.env.E2E_PASSWORD ?? 'admin';

    const loginRes = await request.post(`${apiUrl}/auth/login`, {
      data: { username, password },
    });
    const { jwt } = await loginRes.json();

    const res = await request.get(`${apiUrl}/users`, {
      headers: { Authorization: `Bearer ${jwt}` },
    });
    // May be 200 or 403 depending on user role
    if (res.ok()) {
      const body = await res.json();
      expect(body).toHaveProperty('users');
      expect(Array.isArray(body.users)).toBeTruthy();
    } else {
      expect(res.status()).toBe(403);
    }
  });
});
