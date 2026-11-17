import { describe, expect, it, vi } from 'vitest';
import { createHubApiClient } from '../src/api/client';

describe('v1 HTTP wiring', () => {
  it('uses only task/session/settings/reimburse endpoints and omits retired request fields', async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/api/tasks')) return new Response(JSON.stringify({ tasks: [], currentWeek: '2026-W47' }));
      if (url.endsWith('/api/reimburse/entries')) return new Response(JSON.stringify({ entries: [] }));
      if (url.endsWith('/api/session')) return new Response(JSON.stringify({ mode: 'identity', session: null }));
      throw new Error(`unexpected request ${url} ${init?.method}`);
    });
    const client = createHubApiClient({ baseUrl: 'http://localhost:4177', fetcher: fetcher as typeof fetch });
    expect(await client.getTasks()).toEqual({ tasks: [], currentWeek: '2026-W47' });
    expect(await client.getReimburseEntries()).toEqual({ entries: [] });
    expect(await client.getSession()).toEqual({ mode: 'identity', session: null });
    const urls = fetcher.mock.calls.map(call => String(call[0]));
    expect(urls).toEqual(['http://localhost:4177/api/tasks', 'http://localhost:4177/api/reimburse/entries', 'http://localhost:4177/api/session']);
    expect(JSON.stringify(fetcher.mock.calls)).not.toMatch(/projects|seasons|inventory|stock-in|knowledge/);
  });
});
