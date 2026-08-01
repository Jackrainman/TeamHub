import { z } from 'zod';

export type FetchLike = typeof fetch;

export interface HttpContext {
  baseUrl: string;
  fetcher: FetchLike;
  writeToken?: string;
}

export const DeletedResponseSchema = z.object({ deleted: z.string().min(1) });

export function normalizeBaseUrl(value: string | undefined): string {
  const trimmed = value?.trim();
  if (!trimmed || trimmed === '/') {
    return '';
  }
  return trimmed.replace(/\/+$/, '');
}

export async function fetchJson<T>(
  url: string,
  schema: { parse(value: unknown): T },
  fetcher: FetchLike,
): Promise<T> {
  const response = await fetcher(url);
  if (!response.ok) {
    const detail = await readDetail(response);
    throw new Error(
      detail ? `${response.status}: ${detail}` : `Hub API ${response.status}: ${url}`,
    );
  }
  return schema.parse(await response.json());
}

export function postJson<T>(
  url: string,
  body: unknown,
  schema: { parse(value: unknown): T },
  fetcher: FetchLike,
  writeToken?: string,
): Promise<T> {
  return sendJson('POST', url, body, schema, fetcher, writeToken);
}

export async function sendJson<T>(
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  url: string,
  body: unknown,
  schema: { parse(value: unknown): T },
  fetcher: FetchLike,
  writeToken?: string,
): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (writeToken) headers.authorization = `Bearer ${writeToken}`;
  const response = await fetcher(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    const detail = await readDetail(response);
    throw new Error(
      detail ? `${response.status}: ${detail}` : `Hub API ${response.status}: ${url}`,
    );
  }
  return schema.parse(await response.json());
}

export async function postFormData<T>(
  url: string,
  file: File,
  schema: { parse(value: unknown): T },
  fetcher: FetchLike,
  writeToken?: string,
): Promise<T> {
  const form = new FormData();
  form.append('file', file);
  const headers: Record<string, string> = {};
  if (writeToken) headers.authorization = `Bearer ${writeToken}`;
  const response = await fetcher(url, { method: 'POST', headers, body: form });
  if (!response.ok) {
    const detail = await readDetail(response);
    throw new Error(
      detail ? `${response.status}: ${detail}` : `Hub API ${response.status}: ${url}`,
    );
  }
  return schema.parse(await response.json());
}

export async function postMultiFormData<T>(
  url: string,
  files: readonly File[],
  schema: { parse(value: unknown): T },
  fetcher: FetchLike,
  writeToken?: string,
): Promise<T> {
  const form = new FormData();
  for (const file of files) form.append('files', file);
  const headers: Record<string, string> = {};
  if (writeToken) headers.authorization = `Bearer ${writeToken}`;
  const response = await fetcher(url, { method: 'POST', headers, body: form });
  if (!response.ok) {
    const detail = await readDetail(response);
    throw new Error(
      detail ? `${response.status}: ${detail}` : `Hub API ${response.status}: ${url}`,
    );
  }
  return schema.parse(await response.json());
}

async function readDetail(response: Response): Promise<string | null> {
  try {
    const body = (await response.json()) as { detail?: unknown };
    return typeof body.detail === 'string' ? body.detail : null;
  } catch {
    return null;
  }
}
