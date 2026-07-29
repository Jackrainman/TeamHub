import type { FastifyRequest, FastifyReply } from 'fastify';
import type { SessionIdentity, ActorRef, ScheduleSnapshot } from '@teamhub/hub-contracts';
import type { GovStore } from '../store/gov-store.js';

export function firstZodMsg(err: import('zod').ZodError, fallback = 'invalid body'): string {
  return err.issues[0]?.message ?? fallback;
}

export function parseBody<T>(
  schema: { safeParse: (v: unknown) => { success: true; data: T } | { success: false; error: import('zod').ZodError } },
  request: FastifyRequest,
  reply: FastifyReply,
): T | null {
  const parsed = schema.safeParse(request.body ?? {});
  if (!parsed.success) {
    void reply.code(400).send({ detail: firstZodMsg(parsed.error) });
    return null;
  }
  return parsed.data;
}

export function sessionActor(identity: SessionIdentity): ActorRef {
  return { id: identity.memberId, displayName: identity.displayName, source: 'console' };
}

export async function readCsvUpload(
  request: FastifyRequest,
  reply: FastifyReply,
  opts: { maxBytes: number; decode: (buf: Buffer) => string | null },
): Promise<string | null> {
  let data;
  try {
    data = await request.file({ limits: { fileSize: opts.maxBytes, files: 1 } });
  } catch {
    void reply.code(400).send({ detail: '请求体不是 multipart 表单' });
    return null;
  }
  if (!data) {
    void reply.code(400).send({ detail: '未收到文件' });
    return null;
  }
  let buf: Buffer;
  try {
    buf = await data.toBuffer();
  } catch (err) {
    if ((err as { code?: string })?.code === 'FST_REQ_FILE_TOO_LARGE') {
      void reply.code(413).send({ detail: '文件过大（上限 1MB）' });
      return null;
    }
    void reply.code(400).send({ detail: '读取文件失败' });
    return null;
  }
  if (data.file.truncated) {
    void reply.code(413).send({ detail: '文件过大（上限 1MB）' });
    return null;
  }
  const text = opts.decode(buf);
  if (text === null) {
    void reply.code(400).send({ detail: '编码无法识别，请另存为 CSV UTF-8' });
    return null;
  }
  return text;
}

const LOOPBACK_ADDRESSES = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
export function isLoopbackOperator(
  request: { ip: string; socket: { remoteAddress?: string } },
  trustProxy: boolean | string,
): boolean {
  const addr = trustProxy ? request.ip : request.socket.remoteAddress;
  return addr !== undefined && LOOPBACK_ADDRESSES.has(addr);
}

export const SESSION_COOKIE = 'teamhub_session';
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const SESSION_TTL_SECONDS = Math.floor(SESSION_TTL_MS / 1000);

export function readSessionCookie(request: { headers: { cookie?: string } }): string | null {
  const raw = request.headers.cookie;
  if (!raw) return null;
  for (const part of raw.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    if (key === SESSION_COOKIE) {
      const val = part.slice(eq + 1).trim();
      return val.length > 0 ? val : null;
    }
  }
  return null;
}

export function buildSessionCookie(token: string): string {
  return `${SESSION_COOKIE}=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}`;
}

export function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`;
}

export async function buildScheduleSnapshot(store: GovStore): Promise<ScheduleSnapshot> {
  const [snapshot, resources, resourceSessions, relayHandoffs] = await Promise.all([
    store.getSnapshot(),
    store.listResources(),
    store.listResourceSessions(),
    store.listRelayHandoffs(),
  ]);
  return { ...snapshot, resources, resourceSessions, relayHandoffs };
}
