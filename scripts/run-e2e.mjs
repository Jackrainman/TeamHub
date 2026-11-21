import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const suites = ['auth-session', 'task-lifecycle', 'calendar', 'reimburse-workflow', 'reimburse-scope', 'reimburse-finance-layouts', 'reimburse-import-v2', 'reimburse-review-preview', 'settings-rail'];
const root = fileURLToPath(new URL('..', import.meta.url));
const consoleDir = path.join(root, 'apps', 'hub-console');
const suiteDir = path.join(consoleDir, 'e2e', 'suite');
const filter = process.argv[2];
const selected = filter ? suites.filter(suite => suite === filter) : suites;
if (selected.length === 0) throw new Error(`unknown e2e suite: ${filter}`);
function run(suite) {
  return new Promise(resolve => {
    const child = spawn(process.execPath, [path.join(suiteDir, `${suite}.cjs`)], {
      cwd: consoleDir, stdio: 'inherit', env: process.env,
    });
    child.on('error', error => { console.error(`SPAWN ${suite}: ${error.message}`); resolve(false); });
    child.on('close', (code, signal) => resolve(code === 0 && signal === null));
  });
}
let passed = 0;
const failedSuites = [];
for (const suite of selected) {
  console.log(`RUN ${suite}`);
  if (await run(suite)) { passed += 1; console.log(`PASS ${suite}`); }
  else { failedSuites.push(suite); console.error(`FAIL ${suite}`); }
}
console.log(`E2E SUMMARY total=${selected.length} passed=${passed} failed=${failedSuites.length}`);
for (const suite of failedSuites) console.log(`FAILED ${suite}`);
if (failedSuites.length > 0) process.exitCode = 1;
