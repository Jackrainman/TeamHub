import { afterAll, describe, expect, test } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';
import {
  CreateTaskResponseSchema,
  governanceScenarioFixture,
} from '@teamhub/hub-contracts';

/**
 * 端到端实测（A4，模型 = feiyue `scripts/feiyue-solver/e2e.sh`：驱动**真产物**、断言**内容往返**）。
 *
 * 与同目录其它测试的本质区别：它们用进程内 `app.inject`（不过 HTTP、不落真盘、不真重启）。本测试 spawn
 * 真实入口 `src/main.ts`（经 tsx，与 `npm run dev` / `dist/main.js` 同一套 env→FileGovStore/FileKbStore
 * 落盘 + 真 HTTP 路径），并**真杀进程再重启**——这是 `app.inject` 证不了、也正是 A1 那类「start 脚本漏接
 * 落盘 env → 重启清空」bug 唯一能被逮住的层。断言 issueId / 任务 / 边**跨真实 reload 存活**，不是 length / 200。
 */

const here = dirname(fileURLToPath(import.meta.url));
const serverRoot = join(here, '..');
const tsxBin = join(serverRoot, 'node_modules', '.bin', 'tsx');
const mainTs = join(serverRoot, 'src', 'main.ts');

// projectId 对齐 seed 快照 projectId，避免（可能的）按 projectId 过滤把 e2e 任务排除在 dep-graph 外。
const PROJECT_ID = governanceScenarioFixture.projectId;

const procs = new Set<ChildProcess>();
const tmpDirs: string[] = [];

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      srv.close(() => resolve(port));
    });
  });
}

async function startServer(
  env: Record<string, string>,
  port: number,
): Promise<ChildProcess> {
  const proc = spawn(tsxBin, [mainTs], {
    cwd: serverRoot,
    env: {
      ...process.env,
      // SETUP-WIZARD 刀①：模式类 env 已退役，dataMode/identityMode 走预置 config.json（见 makeDataDir，
      // dataMode='real' = 空板，完全受控、断言确定）。TEAMHUB_CONFIG_FILE 随各 test 的 env 传入。
      HUB_HOST: '127.0.0.1',
      HUB_PORT: String(port),
      ...env,
    },
    stdio: 'pipe',
  });
  procs.add(proc);
  let stderr = '';
  proc.stderr?.on('data', (d) => (stderr += String(d)));
  proc.once('exit', () => procs.delete(proc));

  const deadline = Date.now() + 25_000;
  while (Date.now() < deadline) {
    if (proc.exitCode !== null) {
      throw new Error(`server exited early (code ${proc.exitCode}): ${stderr}`);
    }
    try {
      const r = await fetch(`http://127.0.0.1:${port}/health`);
      if (r.ok) return proc;
    } catch {
      // 还没起来
    }
    await delay(200);
  }
  throw new Error(`server did not become healthy on ${port}: ${stderr}`);
}

async function stopServer(proc: ChildProcess): Promise<void> {
  if (proc.exitCode !== null) return;
  await new Promise<void>((resolve) => {
    proc.once('exit', () => resolve());
    proc.kill('SIGTERM');
  });
}

async function makeDataDir(): Promise<{
  gov: string;
  kb: string;
  config: string;
}> {
  const dir = await mkdtemp(join(tmpdir(), 'teamhub-e2e-'));
  tmpDirs.push(dir);
  // SETUP-WIZARD 刀①：预置 config.json（dataMode='real' 空板 + 匿名），起服即进正常模式、跳过向导，
  // 断言完全受控。TEAMHUB_CONFIG_FILE 指向此文件（各 test 的 env 传入）。
  const config = join(dir, 'config.json');
  await writeFile(
    config,
    JSON.stringify({
      schemaVersion: 1,
      dataMode: 'real',
      identityMode: 'anonymous',
      initializedAt: '2026-07-18T00:00:00.000Z',
    }),
    'utf8',
  );
  return { gov: join(dir, 'gov.json'), kb: join(dir, 'kb.json'), config };
}

afterAll(async () => {
  for (const p of procs) await stopServer(p);
  for (const d of tmpDirs) await rm(d, { recursive: true, force: true });
});

