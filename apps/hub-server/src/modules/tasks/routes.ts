import type { FastifyInstance, FastifyReply } from 'fastify';
import {
  ClaimTaskRequestSchema, ClaimTaskResponseSchema, CompleteTaskRequestSchema, CompleteTaskResponseSchema,
  CreateTaskRequestSchema, CreateTaskResponseSchema, LinkTaskWeekRequestSchema,
  ReviewTaskRequestSchema, ReviewTaskResponseSchema, SelfReportTaskRequestSchema,
  TasksQuerySchema, TasksResponseSchema, TransitionTaskStatusRequestSchema, TransitionTaskStatusResponseSchema,
  UpdateSelfTaskRequestSchema,
} from '@teamhub/hub-contracts';
import type { ActorRef, IdentityMode, MemberPublic } from '@teamhub/hub-contracts';
import { parseBody, parseQuery, requireActor, sessionActor } from '../../http/helpers.js';
import { fail } from '../../lib/fail.js';
import type { TaskOutcome, TasksService } from './service.js';
import type { TaskDirectoryPort } from './public.js';

function present<T>(reply: FastifyReply, outcome: TaskOutcome<T>, render: (value: T) => unknown, created = false) {
  if (!outcome.ok) return fail(reply, outcome.code, { status: outcome.status, detail: outcome.detail });
  if (created) void reply.code(201);
  return render(outcome.value);
}
export interface TaskRouteDeps {
  service: TasksService;
  directory: TaskDirectoryPort;
  identityMode: IdentityMode;
}
export function registerTaskRoutes(app: FastifyInstance, deps: TaskRouteDeps): void {
  const { service, directory } = deps;
  app.get('/api/tasks', async (request, reply) => {
    const query = parseQuery(TasksQuerySchema, request, reply);
    if (!query) return;
    const actor = request.identity ? sessionActor(request.identity) : undefined;
    return TasksResponseSchema.parse({
      tasks: service.listTasks(query, actor), currentWeek: service.currentWeek(), today: service.today(),
    });
  });
  app.post('/api/tasks', async (request, reply) => {
    const input = parseBody(CreateTaskRequestSchema, request, reply);
    if (!input) return;
    const actor = requireActor(request, reply, undefined, '创建任务须先登录');
    if (!actor) return;
    return present(reply, service.createTask(input, actor), (task) => CreateTaskResponseSchema.parse({ task }), true);
  });
  app.post('/api/weeks/:weekKey/tasks', async (request, reply) => {
    if (!request.identity) return fail(reply, 'SESSION_REQUIRED', { status: 403, detail: '请先登录后新建任务' });
    const input = parseBody(SelfReportTaskRequestSchema, request, reply);
    if (!input) return;
    const { weekKey } = request.params as { weekKey: string };
    return present(reply, service.selfReportTask(weekKey, input, sessionActor(request.identity)),
      (task) => CreateTaskResponseSchema.parse({ task }), true);
  });
  app.post('/api/tasks/:taskId/edit', async (request, reply) => {
    const input = parseBody(UpdateSelfTaskRequestSchema, request, reply);
    if (!input) return;
    const actor = requireActor(request, reply, undefined, '编辑任务须先登录');
    if (!actor) return;
    const { taskId } = request.params as { taskId: string };
    return present(reply, service.editSelfTask(taskId, input, actor), (task) => CreateTaskResponseSchema.parse({ task }));
  });
  app.post('/api/tasks/:taskId/weeks', async (request, reply) => {
    if (!request.identity) return fail(reply, 'SESSION_REQUIRED', { status: 403, detail: '请先登录后延续任务' });
    const input = parseBody(LinkTaskWeekRequestSchema, request, reply);
    if (!input) return;
    const { taskId } = request.params as { taskId: string };
    return present(reply, service.linkTaskWeek(taskId, input.weekKey, sessionActor(request.identity)),
      (task) => CreateTaskResponseSchema.parse({ task }));
  });
  app.post('/api/tasks/:taskId/claim', async (request, reply) => {
    const input = parseBody(ClaimTaskRequestSchema, request, reply);
    if (!input) return;
    let actor: ActorRef | null = request.identity ? sessionActor(request.identity) : null;
    if (!actor && input.memberId) {
      const member: MemberPublic | undefined = directory.listMembers().find((item) => item.id === input.memberId);
      actor = member ? { id: member.id, displayName: member.displayName, source: 'console' } : null;
    }
    if (!actor) return fail(reply, 'SESSION_REQUIRED', { status: 403, detail: '认领须先登录或选择本人' });
    const { taskId } = request.params as { taskId: string };
    return present(reply, service.claimTask(taskId, actor, input.weekKey), (task) => ClaimTaskResponseSchema.parse({ task }));
  });
  app.post('/api/tasks/:taskId/status', async (request, reply) => {
    const input = parseBody(TransitionTaskStatusRequestSchema, request, reply);
    if (!input) return;
    const actor = requireActor(request, reply, input.by, '状态流转必须留名');
    if (!actor) return;
    const { taskId } = request.params as { taskId: string };
    return present(reply, service.transitionTaskStatus(taskId, input.status, actor, input.expectedRevision),
      (task) => TransitionTaskStatusResponseSchema.parse({ task }));
  });
  app.post('/api/tasks/:taskId/complete', async (request, reply) => {
    const input = parseBody(CompleteTaskRequestSchema, request, reply);
    if (!input) return;
    const actor = requireActor(request, reply, input.completedBy, '完成必须留名');
    if (!actor) return;
    const { taskId } = request.params as { taskId: string };
    return present(reply, service.completeTask(taskId, actor), (task) => CompleteTaskResponseSchema.parse({ task }));
  });
  app.post('/api/tasks/:taskId/review', async (request, reply) => {
    const input = parseBody(ReviewTaskRequestSchema, request, reply);
    if (!input) return;
    const actor = requireActor(request, reply, input.reviewedBy, '验收必须留名');
    if (!actor) return;
    const { taskId } = request.params as { taskId: string };
    return present(reply, service.reviewTask(taskId, actor, input), (task) => ReviewTaskResponseSchema.parse({ task }));
  });
}
