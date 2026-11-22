const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { startV1Server, withBrowser, login, assertNoOverflow } = require('./lib/v1.cjs');

const SHOT_DIR = '/home/ubuntu/.hermes/cache/scratch/calendar-visual';
const DAY_MS = 86_400_000;

function dayNumber(key) {
  const [year, month, day] = key.split('-').map(Number);
  return Date.UTC(year, month - 1, day) / DAY_MS;
}
function addDays(key, amount) {
  return new Date((dayNumber(key) + amount) * DAY_MS).toISOString().slice(0, 10);
}
function diffDays(from, to) {
  return dayNumber(to) - dayNumber(from);
}

async function rangeOf(locator) {
  const title = await locator.getAttribute('title');
  const match = /(\d{4}-\d{2}-\d{2}) → (\d{4}-\d{2}-\d{2})/.exec(title ?? '');
  assert.ok(match, `任务条标题缺少日期范围: ${title}`);
  return { start: match[1], end: match[2] };
}

async function cellCenter(page, key) {
  const box = await page.locator(`.calendar-month-day[data-date="${key}"]`).boundingBox();
  assert.ok(box, `找不到日期格 ${key}`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** 与 MonthView 的 dayKeyAtPoint 同一套几何：纵向锁周行，横向 7 等分取列。 */
async function dayAtPoint(page, x, y) {
  return page.evaluate(({ px, py }) => {
    const weeks = [...document.querySelectorAll('.calendar-month-week')];
    const row = weeks.find(week => {
      const rect = week.getBoundingClientRect();
      return py >= rect.top && py <= rect.bottom;
    });
    if (!row) return null;
    const rect = row.getBoundingClientRect();
    const column = Math.min(6, Math.max(0, Math.floor(((px - rect.left) / rect.width) * 7)));
    return row.querySelectorAll('.calendar-month-day[data-date]')[column]?.dataset.date ?? null;
  }, { px: x, py: y });
}

async function waitForRange(page, taskId, expected) {
  await page.waitForFunction(({ id, start, end }) => {
    const element = document.querySelector(`.calendar-project-bar[data-task-id="${id}"]`);
    const title = element?.getAttribute('title') ?? '';
    return title.includes(`${start} → ${end}`);
  }, { id: taskId, start: expected.start, end: expected.end });
}

function scheduleResponse(page) {
  return page.waitForResponse(response => response.request().method() === 'POST'
    && /\/api\/tasks\/[^/]+\/schedule$/.test(response.url()));
}

(async () => {
  const hub = await startV1Server({ tasks: true });
  try {
    await withBrowser(async page => {
      await login(page, hub);
      await page.getByRole('button', { name: '日历', exact: true }).click();
      await page.locator('.calendar-month-view').waitFor();
      const today = await page.locator('.calendar-page').getAttribute('data-today');
      assert.ok(today, '缺少 data-today');
      fs.mkdirSync(SHOT_DIR, { recursive: true });
      let scheduleCalls = 0;
      page.on('request', request => {
        if (request.method() === 'POST' && /\/api\/tasks\/[^/]+\/schedule$/.test(request.url())) scheduleCalls += 1;
      });

      // ---- 1000px：整体拖动（保持时长） ----
      // 交付任务跨周边界，取第二段（周一单列）作为抓手；标题仍带完整任务范围。
      const bar = page.locator('.calendar-project-bar[data-task-id]').filter({ hasText: 'E2E交付任务' }).last();
      await bar.waitFor();
      const taskId = await bar.getAttribute('data-task-id');
      const before = await rangeOf(bar);
      const barBox = await bar.boundingBox();
      assert.ok(barBox);
      const grabX = barBox.x + barBox.width / 2;
      const grabY = barBox.y + barBox.height / 2;
      const anchor = await dayAtPoint(page, grabX, grabY);
      assert.ok(anchor, '找不到起点日期格');
      const target = addDays(anchor, 2);
      const targetPoint = await cellCenter(page, target);
      const delta = diffDays(anchor, target);

      await page.mouse.move(grabX, grabY);
      await page.mouse.down();
      await page.mouse.move(grabX + 10, grabY, { steps: 2 });
      await page.locator('.calendar-drag-ghost').waitFor();
      await page.mouse.move(targetPoint.x, targetPoint.y, { steps: 12 });
      await page.locator('.calendar-drag-ghost').waitFor();
      assert.equal(await page.locator(`.calendar-month-day[data-date="${target}"]`).getAttribute('data-drop-target'), 'true');
      assert.equal(await page.locator('[role="dialog"].drawer').count(), 0, '拖拽中不应弹出详情/新建抽屉');
      assert.equal(await page.locator('.calendar-overflow-popover').count(), 0, '拖拽中不应弹 +N popover');
      await assertNoOverflow(page);
      await page.screenshot({ path: path.join(SHOT_DIR, 'drag-ghost-1000.png') });

      const firstResponse = scheduleResponse(page);
      await page.mouse.up();
      const first = await firstResponse;
      assert.equal(first.status(), 200, await first.text());
      const firstPayload = first.request().postDataJSON();
      const moved = { start: addDays(before.start, delta), end: addDays(before.end, delta) };
      assert.deepEqual({ start: firstPayload.plannedStart, end: firstPayload.plannedEnd }, moved);
      assert.equal(typeof firstPayload.expectedRevision, 'number');

      await waitForRange(page, taskId, moved);
      const movedBar = page.locator(`.calendar-project-bar[data-task-id="${taskId}"]`).first();
      assert.deepEqual(await rangeOf(movedBar), moved);
      const movedBox = await movedBar.boundingBox();
      assert.ok(movedBox.x > barBox.x, '条带应向右移动');
      assert.equal(await page.locator('[role="dialog"].drawer').count(), 0, '拖拽结束不应误开详情');
      await assertNoOverflow(page);
      await page.screenshot({ path: path.join(SHOT_DIR, 'drag-result-1000.png') });

      // ---- 刷新后仍然生效（落库而非仅前端 state） ----
      await page.reload();
      await page.locator('.console-shell').waitFor();
      await page.getByRole('button', { name: '日历', exact: true }).click();
      await page.locator('.calendar-month-view').waitFor();
      const reloaded = page.locator(`.calendar-project-bar[data-task-id="${taskId}"]`).first();
      await reloaded.waitFor();
      assert.deepEqual(await rangeOf(reloaded), moved);

      // ---- 跨周任务：右端拉伸一天后仍渲染 2 段 ----
      const across = page.locator('.calendar-project-bar[data-task-id]').filter({ hasText: 'E2E跨周任务' });
      await across.first().waitFor();
      assert.equal(await across.count(), 2);
      const acrossId = await across.first().getAttribute('data-task-id');
      const second = across.last();
      const acrossRange = await rangeOf(second);
      const secondBox = await second.boundingBox();
      assert.ok(secondBox);
      const newEnd = addDays(acrossRange.end, -1);
      const endPoint = await cellCenter(page, newEnd);
      await page.mouse.move(secondBox.x + secondBox.width - 3, secondBox.y + secondBox.height / 2);
      await page.mouse.down();
      await page.mouse.move(secondBox.x + secondBox.width - 24, secondBox.y + secondBox.height / 2, { steps: 3 });
      await page.locator('.calendar-drag-ghost').waitFor();
      assert.equal(await page.locator('.calendar-drag-ghost').getAttribute('data-mode'), 'resize-end');
      await page.mouse.move(endPoint.x, endPoint.y, { steps: 10 });
      const resizeResponse = scheduleResponse(page);
      await page.mouse.up();
      const resized = await resizeResponse;
      assert.equal(resized.status(), 200, await resized.text());
      const resizePayload = resized.request().postDataJSON();
      assert.deepEqual({ start: resizePayload.plannedStart, end: resizePayload.plannedEnd },
        { start: acrossRange.start, end: newEnd });
      await waitForRange(page, acrossId, { start: acrossRange.start, end: newEnd });
      assert.equal(await across.count(), 2, '跨周任务拉伸后应仍渲染 2 段');
      await page.screenshot({ path: path.join(SHOT_DIR, 'drag-crossweek-1000.png') });

      // ---- 左端拉伸一天 + Esc 取消 ----
      const startBar = page.locator(`.calendar-project-bar[data-task-id="${taskId}"]`).first();
      const startBefore = await rangeOf(startBar);
      const startBox = await startBar.boundingBox();
      assert.ok(startBox);
      const newStart = addDays(startBefore.start, 1);
      const startPoint = await cellCenter(page, newStart);
      await page.mouse.move(startBox.x + 3, startBox.y + startBox.height / 2);
      await page.mouse.down();
      await page.mouse.move(startBox.x + 16, startBox.y + startBox.height / 2, { steps: 3 });
      await page.locator('.calendar-drag-ghost').waitFor();
      assert.equal(await page.locator('.calendar-drag-ghost').getAttribute('data-mode'), 'resize-start');
      await page.mouse.move(startPoint.x, startPoint.y, { steps: 10 });
      const startResponse = scheduleResponse(page);
      await page.mouse.up();
      const startResized = await startResponse;
      assert.equal(startResized.status(), 200, await startResized.text());
      const startPayload = startResized.request().postDataJSON();
      assert.deepEqual({ start: startPayload.plannedStart, end: startPayload.plannedEnd },
        { start: newStart, end: startBefore.end });
      await waitForRange(page, taskId, { start: newStart, end: startBefore.end });

      const escBar = page.locator('.calendar-project-bar[data-task-id]').filter({ hasText: 'E2E他人任务' }).first();
      const escBefore = await rangeOf(escBar);
      const escBox = await escBar.boundingBox();
      assert.ok(escBox);
      const escTarget = await cellCenter(page, addDays(today, 3));
      const callsBeforeEscape = scheduleCalls;
      await page.mouse.move(escBox.x + escBox.width / 2, escBox.y + escBox.height / 2);
      await page.mouse.down();
      await page.mouse.move(escBox.x + escBox.width / 2 + 10, escBox.y + escBox.height / 2, { steps: 2 });
      await page.mouse.move(escTarget.x, escTarget.y, { steps: 10 });
      await page.locator('.calendar-drag-ghost').waitFor();
      await page.keyboard.press('Escape');
      await page.locator('.calendar-drag-ghost').waitFor({ state: 'detached' });
      await page.mouse.up();
      await page.waitForTimeout(250);
      assert.equal(scheduleCalls, callsBeforeEscape, 'Esc 取消不应发请求');
      assert.deepEqual(await rangeOf(escBar), escBefore, 'Esc 取消后日期不应变');
      assert.equal(await page.locator('[role="dialog"].drawer').count(), 0, 'Esc 取消不应误开详情');
      await assertNoOverflow(page);

      // ---- 409：乐观更新回滚 + 可见提示 ----
      const conflictTaskId = await escBar.getAttribute('data-task-id');
      const listed = await hub.api('admin', 'GET', '/api/tasks');
      assert.equal(listed.statusCode, 200);
      const current = listed.json().tasks.find(item => item.id === conflictTaskId);
      const bumped = await hub.api('admin', 'POST', `/api/tasks/${conflictTaskId}/edit`, {
        expectedRevision: current.revision, title: current.title,
      });
      assert.equal(bumped.statusCode, 200, bumped.body);
      assert.equal(bumped.json().task.revision, current.revision + 1);
      const conflictBox = await escBar.boundingBox();
      assert.ok(conflictBox);
      const conflictTarget = await cellCenter(page, addDays(today, 4));
      await page.mouse.move(conflictBox.x + conflictBox.width / 2, conflictBox.y + conflictBox.height / 2);
      await page.mouse.down();
      await page.mouse.move(conflictBox.x + conflictBox.width / 2 + 10, conflictBox.y + conflictBox.height / 2, { steps: 2 });
      await page.mouse.move(conflictTarget.x, conflictTarget.y, { steps: 10 });
      await page.locator('.calendar-drag-ghost').waitFor();
      const conflictResponse = scheduleResponse(page);
      await page.mouse.up();
      const conflicted = await conflictResponse;
      assert.equal(conflicted.status(), 409, await conflicted.text());
      await page.locator('.global-toast').filter({ hasText: '任务已被他人更新' }).waitFor();
      await page.waitForTimeout(150);
      assert.deepEqual(await rangeOf(escBar), escBefore, '409 后应回滚到旧日期');
      assert.equal(await page.locator('[role="dialog"].drawer').count(), 0, '409 不应误开详情');

      // ---- 1440px：再次整体拖动，验证宽屏可用 ----
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.waitForTimeout(200);
      const wideBar = page.locator(`.calendar-project-bar[data-task-id="${taskId}"]`).first();
      const wideBefore = await rangeOf(wideBar);
      const wideBox = await wideBar.boundingBox();
      assert.ok(wideBox);
      const wideGrabX = wideBox.x + wideBox.width / 2;
      const wideGrabY = wideBox.y + wideBox.height / 2;
      const wideAnchor = await dayAtPoint(page, wideGrabX, wideGrabY);
      assert.ok(wideAnchor);
      const wideTarget = addDays(wideAnchor, 2);
      const wideDelta = diffDays(wideAnchor, wideTarget);
      const widePoint = await cellCenter(page, wideTarget);
      await page.mouse.move(wideGrabX, wideGrabY);
      await page.mouse.down();
      await page.mouse.move(wideGrabX + 12, wideGrabY, { steps: 2 });
      await page.locator('.calendar-drag-ghost').waitFor();
      await page.mouse.move(widePoint.x, widePoint.y, { steps: 12 });
      await page.locator('.calendar-drag-ghost').waitFor();
      assert.equal(await page.locator(`.calendar-month-day[data-date="${wideTarget}"]`).getAttribute('data-drop-target'), 'true');
      await assertNoOverflow(page);
      await page.screenshot({ path: path.join(SHOT_DIR, 'drag-ghost-1440.png') });
      const wideResponse = scheduleResponse(page);
      await page.mouse.up();
      const wide = await wideResponse;
      assert.equal(wide.status(), 200, await wide.text());
      const wideMoved = { start: addDays(wideBefore.start, wideDelta), end: addDays(wideBefore.end, wideDelta) };
      await waitForRange(page, taskId, wideMoved);
      assert.deepEqual(await rangeOf(page.locator(`.calendar-project-bar[data-task-id="${taskId}"]`).first()), wideMoved);
      await assertNoOverflow(page);
      await page.screenshot({ path: path.join(SHOT_DIR, 'drag-result-1440.png') });
    });
    console.log('PASS calendar-drag: move keeps duration, 200 + persisted after reload, cross-week still 2 segments, resize both edges, Esc cancel, 409 rollback + toast, ghost/target highlight, 1000px & 1440px');
  } finally { await hub.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
