import { readFile } from 'node:fs/promises';
import { DeployConfigSchema } from '@teamhub/hub-contracts';
import type { DeployConfig } from '@teamhub/hub-contracts';

/**
 * 部署配置读取（SETUP-WIZARD 刀①，setup-wizard.md §2/§3）。
 *
 * config.json 是模式的唯一真相：存在 → 严格 zod 解析（坏文件 fail-closed 抛错、拒启动，同 gov.json 纪律）；
 * 不存在 → 返回 undefined（main.ts 据此进 setup 模式）。抽成独立函数以便单测 fail-closed 分支，不必 spawn。
 *
 * 「不存在」与「解析失败」严格区分：ENOENT → undefined（首启动向导）；其余读失败 / JSON 坏 / schema 不符
 * → 抛错并在 message 里点明修复路径（修正或删除该文件；删除后重回首启动向导）。
 */
export async function readDeployConfigFile(
  configFile: string,
): Promise<DeployConfig | undefined> {
  let raw: string;
  try {
    raw = await readFile(configFile, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined; // 文件不存在 = 未初始化 → setup 模式
    }
    throw new Error(
      `无法读取部署配置文件（${configFile}）：${(error as Error).message}。` +
        `修复：检查路径 / 权限，或删除该文件后重启（删除后将重新进入首启动向导）。`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(
      `部署配置文件不是合法 JSON（${configFile}）：${(error as Error).message}。` +
        `修复：修正或删除该文件后重启（删除后将重新进入首启动向导）。`,
    );
  }

  const result = DeployConfigSchema.safeParse(parsed);
  if (!result.success) {
    const detail = result.error.issues
      .map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`)
      .join('；');
    throw new Error(
      `部署配置文件校验失败（${configFile}）：${detail}。` +
        `修复：修正或删除该文件后重启（删除后将重新进入首启动向导）。`,
    );
  }
  return result.data;
}
