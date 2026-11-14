import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'vite';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { MockInstance } from 'vitest';

/**
 * translate() 开发期缺失 key 告警（apps/hub-console/src/i18n/translations.ts）。
 *
 * 告警只在最终落到 `?? key` 兜底时触发：租户覆盖命中、当前语言巨表命中、中文回退命中都不算缺失。
 * 去重 Set 是模块级单例（同一 key 每会话只警告一次），因此每个用例都 `vi.resetModules()` 后
 * 重新 import，拿到独立的模块实例——测试间不共享已告警集合，也不为此新增运行时重置 API。
 */

type TranslateModule = typeof import('../src/i18n/translations');

async function loadFreshModule(): Promise<TranslateModule> {
  vi.resetModules();
  return import('../src/i18n/translations');
}

let warnSpy: MockInstance<Parameters<typeof console.warn>, void>;

beforeEach(() => {
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('i18n: 开发期缺失 key 告警', () => {
  test('开发环境：最终兜底为 key 时 console.warn 一次，消息含 key 与当前 lang', async () => {
    // 前置条件：本用例断言的是 DEV 分支，Vitest 默认以 DEV=true 运行源码模块。
    expect(import.meta.env.DEV).toBe(true);
    const { translate } = await loadFreshModule();

    expect(translate('en', 'test.missing.key.alpha')).toBe('test.missing.key.alpha');

    expect(warnSpy).toHaveBeenCalledTimes(1);
    const message = String(warnSpy.mock.calls[0][0]);
    expect(message).toContain('test.missing.key.alpha');
    expect(message).toContain('lang: en');
  });

  test('开发环境：同一 key 重复调用（跨语言）只警告一次，不同 key 各自警告', async () => {
    const { translate } = await loadFreshModule();

    translate('en', 'test.missing.key.dedupe');
    translate('en', 'test.missing.key.dedupe');
    translate('zh', 'test.missing.key.dedupe');
    expect(warnSpy).toHaveBeenCalledTimes(1);

    translate('en', 'test.missing.key.other');
    expect(warnSpy).toHaveBeenCalledTimes(2);
    expect(String(warnSpy.mock.calls[1][0])).toContain('test.missing.key.other');
  });

  test('开发环境：命中的 key 不告警（巨表当前语言 / 租户覆盖 / 中文回退）', async () => {
    const { translate, translations } = await loadFreshModule();
    const { setVocabularyOverrides } = await import('../src/i18n/vocabulary-overrides');

    // 1) 当前语言巨表命中
    expect(translate('zh', 'nav.settings')).toBe('设置');
    // 2) 巨表里不存在的 key 由租户覆盖命中——不是缺失
    setVocabularyOverrides({ 'test.missing.key.covered': { en: 'Covered' } });
    expect(translate('en', 'test.missing.key.covered')).toBe('Covered');
    // 3) 当前语言缺失但中文回退命中——不是缺失（线上 zh/en 键集相同，这里临时删掉 en 词条模拟）
    const fallbackKey = 'common.close';
    const zhValue = translations.zh[fallbackKey];
    delete (translations.en as Record<string, string>)[fallbackKey];
    expect(translate('en', fallbackKey)).toBe(zhValue);

    expect(warnSpy).not.toHaveBeenCalled();
  });

  // 生产路径用「跑一次真正的 Vite 生产构建」来断言，而不是 vi.stubEnv('DEV', false)：
  // 告警守卫按约定写成 `(import.meta as any).env?.DEV`（`as any` 是防御非 ESM 环境所需），
  // 这让 Vitest 无法把该表达式改写成可 stub 的 import.meta.env，`stubEnv` 影响不到源码模块。
  // Vite 又用 process.env.NODE_ENV（测试里是 test）而不是 mode 推导 DEV，所以显式 define 出
  // 生产值——其余（define 替换 + esbuild minify + DCE）与线上构建完全同一条链路。
  test('生产构建（DEV=false）：兜底路径不告警，且告警文案被消除、不进产物', async () => {
    const outDir = mkdtempSync(path.join(tmpdir(), 'teamhub-i18n-prod-'));
    try {
      const entry = fileURLToPath(new URL('../src/i18n/translations.ts', import.meta.url));
      await build({
        configFile: false,
        root: outDir,
        mode: 'production',
        logLevel: 'silent',
        define: { 'import.meta.env.DEV': 'false', 'import.meta.env.PROD': 'true' },
        build: {
          write: true,
          minify: 'esbuild', // 与线上构建一致
          copyPublicDir: false,
          outDir: path.join(outDir, 'out'),
          lib: { entry, formats: ['es'], fileName: () => 'translations.mjs' },
          rollupOptions: { output: { entryFileNames: 'translations.mjs' } },
        },
      });
      const file = path.join(outDir, 'out', 'translations.mjs');
      const code = readFileSync(file, 'utf8');
      // 告警文案必须被构建消除：生产包体不因开发期告警变大。
      expect(code).not.toContain('missing translation key');
      // 兜底断言：告警调用本身也必须被消除，避免措辞改名后上面那条断言变成空断言。
      expect(code).not.toContain('console.warn');

      // 产物在项目根之外，按原生 ESM 加载 → 拿到独立模块实例（不经过 Vitest 转换）。
      const { translate } = (await import(pathToFileURL(file).href)) as TranslateModule;

      expect(translate('en', 'test.missing.key.prod')).toBe('test.missing.key.prod');
      expect(warnSpy).not.toHaveBeenCalled();
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  });
});
