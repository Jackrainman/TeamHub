import { describe, test, expect, vi, beforeEach } from 'vitest';

vi.mock('execa', () => ({
  execa: vi.fn(),
}));

import { execa } from 'execa';
import {
  cliApi,
  ensureLarkCli,
  resetCliVersionCheck,
} from '../src/cli-bridge';
import { CliBridgeError } from '../src/types';

const execaMock = execa as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  execaMock.mockReset();
  resetCliVersionCheck();
});

describe('ensureLarkCli', () => {
  test('passes when lark --version reports >= MIN major', async () => {
    execaMock.mockResolvedValueOnce({ stdout: 'lark-cli version 1.4.2' });
    await expect(ensureLarkCli()).resolves.toBeUndefined();
    expect(execaMock).toHaveBeenCalledWith('lark-cli', ['--version']);
  });

  test('throws CliBridgeError when lark not on PATH', async () => {
    execaMock.mockRejectedValueOnce(
      Object.assign(new Error('command not found: lark'), { code: 'ENOENT' }),
    );
    await expect(ensureLarkCli()).rejects.toBeInstanceOf(CliBridgeError);
  });

  test('throws CliBridgeError when version below MIN', async () => {
    execaMock.mockResolvedValueOnce({ stdout: 'lark version 0.9.1' });
    await expect(ensureLarkCli()).rejects.toThrow(/required/);
  });

  test('only runs lark --version once across calls (cached)', async () => {
    execaMock.mockResolvedValueOnce({ stdout: 'lark version 1.4.2' });
    await ensureLarkCli();
    await ensureLarkCli();
    expect(execaMock).toHaveBeenCalledOnce();
  });
});

describe('cliApi', () => {
  test('shell-outs lark api <method> with --data JSON payload', async () => {
    execaMock.mockResolvedValueOnce({ stdout: 'lark version 1.4.2' });
    execaMock.mockResolvedValueOnce({ stdout: '{"ok":true,"id":"123"}' });
    const result = await cliApi<{ ok: boolean; id: string }>(
      'im.v1.chat.create',
      { name: 'debug' },
    );
    expect(result).toEqual({ ok: true, id: '123' });
    expect(execaMock).toHaveBeenLastCalledWith('lark-cli', [
      'api',
      'im.v1.chat.create',
      '--data',
      '{"name":"debug"}',
    ]);
  });

  test('wraps execa failure into CliBridgeError with exitCode + stderr', async () => {
    execaMock.mockResolvedValueOnce({ stdout: 'lark version 1.4.2' });
    execaMock.mockRejectedValueOnce(
      Object.assign(new Error('cli boom'), {
        exitCode: 2,
        stderr: 'permission denied',
      }),
    );
    try {
      await cliApi('im.v1.chat.create', {});
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(CliBridgeError);
      expect((err as CliBridgeError).exitCode).toBe(2);
      expect((err as CliBridgeError).stderr).toBe('permission denied');
    }
  });
});
