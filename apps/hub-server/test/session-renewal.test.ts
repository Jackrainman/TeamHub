import { afterEach, describe, expect, test, vi } from 'vitest';
import { buildTestHubServer } from './support/build-test-hub-server.js';
import { usernameOf } from './support/login-helpers.js';

const DAY = 86_400_000;
afterEach(() => { vi.restoreAllMocks(); });

describe('30-day sliding sessions', () => {
  test.each([false, true])('renews only below half TTL; secure=%s', async (cookieSecure) => {
    let now = Date.now();
    const start = now;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    const app = buildTestHubServer({ identityMode: 'identity', cookieSecure });
    try {
      const login = await app.inject({ method: 'POST', url: '/api/session', payload: { username: usernameOf('m-ecB') } });
      expect(login.statusCode).toBe(200);
      expect(String(login.headers['set-cookie'])).toContain('Max-Age=2592000');
      const token = login.cookies[0].value;
      const headers = { cookie: `teamhub_session=${token}` };
      now = start + 15 * DAY;
      const half = await app.inject({ url: '/api/session', headers });
      expect(half.json().session.memberId).toBe('m-ecB');
      expect(half.headers['set-cookie']).toBeUndefined();
      now += 1;
      const renewed = await app.inject({ url: '/api/session', headers });
      expect(renewed.json().session.memberId).toBe('m-ecB');
      expect(renewed.cookies).toHaveLength(1);
      expect(renewed.cookies[0].value).toBe(token);
      const cookie = String(renewed.headers['set-cookie']);
      for (const attr of ['HttpOnly', 'Path=/', 'SameSite=Lax', 'Max-Age=2592000']) expect(cookie).toContain(attr);
      expect(cookie.includes('; Secure')).toBe(cookieSecure);
      const repeated = await app.inject({ url: '/api/session', headers });
      expect(repeated.headers['set-cookie']).toBeUndefined();
      now = start + 30 * DAY;
      expect((await app.inject({ url: '/api/session', headers })).json().session.memberId).toBe('m-ecB');
      now = start + 45 * DAY + 1;
      const expired = await app.inject({ url: '/api/session', headers });
      expect(expired.json().session).toBeNull();
      expect(expired.headers['set-cookie']).toBeUndefined();
    } finally { await app.close(); }
  });

  test('login and logout override a renewal cookie from the incoming session', async () => {
    let now = Date.now();
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    const app = buildTestHubServer({ identityMode: 'identity', cookieSecure: true });
    const payload = { username: usernameOf('m-ecB') };
    try {
      const first = await app.inject({ method: 'POST', url: '/api/session', payload });
      now += 16 * DAY;
      const second = await app.inject({ method: 'POST', url: '/api/session', payload,
        headers: { cookie: `teamhub_session=${first.cookies[0].value}` } });
      expect(second.statusCode).toBe(200);
      expect(second.cookies).toHaveLength(1);
      expect(second.cookies[0].value).not.toBe(first.cookies[0].value);
      const headers = { cookie: `teamhub_session=${second.cookies[0].value}` };
      expect((await app.inject({ url: '/api/session', headers })).json().session.memberId).toBe('m-ecB');
      now += 16 * DAY;
      const out = await app.inject({ method: 'DELETE', url: '/api/session', headers });
      expect(out.cookies).toHaveLength(1);
      expect(String(out.headers['set-cookie'])).toContain('Max-Age=0');
      expect(out.cookies[0].value).toBe('');
      expect((await app.inject({ url: '/api/session', headers })).json().session).toBeNull();
    } finally { await app.close(); }
  });
});
