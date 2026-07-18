import { existsSync } from 'node:fs';
import { mkdir, readdir, rename } from 'node:fs/promises';
import { basename, join } from 'node:path';

/**
 * 转正式（`POST /api/setup/graduate`）的演示数据归档（SETUP-WIZARD 刀③，setup-wizard.md §6.2）。
 *
 * 把五域落盘 JSON + 归档物目录内容整体**挪进**（`rename`，不删除）`archiveDir`——挪走不删、可手工找回。
 * 归档目录与数据目录同盘（`demo-archive-<时间戳>/` 落在数据目录内），故 `rename` 原子且不跨设备。
 *
 * **数据完好纪律**：全程只移动、绝不删除。任一步失败即抛出（调用方据此中止 graduate：不写 config、不重启），
 * 此刻数据完好——已挪的在归档目录、未挪的仍在原位，两处皆可找回，无任何丢失。
 */
export async function archiveDemoData(params: {
  /** 归档落点目录（`<数据目录>/demo-archive-<时间戳>/`）。 */
  archiveDir: string;
  /** 五域落盘文件候选路径（存在的才挪，不存在的静默跳过——某域走内存 / 未配落盘时天然缺席）。 */
  dataFiles: readonly string[];
  /** 归档物文件目录（其**内容**整体挪进 `archiveDir/artifacts/`）；未配 / 不存在则跳过。 */
  artifactDir?: string;
}): Promise<{ archivedFiles: string[]; archivedArtifacts: number }> {
  const { archiveDir, dataFiles, artifactDir } = params;
  await mkdir(archiveDir, { recursive: true });

  const archivedFiles: string[] = [];
  for (const file of dataFiles) {
    if (!existsSync(file)) continue; // 该域未落盘 / 文件缺席：跳过（非错误）。
    await rename(file, join(archiveDir, basename(file)));
    archivedFiles.push(basename(file));
  }

  let archivedArtifacts = 0;
  if (artifactDir && existsSync(artifactDir)) {
    const entries = await readdir(artifactDir);
    if (entries.length > 0) {
      const artifactArchiveDir = join(archiveDir, 'artifacts');
      await mkdir(artifactArchiveDir, { recursive: true });
      for (const entry of entries) {
        await rename(join(artifactDir, entry), join(artifactArchiveDir, entry));
        archivedArtifacts += 1;
      }
    }
  }

  return { archivedFiles, archivedArtifacts };
}
