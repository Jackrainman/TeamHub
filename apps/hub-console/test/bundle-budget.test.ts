import { describe, expect, test } from 'vitest';
import type { OutputBundle, OutputChunk } from 'rollup';
import { inspectBundle } from '../build/bundle-budget';

function chunk(fileName: string, options: Partial<OutputChunk> = {}): OutputChunk {
  return { type: 'chunk', fileName, code: 'export {};', imports: [], dynamicImports: [], modules: {},
    isEntry: false, ...options } as OutputChunk;
}
function bundle(...chunks: OutputChunk[]): OutputBundle {
  return Object.fromEntries(chunks.map(item => [item.fileName, item]));
}
const renderedModule = { code: '', originalLength: 0, removedExports: [], renderedExports: [], renderedLength: 0 };
const pageModules = { 'C:\\repo\\src\\features\\inv\\InvPage.tsx': renderedModule };

describe('production bundle boundaries', () => {
  test('detects a business page hidden behind a shared chunk, including cyclic imports', () => {
    const report = inspectBundle(bundle(
      chunk('entry.js', { isEntry: true, imports: ['shared.js'] }),
      chunk('shared.js', { imports: ['entry.js'], modules: pageModules }),
    ));
    expect(report.violations).toEqual([expect.stringContaining('Eager feature dependency: C:/repo/src/features/inv/InvPage.tsx')]);
    expect(report.initial.files).toHaveLength(2);
  });
  test('allows pages and PDF assets behind dynamic imports', () => {
    const output = bundle(
      chunk('entry.js', { isEntry: true, dynamicImports: ['inv.js'] }),
      chunk('inv.js', { modules: pageModules }),
    );
    output['pdf.worker.mjs'] = { type: 'asset', fileName: 'pdf.worker.mjs', source: 'x'.repeat(1_400_000) } as OutputBundle[string];
    expect(inspectBundle(output).violations).toEqual([]);
    expect(inspectBundle(output).initial.files).toEqual(['entry.js']);
  });
  test('summing initial chunks prevents a vendor split from bypassing the budget', () => {
    const report = inspectBundle(bundle(
      chunk('entry.js', { isEntry: true, code: 'x'.repeat(310_000), imports: ['vendor.js'] }),
      chunk('vendor.js', { code: 'x'.repeat(310_000) }),
    ));
    expect(report.violations).toEqual(['Initial JS 620000 > 600000 bytes']);
  });
  test('checks async chunk size as well as the entry', () => {
    expect(inspectBundle(bundle(chunk('entry.js', { isEntry: true }), chunk('large.js', { code: 'x'.repeat(500_001) }))).violations)
      .toEqual(['Chunk large.js exceeds 500000 bytes']);
  });
  test('blocks eager PDF implementation but permits its URL stub', () => {
    const modules = { '/repo/node_modules/pdfjs-dist/build/pdf.worker.min.mjs?url': renderedModule };
    expect(inspectBundle(bundle(chunk('entry.js', { isEntry: true, modules }))).violations).toEqual([]);
    expect(inspectBundle(bundle(chunk('entry.js', { isEntry: true, modules: {
      '/repo/node_modules/pdfjs-dist/build/pdf.mjs': renderedModule,
    } }))).violations).toEqual([expect.stringContaining('Eager feature dependency')]);
  });
  test('rejects an empty build instead of silently skipping the check', () => {
    expect(inspectBundle({}).violations).toEqual(['No JavaScript entry found']);
  });
  test('counts UTF-8 bytes rather than JavaScript string length', () => {
    const report = inspectBundle(bundle(chunk('entry.js', { isEntry: true, code: '汉'.repeat(170_000) })));
    expect(report.initial.raw).toBe(510_000);
    expect(report.violations).toEqual(['Chunk entry.js exceeds 500000 bytes']);
  });
  test('enforces the gzip budget even when raw sizes are below their limits', () => {
    let seed = 42;
    const bytes = Uint8Array.from({ length: 220_000 }, () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed >>> 24;
    });
    const report = inspectBundle(bundle(chunk('entry.js', { isEntry: true, code: Buffer.from(bytes).toString('base64') })));
    expect(report.initial.raw).toBeLessThan(report.limits.chunkRaw);
    expect(report.violations).toEqual([expect.stringMatching(/^Initial gzip JS \d+ > 180000 bytes$/)]);
  });
});
