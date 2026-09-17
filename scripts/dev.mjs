import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// 本地开发默认使用仓库内隔离目录，不落入服务器的默认生产目录。
const data = path.join(root, 'tmp', 'dev-data');
const env = {
  ...process.env,
  HUB_HOST: process.env.HUB_HOST || '127.0.0.1',
  HUB_PORT: process.env.HUB_PORT || '4177',
  TEAMHUB_DB_FILE: process.env.TEAMHUB_DB_FILE || path.join(data, 'teamhub.sqlite'),
  TEAMHUB_ARTIFACT_FILES_DIR: process.env.TEAMHUB_ARTIFACT_FILES_DIR || path.join(data, 'artifacts'),
  TEAMHUB_EVIDENCE_FILES_DIR: process.env.TEAMHUB_EVIDENCE_FILES_DIR || path.join(data, 'evidence'),
  TEAMHUB_CONSOLE_DIST_DIR: path.join(root, 'apps/hub-console/dist'),
};
if (!env.TEAMHUB_BUILD_ID) {
  env.TEAMHUB_BUILD_ID = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
}
for (const dir of [path.dirname(env.TEAMHUB_DB_FILE), env.TEAMHUB_ARTIFACT_FILES_DIR, env.TEAMHUB_EVIDENCE_FILES_DIR]) mkdirSync(dir, { recursive: true });

let child;
let stopping = false;
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
  stopping = true;
  child?.kill();
});
function run(args) {
  return new Promise((resolve, reject) => {
    child = spawn(process.execPath, args, { cwd: root, env, stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', (code) => resolve(code ?? 1));
  });
}
try {
  if (!process.env.npm_execpath) throw new Error('请使用 npm run dev 启动');
  const built = await run([process.env.npm_execpath, 'run', 'build']);
  if (built !== 0 || stopping) process.exitCode = built || 1;
  else {
    console.log(`开发实例：http://${env.HUB_HOST}:${env.HUB_PORT}；数据库：${env.TEAMHUB_DB_FILE}`);
    let code;
    do { code = await run([path.join(root, 'apps/hub-server/dist/main.js')]); }
    while (code === 42 && !stopping);
    process.exitCode = stopping ? 0 : code;
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
