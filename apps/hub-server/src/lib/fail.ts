import type { FastifyReply } from 'fastify';
import { ERROR_STATUS, type ErrorCode } from '@teamhub/hub-contracts';

export function fail(
  reply: FastifyReply,
  code: ErrorCode,
  opts: {
    status?: number;
    detail: string;
    fields?: Readonly<Record<string, unknown>>;
  },
): FastifyReply {
  const body: { code: ErrorCode; detail: string; fields?: Readonly<Record<string, unknown>> } = {
    code,
    detail: opts.detail,
  };
  if (opts.fields) body.fields = opts.fields;
  return reply.code(opts.status ?? ERROR_STATUS[code]).send(body);
}
