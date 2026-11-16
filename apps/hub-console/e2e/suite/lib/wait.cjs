/** 轮询 DOM，直到 [role="dialog"] 数量严格等于 n。n=0 时等价于全部 detached。 */
async function expectDialogs(page, n, label = '') {
  try {
    await page.waitForFunction(
      count => document.querySelectorAll('[role="dialog"]').length === count,
      n,
      { timeout: 10000 },
    );
  } catch (error) {
    const current = await page.getByRole('dialog').count();
    throw new Error(`${label || 'dialog count'}: expected ${n}, current ${current}`, { cause: error });
  }
}

/** 等到指定 accessible name 的 dialog 从 DOM 移除（detached，不是 hidden）。 */
async function expectNoDialog(page, name) {
  await page.getByRole('dialog', { name }).waitFor({ state: 'detached' });
}

/** 等所有 Web Animations 结束 + 两帧 rAF，用于截图/布局稳定。 */
async function settle(page) {
  await page.evaluate(() => Promise.all(document.getAnimations().map(a => a.finished.catch(() => {}))));
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
}

module.exports = { expectDialogs, expectNoDialog, settle };
