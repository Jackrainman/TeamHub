#!/usr/bin/env node
//
// RobotTarget 去渗透（HUB-MODULARIZATION §5 第4步）数据迁移脚本：
// hub-contracts 把 `Task.robotTarget` / `Project.robotTargets` 由必填改 `.optional()`，
// 新增中性泛化槽 `Task.targetLabel?: string`（Project 侧对应 `targetLabels?: string[]`，暂无消费点，
// 见 pm-core.ts 注释）。既有落盘 gov.json 里的旧记录只有 robotTarget/robotTargets，本脚本把它
// **回填**到新字段——**双写**（robotTarget/robotTargets 原样保留，不删除、不改语义），
// 只是把值也复制一份到 targetLabel/targetLabels，供未来"泛化标签"读路径（toDepGraphView 等）
// 优先读取。
//
// ⚠️ **必须在有真实落盘数据的部署机（WSL2 测试机）上对真实 ~/teamhub-data/gov.json 执行**，
// 本仓本机（无 node_modules，纯静态编辑环境）未跑过、未见过真实 gov.json 内容——
// 执行前后都建议先跑 scripts/backup-teamhub-data.sh 留一份可读回校验的快照，
// 执行完人工核验 diff（尤其 --dry-run 输出的计数是否与预期任务数吻合），确认零字段丢失后再重启服务。
//
// 幂等：已存在 targetLabel（且值等于 robotTarget）的记录跳过，不重复写、不覆盖人工已改的 targetLabel。
//
// 用法：
//   node scripts/migrate-robottarget.mjs [gov.json 路径] [--dry-run]
//   TEAMHUB_GOV_DATA_FILE=/path/to/gov.json node scripts/migrate-robottarget.mjs --dry-run
//
// 退出码：0 = 成功（含 dry-run）；非零 = 读取/解析/写入失败（不静默吞错，防止"看起来跑完了但没生效"）。

import { readFile, writeFile, rename } from 'node:fs/promises';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const positional = args.filter((a) => a !== '--dry-run');
const filePath = resolve(
  positional[0] ?? process.env.TEAMHUB_GOV_DATA_FILE ?? `${process.env.HOME ?? ''}/teamhub-data/gov.json`,
);

function migrateTaskRecord(task) {
  if (task == null || typeof task !== 'object') return false;
  if (typeof task.robotTarget !== 'string') return false; // 无旧字段，无需回填
  if (task.targetLabel === task.robotTarget) return false; // 已回填过，幂等跳过
  task.targetLabel = task.robotTarget; // 双写：robotTarget 原样保留
  return true;
}

function migrateProjectRecord(project) {
  if (project == null || typeof project !== 'object') return false;
  if (!Array.isArray(project.robotTargets)) return false;
  const same =
    Array.isArray(project.targetLabels) &&
    project.targetLabels.length === project.robotTargets.length &&
    project.targetLabels.every((v, i) => v === project.robotTargets[i]);
  if (same) return false; // 幂等跳过
  project.targetLabels = [...project.robotTargets]; // 双写：robotTargets 原样保留
  return true;
}

async function main() {
  let raw;
  try {
    raw = await readFile(filePath, 'utf8');
  } catch (err) {
    console.error(`[migrate-robottarget] 读取失败：${filePath} — ${err.message}`);
    process.exitCode = 1;
    return;
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    console.error(`[migrate-robottarget] JSON 解析失败：${filePath} — ${err.message}`);
    process.exitCode = 1;
    return;
  }

  let taskCount = 0;
  if (Array.isArray(data.tasks)) {
    for (const task of data.tasks) {
      if (migrateTaskRecord(task)) taskCount += 1;
    }
  }

  // Project 目前未进 GovernanceSnapshot（未落盘、无消费点，见 pm-core.ts 注释）；这里防御式处理
  // 仅为未来若接线落盘时不遗漏——真实 gov.json today 大概率没有 `projects` 键，属安全 no-op。
  let projectCount = 0;
  if (Array.isArray(data.projects)) {
    for (const project of data.projects) {
      if (migrateProjectRecord(project)) projectCount += 1;
    }
  }

  console.log(
    `[migrate-robottarget] ${filePath}：待回填 tasks=${taskCount}、projects=${projectCount}${dryRun ? '（dry-run，未写盘）' : ''}`,
  );

  if (dryRun) return;

  if (taskCount === 0 && projectCount === 0) {
    console.log('[migrate-robottarget] 无需写盘（无待迁移记录，或已迁移过/幂等跳过）。');
    return;
  }

  const tmp = `${filePath}.tmp`;
  try {
    await writeFile(tmp, JSON.stringify(data, null, 2), 'utf8');
    await rename(tmp, filePath);
  } catch (err) {
    console.error(`[migrate-robottarget] 写盘失败：${filePath} — ${err.message}`);
    process.exitCode = 1;
    return;
  }
  console.log('[migrate-robottarget] 写盘完成。请人工核验 gov.json diff 后再重启服务。');
}

await main();
