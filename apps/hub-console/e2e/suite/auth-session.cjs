const assert = require('node:assert/strict');
const { startV1Server, withBrowser, login, PASSWORDS } = require('./lib/v1.cjs');

(async () => {
  const hub = await startV1Server();
  try {
    await withBrowser(async page => {
      await page.goto(hub.baseUrl);
      await page.locator('.auth-gate__username').fill('owner');
      await page.locator('.auth-gate__pin').fill('wrong-password');
      await page.locator('.auth-gate__card button[type="submit"]').click();
      await page.getByText(/登录失败/).waitFor();
      await login(page, hub, 'owner');
      await page.reload();
      await page.locator('.console-shell').waitFor();
      assert.equal(await page.locator('.auth-gate').count(), 0);
      await page.getByRole('button', { name: '设置', exact: true }).click();
      await page.getByRole('button', { name: '登出', exact: true }).click();
      await page.locator('.auth-gate').waitFor();
      await login(page, hub, 'owner', PASSWORDS.owner);
    });
    await withBrowser(async page => {
      await page.goto(hub.baseUrl);
      await page.locator('.auth-gate__username').fill('newbie');
      await page.locator('.auth-gate__card button[type="submit"]').click();
      await page.locator('.auth-gate__pin').first().waitFor();
      const pins = page.locator('.auth-gate__pin');
      await pins.nth(0).fill('newbie-password');
      await pins.nth(1).fill('newbie-password');
      await page.locator('.auth-gate__card button[type="submit"]').click();
      await page.locator('.console-shell').waitFor();
    });
    console.log('PASS auth-session: bad PIN, persistent session, logout, first-login PIN');
  } finally { await hub.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
