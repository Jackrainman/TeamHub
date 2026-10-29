import { gzipSync } from 'node:zlib';
import type { OutputBundle, OutputChunk } from 'rollup';
import type { Plugin } from 'vite';

// 限制整个同步依赖图，避免仅拆 vendor 就绕过首屏预算。按 UTF-8 字节计量，1 kB = 1000 bytes。
const INITIAL_RAW_LIMIT = 600_000;
const INITIAL_GZIP_LIMIT = 180_000;
const CHUNK_RAW_LIMIT = 500_000;

export function inspectBundle(bundle: OutputBundle) {
  const chunks = Object.values(bundle).filter((item): item is OutputChunk => item.type === 'chunk');
  const byName = new Map(chunks.map(chunk => [chunk.fileName, chunk]));
  const initial = new Set<OutputChunk>();
  const visit = (chunk: OutputChunk) => {
    if (initial.has(chunk)) return;
    initial.add(chunk);
    for (const name of chunk.imports) {
      const dependency = byName.get(name);
      if (dependency) visit(dependency);
    }
  };
  const entries = chunks.filter(chunk => chunk.isEntry);
  for (const entry of entries) visit(entry);
  const sizes = (items: Iterable<OutputChunk>) => [...items].reduce((total, chunk) => ({
    raw: total.raw + Buffer.byteLength(chunk.code),
    gzip: total.gzip + gzipSync(chunk.code).byteLength,
  }), { raw: 0, gzip: 0 });
  const size = sizes(initial);
  const violations: string[] = [];
  if (!entries.length) violations.push('No JavaScript entry found');
  for (const chunk of initial) {
    for (const id of Object.keys(chunk.modules)) {
      // ?url 仅保存资源地址，并不把 worker 字节带入同步下载。
      if (/[?&]url(?:&|$)/.test(id)) continue;
      const normalized = id.replace(/\\/g, '/').split('?')[0];
      if (/\/src\/features\/.*(?:Page|SetupWizard|BootstrapGate)\.tsx$/.test(normalized)
        || /\/node_modules\/(?:pdfjs-dist|@xyflow|@dagrejs)\//.test(normalized)) {
        violations.push(`Eager feature dependency: ${normalized} (via ${chunk.fileName})`);
      }
    }
  }
  if (size.raw > INITIAL_RAW_LIMIT) violations.push(`Initial JS ${size.raw} > ${INITIAL_RAW_LIMIT} bytes`);
  if (size.gzip > INITIAL_GZIP_LIMIT) violations.push(`Initial gzip JS ${size.gzip} > ${INITIAL_GZIP_LIMIT} bytes`);
  for (const chunk of chunks) {
    if (Buffer.byteLength(chunk.code) > CHUNK_RAW_LIMIT) {
      violations.push(`Chunk ${chunk.fileName} exceeds ${CHUNK_RAW_LIMIT} bytes`);
    }
  }
  return {
    initial: { ...size, files: [...initial].map(chunk => chunk.fileName) },
    limits: { initialRaw: INITIAL_RAW_LIMIT, initialGzip: INITIAL_GZIP_LIMIT, chunkRaw: CHUNK_RAW_LIMIT },
    chunks: chunks.map(chunk => ({ file: chunk.fileName, ...sizes([chunk]) })),
    violations,
  };
}

export function bundleBudgetPlugin(): Plugin {
  return {
    name: 'teamhub-bundle-budget',
    apply: 'build',
    generateBundle: { order: 'post', handler(_options, bundle) {
      const report = inspectBundle(bundle);
      if (report.violations.length) this.error(report.violations.join('\n'));
      this.info(`Initial JS: ${(report.initial.raw / 1000).toFixed(2)} kB / gzip ${(report.initial.gzip / 1000).toFixed(2)} kB`);
      this.emitFile({ type: 'asset', fileName: 'bundle-report.json', source: JSON.stringify(report, null, 2) });
    } },
  };
}
