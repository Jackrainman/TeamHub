import type { FastifyInstance, FastifyReply } from 'fastify';
import {
  CreateProjectRequestSchema,
  ProjectResponseSchema,
  ProjectsResponseSchema,
  UpdateProjectRequestSchema,
  type IdentityMode,
} from '@teamhub/hub-contracts';
import { parseBody, requireSuperAdmin } from '../../http/helpers.js';
import type { PmRepository } from './repository.js';
import type { PmOutcome, PmService } from './service.js';

function sendOutcome<T>(
  reply: FastifyReply,
  outcome: PmOutcome<T>,
  render: (value: T) => unknown,
  created = false,
): unknown {
  if (!outcome.ok) {
    void reply.code(outcome.status).send({ detail: outcome.detail });
    return undefined;
  }
  if (created) void reply.code(201);
  return render(outcome.value);
}

/** Project 读对所有过登录闸成员开放；写口沿用 PM 旗标管理员门。 */
export function registerProjectRoutes(
  app: FastifyInstance,
  deps: { store: PmRepository; service: PmService; identityMode: IdentityMode },
): void {
  const { store, service, identityMode } = deps;

  app.get('/api/projects', async () => {
    return ProjectsResponseSchema.parse({ projects: await service.listProjects() });
  });

  app.post('/api/projects', async (request, reply) => {
    const input = parseBody(CreateProjectRequestSchema, request, reply);
    if (!input) return;
    if (identityMode === 'identity') {
      if (!(await requireSuperAdmin(store, request, reply, '该操作需管理员（项目管理旗标）'))) return;
    }
    return sendOutcome(reply, await service.createProject(input, request.identity?.memberId), (project) =>
      ProjectResponseSchema.parse({ project }), true);
  });

  app.put<{ Params: { id: string } }>('/api/projects/:id', async (request, reply) => {
    const input = parseBody(UpdateProjectRequestSchema, request, reply);
    if (!input) return;
    if (identityMode === 'identity') {
      if (!(await requireSuperAdmin(store, request, reply, '该操作需管理员（项目管理旗标）'))) return;
    }
    return sendOutcome(reply, await service.updateProject(request.params.id, input), (project) =>
      ProjectResponseSchema.parse({ project }));
  });
}
