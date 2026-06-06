import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import type { FastifyReply, FastifyRequest } from 'fastify';

const MIME_TYPES: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webp': 'image/webp',
};

export async function tryServeStaticConsole(
  request: FastifyRequest,
  reply: FastifyReply,
  rootDir: string | undefined,
): Promise<boolean> {
  if (!rootDir || (request.method !== 'GET' && request.method !== 'HEAD')) {
    return false;
  }

  const pathname = parseRequestPath(request.url);
  if (!pathname || pathname === '/api' || pathname.startsWith('/api/')) {
    return false;
  }

  const root = path.resolve(rootDir);
  const directPath = resolveAssetPath(root, pathname);
  if (directPath && (await isFile(directPath))) {
    await sendFile(reply, directPath, request.method === 'HEAD');
    return true;
  }

  if (path.extname(pathname) !== '') {
    return false;
  }

  const indexPath = resolveAssetPath(root, '/index.html');
  if (!indexPath || !(await isFile(indexPath))) {
    return false;
  }

  await sendFile(reply, indexPath, request.method === 'HEAD');
  return true;
}

function parseRequestPath(url: string): string | null {
  try {
    const pathname = new URL(url, 'http://teamhub.local').pathname;
    const decoded = decodeURIComponent(pathname);
    return decoded.includes('\0') ? null : decoded;
  } catch {
    return null;
  }
}

function resolveAssetPath(root: string, pathname: string): string | null {
  const relativePath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const candidate = path.resolve(root, relativePath);
  return isWithinRoot(root, candidate) ? candidate : null;
}

function isWithinRoot(root: string, candidate: string): boolean {
  return candidate === root || candidate.startsWith(`${root}${path.sep}`);
}

async function isFile(filePath: string): Promise<boolean> {
  try {
    return (await stat(filePath)).isFile();
  } catch {
    return false;
  }
}

async function sendFile(
  reply: FastifyReply,
  filePath: string,
  headOnly: boolean,
): Promise<void> {
  const ext = path.extname(filePath);
  reply.type(MIME_TYPES[ext] ?? 'application/octet-stream');
  reply.header(
    'cache-control',
    filePath.includes(`${path.sep}assets${path.sep}`)
      ? 'public, max-age=31536000, immutable'
      : 'no-cache',
  );

  if (headOnly) {
    void reply.send();
    return;
  }

  void reply.send(await readFile(filePath));
}
