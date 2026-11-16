import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const suites = [
  'first-login-pin',
  'weekly-workbench',
  'expected-ui',
  'lazy-pages',
  'calendar',
  'reimburse-workflow',
  'right-rail',
  'task-rail',
];

const root = fileURLToPath(new URL('..', import.meta.url));
const consoleDir = path.join(root, 'apps', 'hub-console');
const suiteDir = path.join(consoleDir, 'e2e', 'suite');
const filter = process.argv[2];
const selected = filter ? suites.filter(suite => suite === filter) : suites;

function run(suite) {
  return new Promise(resolve => {
    const child = spawn(process.execPath, [path.join(suiteDir, `${suite}.cjs`)], {
      cwd: consoleDir,
      stdio: 'inherit',
      env: process.env,
    });
    child.on('error', error => console.error(`SPAWN ${suite}: ${error.message}`));
    child.on('close', (code, signal) => resolve(code === 0 && signal === null));
  });
}

let passed = 0;
let flaky = 0;
let failed = 0;
const flakySuites = [];
const failedSuites = [];

for (const suite of selected) {
  console.log(`RUN ${suite}`);
  if (await run(suite)) {
    passed += 1;
    console.log(`PASS ${suite}`);
    continue;
  }

  console.log(`RETRY ${suite}`);
  if (await run(suite)) {
    flaky += 1;
    flakySuites.push(suite);
    console.log(`FLAKY ${suite}`);
  } else {
    failed += 1;
    failedSuites.push(suite);
    console.error(`FAIL ${suite}`);
  }
}

console.log(`E2E SUMMARY total=${selected.length} passed=${passed} flaky=${flaky} failed=${failed}`);
for (const suite of flakySuites) console.log(`FLAKY ${suite}`);
for (const suite of failedSuites) console.log(`FAILED ${suite}`);
if (failed > 0) process.exitCode = 1;
