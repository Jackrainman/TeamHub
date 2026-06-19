import { execa } from 'execa';
import { CliBridgeError } from './types.js';

const MIN_LARK_CLI_MAJOR = 1;

let versionPromise: Promise<void> | null = null;

export function resetCliVersionCheck(): void {
  versionPromise = null;
}

export async function ensureLarkCli(): Promise<void> {
  if (versionPromise) return versionPromise;
  versionPromise = (async () => {
    let stdout: string;
    try {
      // 二进制名是 `lark-cli`（@larksuite/cli 安装的 bin），不是 `lark`——旧写法在装了 cli 的机器上
      // 也会 ENOENT 误报「未安装」。WSL2 实测：`lark-cli --version` → "lark-cli version 1.0.53"。
      const result = await execa('lark-cli', ['--version']);
      stdout = result.stdout;
    } catch (err) {
      versionPromise = null;
      throw new CliBridgeError(
        'lark-cli not found on PATH. Install: npm install -g @larksuite/cli',
        undefined,
        (err as Error).message,
      );
    }
    const match = stdout.match(/(\d+)\.(\d+)\.(\d+)/);
    if (!match || Number(match[1]) < MIN_LARK_CLI_MAJOR) {
      versionPromise = null;
      throw new CliBridgeError(
        `lark-cli >= ${MIN_LARK_CLI_MAJOR}.x required, got "${stdout.trim()}"`,
        undefined,
        '',
      );
    }
  })();
  return versionPromise;
}

export async function cliApi<T = unknown>(
  method: string,
  payload: unknown,
): Promise<T> {
  await ensureLarkCli();
  const args = ['api', method, '--data', JSON.stringify(payload)];
  try {
    const { stdout } = await execa('lark-cli', args);
    return JSON.parse(stdout) as T;
  } catch (err) {
    const e = err as { exitCode?: number; stderr?: string; message: string };
    throw new CliBridgeError(
      `lark api ${method} failed`,
      e.exitCode,
      e.stderr ?? e.message,
    );
  }
}
