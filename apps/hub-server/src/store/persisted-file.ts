import { mkdir, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

/**
 * 原子落盘文件：串行写链 + tmp→rename 原子写 + H2 失败隔离。
 * 三份落盘文件（governance.json / resources.json / schedule-sessions.json）共用本类，
 * 消除此前 persist/writeOnce/persistOrRollback × 3 = 9 个逐条镜像函数。
 */
export class PersistedFile {
  private writeChain: Promise<void> = Promise.resolve();

  constructor(
    private readonly filePath: string,
    private readonly serialize: () => string | Promise<string>,
  ) {}

  get path(): string {
    return this.filePath;
  }

  async persist(): Promise<void> {
    const op = this.writeChain.then(() => this.writeOnce());
    this.writeChain = op.catch(() => undefined);
    return op;
  }

  async persistOrRollback(rollback: () => void): Promise<void> {
    try {
      await this.persist();
    } catch (err) {
      rollback();
      throw err;
    }
  }

  private async writeOnce(): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.tmp`;
    const content = await this.serialize();
    try {
      await writeFile(tmp, content, 'utf8');
      await rename(tmp, this.filePath);
    } catch (err) {
      await unlink(tmp).catch(() => {});
      throw err;
    }
  }
}
