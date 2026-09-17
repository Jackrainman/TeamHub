import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';

function files(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`备份不接受符号链接：${file}`);
    if (entry.isDirectory()) return files(file);
    if (!entry.isFile()) throw new Error(`备份不接受特殊文件：${file}`);
    return [file];
  });
}
const hash = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');

function checkDatabase(file) {
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    if (db.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok') throw new Error('SQLite 完整性检查失败');
    if (Number(db.prepare('PRAGMA user_version').get().user_version) < 1 ||
        db.prepare("SELECT value FROM meta WHERE key = 'schema_kind'").get()?.value !== 'unified') throw new Error('不是已迁移的统一数据库');
  } finally { db.close(); }
}

export function verifyBackup(directory) {
  const root = path.resolve(directory);
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  for (const [name, expected] of Object.entries(manifest.files)) {
    const file = path.resolve(root, name);
    const relative = path.relative(root, file);
    if (relative.startsWith('..') || path.isAbsolute(relative) || hash(file) !== expected) throw new Error(`备份校验失败：${name}`);
  }
  const actual = files(root).map((f) => path.relative(root, f).split(path.sep).join('/')).filter((f) => f !== 'manifest.json').sort();
  if (JSON.stringify(actual) !== JSON.stringify(Object.keys(manifest.files).sort())) throw new Error('备份文件清单不一致');
  checkDatabase(path.join(root, 'teamhub.sqlite'));
}

// 附件与数据库没有跨文件事务，调用者必须先停止该实例的写入。
export function backupData({ database, artifacts, evidence, destination, stopped }) {
  if (!stopped) throw new Error('完整备份要求实例已停止写入（--stopped）');
  const target = path.resolve(destination);
  for (const source of [database, artifacts, evidence]) {
    const absolute = path.resolve(source);
    if (!fs.existsSync(absolute)) throw new Error(`备份源不存在：${absolute}`);
    const relative = path.relative(absolute, target);
    if (!relative || (!relative.startsWith('..') && !path.isAbsolute(relative))) throw new Error('备份目标不能位于备份源内');
  }
  // 提前检查附件树，拒绝链接到数据边界之外的内容。
  files(artifacts); files(evidence);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.mkdirSync(target);
  const db = new DatabaseSync(database, { readOnly: true });
  try { db.exec(`VACUUM INTO '${path.join(target, 'teamhub.sqlite').replaceAll("'", "''")}'`); }
  finally { db.close(); }
  fs.cpSync(artifacts, path.join(target, 'artifacts'), { recursive: true, errorOnExist: true, force: false });
  fs.cpSync(evidence, path.join(target, 'evidence'), { recursive: true, errorOnExist: true, force: false });
  const manifest = { createdAt: new Date().toISOString(), files: {} };
  for (const file of files(target)) manifest.files[path.relative(target, file).split(path.sep).join('/')] = hash(file);
  fs.writeFileSync(path.join(target, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  verifyBackup(target);
  return target;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2);
    if (args[0] === '--verify' && args[1]) {
      verifyBackup(args[1]);
      console.log('完整备份校验通过');
    } else {
      const [database, artifacts, evidence, destination] = args.filter((arg) => arg !== '--stopped');
      if (![database, artifacts, evidence, destination].every(Boolean)) throw new Error('用法：npm run backup -- <数据库> <图纸目录> <凭证目录> <新备份目录> --stopped；校验：npm run backup -- --verify <备份目录>');
      console.log(`完整备份并校验通过：${backupData({ database, artifacts, evidence, destination, stopped: args.includes('--stopped') })}`);
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