const post = (
  port: number,
  path: string,
  body: unknown,
  headers: Record<string, string> = {},
) =>
  fetch(`http://127.0.0.1:${port}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });

// fetch().json() 在 node 类型下返回 unknown；e2e 只需读字段，标 any 让下游 helper 接收（非生产代码）。
const getJson = async (port: number, path: string): Promise<any> =>
  (await fetch(`http://127.0.0.1:${port}${path}`)).json();

// 一个独特症状的历史 bug 卡（与 seed 语料不撞，便于断言召回的就是这条）
const probeIssue = {
  id: 'iss-e2e-probe',
  projectId: PROJECT_ID,
  title: 'E2E 探针·编码器丢步',
  rawInput: 'E2E 探针 编码器丢步',
  normalizedSummary: 'E2E 探针 编码器丢步 唯一症状',
  symptomSummary: 'E2E 探针 编码器丢步',
  suspectedDirections: ['编码器线序'],
  suggestedActions: ['查线序'],
  status: 'investigating' as const,
  severity: 'medium' as const,
  tags: ['e2e', '编码器'],
  relatedFiles: [],
  relatedCommits: [],
  relatedHistoricalIssueIds: [],
  createdAt: '2026-06-15T00:00:00.000Z',
  updatedAt: '2026-06-15T00:00:00.000Z',
};

function taskBody(title: string) {
  return {
    projectId: PROJECT_ID,
    groupId: 'grp-e2e',
    title,
    rawSummary: title,
    ownerId: null,
    collaboratorIds: [] as string[],
    robotTarget: 'R1' as const,
    intrinsicComplexity: 'normal' as const,
  };
}

const hasIssue = (body: { items: { issueId: string }[] }, id: string) =>
  body.items.some((i) => i.issueId === id);
const titlesOf = (body: { tasks: { title: string }[] }) =>
  body.tasks.map((t) => t.title);
const hasEdge = (
  body: { edges: { source: string; target: string }[] },
  from: string,
  to: string,
) => body.edges.some((e) => e.source === from && e.target === to);

describe('e2e: 真 HTTP + 真落盘 + 真重启（驱动 src/main.ts）', () => {
  test('KB 结案 → 杀进程重启 → 同症状仍召回（FileKbStore 跨真实 reload 存活）', async () => {
    const { gov, kb, config } = await makeDataDir();
    const env = {
      TEAMHUB_GOV_DATA_FILE: gov,
      TEAMHUB_KB_DATA_FILE: kb,
      TEAMHUB_CONFIG_FILE: config,
    };
    const recallUrl =
      '/api/kb/similar?symptom=' +
      encodeURIComponent(probeIssue.symptomSummary) +
      '&minScore=0';

    const port1 = await freePort();
    const s1 = await startServer(env, port1);
    expect(hasIssue(await getJson(port1, recallUrl), probeIssue.id)).toBe(false);

    const closeout = await post(port1, '/api/kb/closeout', {
      issue: probeIssue,
      category: '编码器',
      rootCause: 'E2E 线序错',
      resolution: 'E2E 重接线序',
    });
    expect(closeout.status).toBe(201);
    expect(hasIssue(await getJson(port1, recallUrl), probeIssue.id)).toBe(true);
    await stopServer(s1);

    // 真重启（新进程、同落盘文件）→ 仍召回，证 FileKbStore 落盘 + reload
    const port2 = await freePort();
    const s2 = await startServer(env, port2);
    expect(hasIssue(await getJson(port2, recallUrl), probeIssue.id)).toBe(true);
    await stopServer(s2);
  }, 60_000);

  test('PM 建任务+依赖 → 杀进程重启 → 任务与边存活（FileGovStore 跨真实 reload）', async () => {
    const { gov, kb, config } = await makeDataDir();
    const env = {
      TEAMHUB_GOV_DATA_FILE: gov,
      TEAMHUB_KB_DATA_FILE: kb,
      TEAMHUB_CONFIG_FILE: config,
    };

    const port1 = await freePort();
    const s1 = await startServer(env, port1);
    // 用 hub-contracts 的响应契约解析（替代不安全强转）：响应格式变更会在此提前报错，
    // 同时 idA/idB 的类型由 schema 推导而非手写 cast。
    const a = CreateTaskResponseSchema.parse(
      await (await post(port1, '/api/tasks', taskBody('E2E 上游任务'))).json(),
    );
    const b = CreateTaskResponseSchema.parse(
      await (await post(port1, '/api/tasks', taskBody('E2E 下游任务'))).json(),
    );
    const idA = a.task.id;
    const idB = b.task.id;

    const dep = await post(port1, '/api/dependencies', {
      projectId: PROJECT_ID,
      fromTaskId: idA,
      toTaskId: idB,
      type: 'blocks',
      source: 'human',
      confirmedBy: { id: 'console-e2e', displayName: 'E2E', source: 'console' },
    });
    expect(dep.status).toBe(201);
    expect(hasEdge(await getJson(port1, '/api/dep-graph'), idA, idB)).toBe(true);
    await stopServer(s1);

    // 真重启 → 任务与边都在
    const port2 = await freePort();
    const s2 = await startServer(env, port2);
    const titles = titlesOf(await getJson(port2, '/api/tasks'));
    expect(titles).toContain('E2E 上游任务');
    expect(titles).toContain('E2E 下游任务');
    expect(hasEdge(await getJson(port2, '/api/dep-graph'), idA, idB)).toBe(true);
    await stopServer(s2);
  }, 60_000);

  test('H3：配 TEAMHUB_WRITE_TOKEN 后，写端点无 Bearer→401、带 Bearer→201、读端点不受限', async () => {
    const { gov, kb, config } = await makeDataDir();
    const token = 'e2e-secret-token';
    const env = {
      TEAMHUB_GOV_DATA_FILE: gov,
      TEAMHUB_KB_DATA_FILE: kb,
      TEAMHUB_CONFIG_FILE: config,
      TEAMHUB_WRITE_TOKEN: token,
    };
    const port = await freePort();
    const s = await startServer(env, port);

    expect((await post(port, '/api/tasks', taskBody('未鉴权任务'))).status).toBe(401);
    expect(
      (
        await post(port, '/api/tasks', taskBody('已鉴权任务'), {
          authorization: `Bearer ${token}`,
        })
      ).status,
    ).toBe(201);

    // 读端点无 Bearer 也放行；只有鉴权过的那条落了库
    const titles = titlesOf(await getJson(port, '/api/tasks'));
    expect(titles).toContain('已鉴权任务');
    expect(titles).not.toContain('未鉴权任务');
    await stopServer(s);
  }, 60_000);
});
